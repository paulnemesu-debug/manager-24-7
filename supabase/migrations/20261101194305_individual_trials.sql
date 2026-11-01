begin;

-- No automatic age-based erasure is configured. Account deletion cascades these
-- records. Operator mailbox retention is separate from this private database queue.
create schema if not exists private;
create table private.individual_trial_registrations (
  user_id uuid primary key references auth.users(id) on delete cascade,
  verified_email text not null,
  started_at timestamptz not null check (isfinite(started_at)),
  expires_at timestamptz not null check (isfinite(expires_at)),
  last_sign_in_at timestamptz not null,
  restaurant_name text check (length(btrim(restaurant_name)) between 1 and 120),
  registered_at timestamptz,
  terms_version text,
  privacy_version text,
  marketing_opt_in boolean not null default false,
  locale text not null default 'ro' check (locale in ('ro','en')),
  location_id uuid references public.business_locations(id) on delete set null,
  seeded_at timestamptz,
  constraint individual_trial_fixed_window check (expires_at = started_at + interval '240 hours'),
  constraint individual_trial_registration_complete check (
    (registered_at is null and restaurant_name is null and terms_version is null and privacy_version is null)
    or (registered_at is not null and restaurant_name is not null
        and terms_version = '2026-11-01' and privacy_version = '2026-11-01'))
);
create index individual_trial_registered_at_idx on private.individual_trial_registrations(registered_at desc,started_at desc,user_id);
alter table private.individual_trial_registrations enable row level security;
revoke all on private.individual_trial_registrations from public,anon,authenticated,service_role;

create table private.trial_owner_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  payload jsonb not null check (jsonb_typeof(payload)='object'),
  status text not null default 'pending' check (status in ('pending','processing','sent','failed')),
  attempts integer not null default 0 check (attempts >= 0),
  reserved_at timestamptz,
  next_attempt_at timestamptz not null default now(),
  delivered_at timestamptz,
  last_error text,
  created_at timestamptz not null default now()
);
create index trial_owner_notifications_pending_idx on private.trial_owner_notifications(next_attempt_at,created_at) where status <> 'sent';
alter table private.trial_owner_notifications enable row level security;
revoke all on private.trial_owner_notifications from public,anon,authenticated,service_role;

-- Reads only trusted Auth state. Auth owns last_sign_in_at; browser clocks,
-- profile email and user-editable metadata never determine identity or timing.
create or replace function private.observe_individual_trial(p_user_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare
  account auth.users%rowtype;
  first_seen timestamptz;
begin
  select * into account from auth.users where id=p_user_id;
  if not found or account.email_confirmed_at is null or nullif(btrim(account.email),'') is null
     or account.last_sign_in_at is null or not isfinite(account.last_sign_in_at) then
    raise exception 'verified_sign_in_required' using errcode='42501';
  end if;
  first_seen := least(account.last_sign_in_at,clock_timestamp());
  -- Historical grants can only shorten the window, never restart it at rollout.
  select least(first_seen,coalesce(min(s.current_period_start),first_seen)) into first_seen
  from public.subscriptions s where s.user_id=p_user_id
    and (s.product_id like 'manager247_trial_%' or s.product_id like 'manager247_demo_%')
    and s.current_period_start is not null and isfinite(s.current_period_start);
  insert into private.individual_trial_registrations(user_id,verified_email,started_at,expires_at,last_sign_in_at)
  values(p_user_id,lower(btrim(account.email)),first_seen,first_seen+interval '240 hours',account.last_sign_in_at)
  on conflict(user_id) do update set
    verified_email=excluded.verified_email,
    last_sign_in_at=greatest(private.individual_trial_registrations.last_sign_in_at,excluded.last_sign_in_at);
end;
$$;
revoke all on function private.observe_individual_trial(uuid) from public,anon,authenticated,service_role;

create or replace function private.capture_individual_trial_sign_in()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.email_confirmed_at is not null and nullif(btrim(new.email),'') is not null
     and new.last_sign_in_at is not null and isfinite(new.last_sign_in_at) then
    perform private.observe_individual_trial(new.id);
  end if;
  return new;
end;
$$;
revoke all on function private.capture_individual_trial_sign_in() from public,anon,authenticated,service_role;
create trigger on_auth_user_trial_sign_in
  after insert or update of last_sign_in_at,email,email_confirmed_at on auth.users
  for each row execute function private.capture_individual_trial_sign_in();

-- Backfill only private metadata, without changing current accounts, grants or
-- business data. Historical Auth exposes latest sign-in, not a recoverable first
-- sign-in; an existing trial start takes precedence when earlier.
do $$
declare account_id uuid;
begin
  for account_id in select id from auth.users where email_confirmed_at is not null
    and nullif(btrim(email),'') is not null and last_sign_in_at is not null and isfinite(last_sign_in_at)
  loop perform private.observe_individual_trial(account_id); end loop;
end;
$$;

create or replace function private.user_has_nontrial_entitlement(p_user_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
select exists(select 1 from auth.users u where u.id=p_user_id and u.email_confirmed_at is not null and (
  exists(select 1 from public.profiles p where p.user_id=u.id and p.role='admin')
  or exists(select 1 from public.subscriptions s where s.user_id=u.id
    and s.product_id not like 'manager247_trial_%' and s.product_id not like 'manager247_demo_%'
    and s.status in ('active','trialing','grace_period','canceled') and s.current_period_end>clock_timestamp())
));
$$;
revoke all on function private.user_has_nontrial_entitlement(uuid) from public,anon,authenticated,service_role;

create or replace function private.workspace_owner_is_entitled(target_owner uuid)
returns boolean language sql stable security definer set search_path='' as $$
select private.user_has_nontrial_entitlement(target_owner) or exists (
  select 1 from private.individual_trial_registrations r
  join auth.users u on u.id=r.user_id
  join public.subscriptions s on s.user_id=r.user_id
  where r.user_id=target_owner and u.email_confirmed_at is not null
    and r.registered_at is not null and r.terms_version='2026-11-01' and r.privacy_version='2026-11-01'
    and r.expires_at>clock_timestamp() and s.product_id='manager247_trial_10d'
    and s.status in ('active','trialing','grace_period','canceled')
    and s.current_period_start=r.started_at and s.current_period_end=r.expires_at
);
$$;
revoke all on function private.workspace_owner_is_entitled(uuid) from public,anon,authenticated,service_role;
create or replace function private.current_user_has_individual_access()
returns boolean language sql stable security definer set search_path='' as $$
  select (select auth.uid()) is not null and private.workspace_owner_is_entitled((select auth.uid()));
$$;
revoke all on function private.current_user_has_individual_access() from public,anon,authenticated,service_role;
grant usage on schema private to authenticated;
grant execute on function private.current_user_has_individual_access() to authenticated;
create or replace function public.has_professional_access()
returns boolean language sql stable security invoker set search_path='' as $$
select (select auth.uid()) is not null and (
  private.current_user_has_individual_access()
  or exists(select 1 from public.workspace_members wm where wm.member_user_id=(select auth.uid())
    and wm.status='active' and public.is_active_viewer_of(wm.owner_user_id))
);
$$;
revoke all on function public.has_professional_access() from public,anon;
grant execute on function public.has_professional_access() to authenticated;

-- Public wrappers use SECURITY INVOKER. Narrow private implementations bind all
-- operations to auth.uid(), while tables and arbitrary-target helpers stay closed.
create or replace function private.get_my_trial_registration()
returns jsonb language plpgsql security definer set search_path='' set timezone='UTC' as $$
declare
  caller uuid := (select auth.uid());
  registration private.individual_trial_registrations%rowtype;
  bypass boolean;
begin
  if caller is null then raise exception 'Authentication required' using errcode='42501'; end if;
  perform private.observe_individual_trial(caller);
  select * into registration from private.individual_trial_registrations where user_id=caller;
  bypass := private.user_has_nontrial_entitlement(caller)
    or exists(select 1 from public.subscriptions s where s.user_id=caller
      and s.product_id not like 'manager247_trial_%' and s.product_id not like 'manager247_demo_%')
    or exists(select 1 from public.workspace_members wm where wm.member_user_id=caller
      and wm.status='active' and public.is_active_viewer_of(wm.owner_user_id));
  return jsonb_build_object('registered',registration.registered_at is not null,'eligible',not bypass,
    'restaurant_name',registration.restaurant_name,'started_at',registration.started_at,'expires_at',registration.expires_at,
    'registered_at',registration.registered_at,'last_sign_in_at',registration.last_sign_in_at,'location_id',registration.location_id,
    'terms_version',registration.terms_version,'privacy_version',registration.privacy_version,'marketing_opt_in',registration.marketing_opt_in);
end;
$$;
revoke all on function private.get_my_trial_registration() from public,anon,authenticated,service_role;
grant execute on function private.get_my_trial_registration() to authenticated;
create or replace function public.get_my_trial_registration()
returns jsonb language sql security invoker set search_path='' as $$select private.get_my_trial_registration();$$;
revoke all on function public.get_my_trial_registration() from public,anon,authenticated,service_role;
grant execute on function public.get_my_trial_registration() to authenticated;

-- Seed only a workspace with no operational rows in any owner-keyed public
-- table, including HR/HACCP modules. New modules inherit this guard automatically.
create or replace function private.user_workspace_has_data(p_user_id uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare candidate record; has_rows boolean;
begin
  for candidate in
    select n.nspname,c.relname,a.attname from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid=c.relnamespace
    join pg_catalog.pg_attribute a on a.attrelid=c.oid
    where n.nspname='public' and c.relkind in ('r','p') and not a.attisdropped
      and a.attname in ('user_id','owner_user_id') and a.atttypid='uuid'::regtype
      and c.relname not in ('profiles','subscriptions','product_events','user_preferences')
  loop
    execute format('select exists(select 1 from %I.%I where %I=$1)',candidate.nspname,candidate.relname,candidate.attname)
      into has_rows using p_user_id;
    if has_rows then return true; end if;
  end loop;
  return false;
end;
$$;
revoke all on function private.user_workspace_has_data(uuid) from public,anon,authenticated,service_role;

create or replace function private.complete_my_trial_registration(
  p_restaurant_name text,p_terms_version text,p_privacy_version text,p_marketing_opt_in boolean default false,p_locale text default 'ro')
returns jsonb language plpgsql security definer set search_path='' set timezone='UTC' as $$
declare
  caller uuid := (select auth.uid());
  registration private.individual_trial_registrations%rowtype;
  current_grant public.subscriptions%rowtype;
  current_state jsonb;
  accepted_at timestamptz := clock_timestamp();
  new_location uuid;
  recipe uuid;
  tomato uuid;
  oil uuid;
  fresh_workspace boolean;
begin
  if caller is null then raise exception 'Authentication required' using errcode='42501'; end if;
  -- Same account lock as Google Play receipt application prevents a trial racing
  -- a verified paid purchase from overwriting the paid entitlement.
  perform pg_advisory_xact_lock(hashtextextended('google_play:user:'||caller::text,0));
  current_state := private.get_my_trial_registration();
  if not (current_state->>'eligible')::boolean then return current_state; end if;
  select * into registration from private.individual_trial_registrations where user_id=caller for update;
  if registration.registered_at is not null then return current_state; end if;
  if p_terms_version is distinct from '2026-11-01' or p_privacy_version is distinct from '2026-11-01' then
    raise exception 'current_legal_versions_required' using errcode='22023';
  end if;
  if p_restaurant_name is null or length(btrim(p_restaurant_name)) not between 1 and 120
     or p_restaurant_name ~ '[[:cntrl:]]' then
    raise exception 'restaurant_name_required' using errcode='22023';
  end if;
  if p_locale is null or p_locale not in ('ro','en') then raise exception 'legal_locale_required' using errcode='22023'; end if;
  if registration.verified_email='demo@paradim.ro' then raise exception 'individual_verified_email_required' using errcode='42501'; end if;
  select * into current_grant from public.subscriptions where user_id=caller for update;
  -- Existing nontrial grants, even expired, remain owned by their billing system.
  -- They can be replaced only by a real verified purchase, never this free RPC.
  if found and current_grant.product_id not like 'manager247_trial_%' and current_grant.product_id not like 'manager247_demo_%' then
    return current_state || jsonb_build_object('eligible',false);
  end if;
  perform pg_advisory_xact_lock(hashtextextended(caller::text,0));
  fresh_workspace := not private.user_workspace_has_data(caller);
  select id into new_location from public.business_locations where owner_user_id=caller order by created_at,id limit 1;
  if fresh_workspace and registration.expires_at>accepted_at then
    insert into public.business_locations(owner_user_id,name,address)
    values(caller,btrim(p_restaurant_name),'Date fictive pentru evaluare / Fictional evaluation data') returning id into new_location;
    insert into public.ingredient_catalog(user_id,name,normalized_name,purchase_price,price_unit,notes)
    values(caller,'Roșii — exemplu fictiv','trial-example-tomato',8,'kg','Preț fictiv / Fictional price') returning id into tomato;
    insert into public.ingredient_catalog(user_id,name,normalized_name,purchase_price,price_unit,notes)
    values(caller,'Ulei — exemplu fictiv','trial-example-oil',20,'l','Preț fictiv / Fictional price') returning id into oil;
    insert into public.recipes(user_id,title,category,servings,sale_price_gross,vat_percent,total_cost,portion_cost)
    values(caller,'Salată — exemplu fictiv','salad',1,18,11,2.6,2.6) returning id into recipe;
    insert into public.recipe_ingredients(recipe_id,user_id,ingredient_name,normalized_name,quantity_net,unit,purchase_price,price_unit,purchase_quantity,line_cost,ingredient_catalog_id)
    values(recipe,caller,'Roșii — exemplu fictiv','trial-example-tomato',300,'g',8,'kg',0.3,2.4,tomato),
          (recipe,caller,'Ulei — exemplu fictiv','trial-example-oil',10,'ml',20,'l',0.01,0.2,oil);
  end if;
  update private.individual_trial_registrations set restaurant_name=btrim(p_restaurant_name),registered_at=accepted_at,
    terms_version=p_terms_version,privacy_version=p_privacy_version,marketing_opt_in=coalesce(p_marketing_opt_in,false),
    locale=p_locale,location_id=new_location,seeded_at=case when fresh_workspace and registration.expires_at>accepted_at then accepted_at else null end
    where user_id=caller;
  insert into public.subscriptions(user_id,platform,product_id,purchase_token_hash,status,current_period_start,current_period_end,auto_renew,last_verified_at)
  values(caller,'manual','manager247_trial_10d','individual-trial:'||caller::text,
    case when registration.expires_at>accepted_at then 'trialing' else 'expired' end,
    registration.started_at,registration.expires_at,false,accepted_at)
  on conflict(user_id) do update set platform=excluded.platform,product_id=excluded.product_id,purchase_token_hash=excluded.purchase_token_hash,
    status=excluded.status,current_period_start=excluded.current_period_start,current_period_end=excluded.current_period_end,
    auto_renew=false,last_verified_at=excluded.last_verified_at;
  insert into private.trial_owner_notifications(user_id,payload)
  values(caller,jsonb_build_object('user_id',caller,'verified_email',registration.verified_email,'restaurant_name',btrim(p_restaurant_name),
    'started_at',registration.started_at,'expires_at',registration.expires_at,'registered_at',accepted_at)) on conflict(user_id) do nothing;
  return private.get_my_trial_registration();
end;
$$;
revoke all on function private.complete_my_trial_registration(text,text,text,boolean,text) from public,anon,authenticated,service_role;
grant execute on function private.complete_my_trial_registration(text,text,text,boolean,text) to authenticated;
create or replace function public.complete_my_trial_registration(
  p_restaurant_name text,p_terms_version text,p_privacy_version text,p_marketing_opt_in boolean default false,p_locale text default 'ro')
returns jsonb language sql security invoker set search_path='' as $$
  select private.complete_my_trial_registration(p_restaurant_name,p_terms_version,p_privacy_version,p_marketing_opt_in,p_locale);
$$;
revoke all on function public.complete_my_trial_registration(text,text,text,boolean,text) from public,anon,authenticated,service_role;
grant execute on function public.complete_my_trial_registration(text,text,text,boolean,text) to authenticated;

create or replace function private.admin_list_trial_users(p_limit integer default 50,p_offset integer default 0)
returns jsonb language plpgsql security definer set search_path='' set timezone='UTC' as $$
begin
  if not exists(select 1 from auth.users u join public.profiles p on p.user_id=u.id
      where u.id=(select auth.uid()) and u.email_confirmed_at is not null and p.role='admin') then
    raise exception 'admin_required' using errcode='42501';
  end if;
  return (select coalesce(jsonb_agg(to_jsonb(result)),'[]'::jsonb) from (
    select r.user_id,lower(btrim(u.email)) as verified_email,r.restaurant_name,r.started_at,r.expires_at,r.registered_at,
      u.last_sign_in_at,r.marketing_opt_in,
      case
        when exists(select 1 from public.profiles p where p.user_id=r.user_id and p.role='admin') then 'admin'
        when private.user_has_nontrial_entitlement(r.user_id) then 'subscribed'
        when r.registered_at is null then 'pending_registration'
        when r.expires_at<=clock_timestamp() then 'expired' else 'active' end status
    from private.individual_trial_registrations r join auth.users u on u.id=r.user_id
    where u.email_confirmed_at is not null
      and (r.registered_at is not null or (
        not exists(select 1 from public.profiles p where p.user_id=r.user_id and p.role='admin')
        and not exists(select 1 from public.subscriptions s where s.user_id=r.user_id
          and s.product_id not like 'manager247_trial_%' and s.product_id not like 'manager247_demo_%')
      ))
    order by r.registered_at desc nulls last,r.started_at desc,r.user_id
    limit greatest(1,least(coalesce(p_limit,50),200)) offset greatest(coalesce(p_offset,0),0)
  ) result);
end;
$$;
revoke all on function private.admin_list_trial_users(integer,integer) from public,anon,authenticated,service_role;
grant execute on function private.admin_list_trial_users(integer,integer) to authenticated;
create or replace function public.admin_list_trial_users(p_limit integer default 50,p_offset integer default 0)
returns jsonb language sql security invoker set search_path='' as $$select private.admin_list_trial_users(p_limit,p_offset);$$;
revoke all on function public.admin_list_trial_users(integer,integer) from public,anon,authenticated,service_role;
grant execute on function public.admin_list_trial_users(integer,integer) to authenticated;

create or replace function public.claim_trial_owner_notifications(p_limit integer default 20)
returns jsonb language plpgsql security definer set search_path='' set timezone='UTC' as $$
declare result jsonb;
begin
  with selected as (
    select id from private.trial_owner_notifications where status<>'sent' and next_attempt_at<=clock_timestamp()
      and (status<>'processing' or reserved_at<clock_timestamp()-interval '5 minutes')
    order by created_at,id limit greatest(1,least(coalesce(p_limit,20),50)) for update skip locked
  ), claimed as (
    update private.trial_owner_notifications q set status='processing',reserved_at=clock_timestamp(),attempts=attempts+1
    from selected where q.id=selected.id returning q.*
  ) select coalesce(jsonb_agg(payload||jsonb_build_object('id',id,'attempt',attempts,'reserved_at',reserved_at)),'[]'::jsonb) into result from claimed;
  return result;
end;
$$;
revoke all on function public.claim_trial_owner_notifications(integer) from public,anon,authenticated,service_role;
grant execute on function public.claim_trial_owner_notifications(integer) to service_role;
create or replace function public.finish_trial_owner_notification(p_id uuid,p_reserved_at timestamptz,p_delivered boolean,p_error text default null)
returns boolean language plpgsql security definer set search_path='' as $$
declare affected integer;
begin
  update private.trial_owner_notifications set
    status=case when p_delivered then 'sent' else 'failed' end,
    delivered_at=case when p_delivered then clock_timestamp() else null end,
    last_error=case when p_delivered then null else left(coalesce(p_error,'provider_unavailable'),100) end,
    next_attempt_at=clock_timestamp()+interval '15 minutes'
  where id=p_id and status='processing' and reserved_at=p_reserved_at;
  get diagnostics affected=row_count;
  return affected=1;
end;
$$;
revoke all on function public.finish_trial_owner_notification(uuid,timestamptz,boolean,text) from public,anon,authenticated,service_role;
grant execute on function public.finish_trial_owner_notification(uuid,timestamptz,boolean,text) to service_role;

-- Retire legacy free grants without touching paid/admin records or deleting any
-- existing data. Older app RPCs cannot create or extend a second trial window.
do $$
declare fn regprocedure;
begin
  for fn in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in ('start_my_trial','extend_my_demo_after_otp')
  loop execute format('revoke all on function %s from public,anon,authenticated',fn); end loop;
end;
$$;

-- Add an AND boundary to existing ownership/workspace policies. Account,
-- billing, membership, legal/deletion support and preferences stay reachable.
-- No permissive ownership policy is broadened or replaced.
do $$
declare operational_table record;
begin
  for operational_table in
    select distinct c.relname,c.relrowsecurity from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid=c.relnamespace
    join pg_catalog.pg_attribute a on a.attrelid=c.oid
    where n.nspname='public' and c.relkind in ('r','p') and not a.attisdropped
      and a.attname in ('user_id','owner_user_id') and a.atttypid='uuid'::regtype
      and c.relname not in ('profiles','subscriptions','workspace_members','product_events','user_preferences')
  loop
    if not operational_table.relrowsecurity then
      raise exception 'Operational table % requires existing ownership RLS before trial rollout',operational_table.relname;
    end if;
    execute format('create policy individual_trial_access_gate on public.%I as restrictive for all to authenticated using ((select public.has_professional_access())) with check ((select public.has_professional_access()))',operational_table.relname);
  end loop;
end;
$$;

-- Owner-approved primary address. The existing verified-identity Auth trigger
-- consults this private allowlist; unconfirmed signups receive no admin grant.
insert into private.admin_emails(email,note)
values('admin@paradimoperations.com','PARADIM Operations primary owner contact')
on conflict(email) do nothing;
do $$
declare owner_id uuid;
begin
  for owner_id in select id from auth.users
    where lower(btrim(email))='admin@paradimoperations.com' and email_confirmed_at is not null
  loop
    perform pg_advisory_xact_lock(hashtextextended('google_play:user:'||owner_id::text,0));
    perform private.grant_admin_access(owner_id);
  end loop;
end;
$$;

notify pgrst,'reload schema';
commit;
