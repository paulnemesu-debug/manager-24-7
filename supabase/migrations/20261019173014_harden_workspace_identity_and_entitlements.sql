begin;

-- Only a directly entitled, verified owner may sponsor a workspace. Inherited
-- membership must never be used to build an unlimited chain of paid access.
create or replace function private.workspace_owner_is_entitled(target_owner uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from auth.users u
    where u.id = target_owner and u.email_confirmed_at is not null
      and (
        exists (select 1 from public.profiles p where p.user_id = u.id and p.role = 'admin')
        or exists (
          select 1 from public.subscriptions s where s.user_id = u.id
            and s.status in ('active', 'trialing', 'grace_period', 'canceled')
            and s.current_period_end > now()
        )
      )
  );
$$;
revoke all on function private.workspace_owner_is_entitled(uuid) from public, anon, authenticated;

-- Quarantine historical bindings that were created using editable profile
-- emails or before Auth confirmed the recipient's address. Never grant access
-- merely because a formerly invalid row exists.
update public.workspace_members
set member_user_id = null, status = 'revoked'
where member_user_id = owner_user_id;
update public.workspace_members wm
set member_user_id = null,
    status = case when wm.status = 'revoked' then 'revoked' else 'pending' end
where (wm.status = 'active' or wm.member_user_id is not null)
  and not exists (
    select 1 from auth.users u
    where u.id = wm.member_user_id and u.email_confirmed_at is not null
      and lower(btrim(u.email)) = lower(btrim(wm.invited_email))
  );
alter table public.workspace_members
  add constraint workspace_members_no_self check (member_user_id is null or member_user_id <> owner_user_id),
  add constraint workspace_members_active_identity check (status <> 'active' or member_user_id is not null);
create index if not exists workspace_members_pending_email_idx
  on public.workspace_members (lower(btrim(invited_email))) where status = 'pending';

-- A caller can inspect only its own memberships and revoke invitations it
-- owns. Activation, identity, role and invitation creation are service-only.
drop policy if exists workspace_members_owner_all on public.workspace_members;
drop policy if exists workspace_members_self_select on public.workspace_members;
drop policy if exists workspace_members_select_related on public.workspace_members;
drop policy if exists workspace_members_insert_owner on public.workspace_members;
drop policy if exists workspace_members_update_owner on public.workspace_members;
drop policy if exists workspace_members_delete_owner on public.workspace_members;
create policy workspace_members_select_related on public.workspace_members
  for select to authenticated
  using ((select auth.uid()) = owner_user_id or (select auth.uid()) = member_user_id);
create policy workspace_members_revoke_owner on public.workspace_members
  for update to authenticated
  using ((select auth.uid()) = owner_user_id)
  with check ((select auth.uid()) = owner_user_id and status = 'revoked');
revoke all on table public.workspace_members from anon, authenticated;
-- Table-level REVOKE does not remove any historical column grants.
revoke insert (id,owner_user_id,member_user_id,invited_email,role,status,created_at,updated_at,invite_sent_at,invite_delivery,invite_error),
       update (id,owner_user_id,member_user_id,invited_email,role,status,created_at,updated_at,invite_sent_at,invite_delivery,invite_error)
  on public.workspace_members from anon, authenticated;
grant select on public.workspace_members to authenticated;
grant update (status) on public.workspace_members to authenticated;

create or replace function private.current_user_has_workspace_access(target_owner uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select (select auth.uid()) is not null
    and target_owner <> (select auth.uid())
    and private.workspace_owner_is_entitled(target_owner)
    and exists (
      select 1 from public.workspace_members wm
      join auth.users u on u.id = wm.member_user_id
      where wm.owner_user_id = target_owner and wm.member_user_id = (select auth.uid())
        and wm.status = 'active' and u.email_confirmed_at is not null
        and lower(btrim(u.email)) = lower(btrim(wm.invited_email))
    );
$$;
revoke all on function private.current_user_has_workspace_access(uuid) from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.current_user_has_workspace_access(uuid) to authenticated;

create or replace function public.is_active_viewer_of(target_owner uuid)
returns boolean language sql stable security invoker set search_path = '' as $$
  select private.current_user_has_workspace_access(target_owner);
$$;
revoke all on function public.is_active_viewer_of(uuid) from public, anon;
grant execute on function public.is_active_viewer_of(uuid) to authenticated;

create or replace function public.has_professional_access()
returns boolean language sql stable security invoker set search_path = '' as $$
  select (select auth.uid()) is not null and (
    exists (select 1 from public.profiles p where p.user_id = (select auth.uid()) and p.role = 'admin')
    or exists (
      select 1 from public.subscriptions s where s.user_id = (select auth.uid())
        and s.status in ('active', 'trialing', 'grace_period', 'canceled')
        and s.current_period_end > now()
    )
    or exists (
      select 1 from public.workspace_members wm
      where wm.member_user_id = (select auth.uid()) and wm.status = 'active'
        and public.is_active_viewer_of(wm.owner_user_id)
    )
  );
$$;
revoke all on function public.has_professional_access() from public, anon;
grant execute on function public.has_professional_access() to authenticated;

-- Shared image reads must use the same expiry/identity boundary as recipes.
-- Compare the folder as text so malformed object names cannot cause UUID casts.
drop policy if exists recipe_images_select_entitled on storage.objects;
create policy recipe_images_select_entitled on storage.objects
  for select to authenticated using (
    bucket_id = 'recipe-images' and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or exists (
        select 1 from public.workspace_members wm
        where wm.owner_user_id::text = (storage.foldername(name))[1]
          and wm.member_user_id = (select auth.uid())
          and public.is_active_viewer_of(wm.owner_user_id)
      )
    )
  );

-- This RPC is callable by the invitation Edge Function's service client only.
-- Confirmed auth.users email is the identity authority; profiles.email and
-- user-editable metadata are deliberately not consulted. The transaction lock
-- and timestamp reservation prevent concurrent requests bypassing the cooldown.
create or replace function public.prepare_workspace_invitation(p_owner_user_id uuid, p_email text, p_role text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  normalized_email text := lower(btrim(p_email));
  recipient_id uuid;
  membership public.workspace_members%rowtype;
  reserved_at timestamptz := clock_timestamp();
begin
  if normalized_email is null or length(normalized_email) > 254
     or normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
     or p_role is null or p_role not in ('manager', 'head_chef', 'viewer') then
    raise exception using message = 'invalid_invitation', errcode = '22023';
  end if;
  if not private.workspace_owner_is_entitled(p_owner_user_id) then
    raise exception using message = 'owner_not_entitled', errcode = '42501';
  end if;
  if exists (select 1 from auth.users where id = p_owner_user_id and lower(btrim(email)) = normalized_email) then
    raise exception using message = 'cannot_invite_self', errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_owner_user_id::text || ':' || normalized_email, 0));
  select * into membership from public.workspace_members
    where owner_user_id = p_owner_user_id and lower(btrim(invited_email)) = normalized_email
    order by created_at desc, id limit 1 for update;
  if membership.invite_sent_at > reserved_at - interval '60 seconds' then
    raise exception using message = 'invite_rate_limited', errcode = 'P0001';
  end if;
  select id into recipient_id from auth.users
    where lower(btrim(email)) = normalized_email and email_confirmed_at is not null
    order by id limit 1;
  if recipient_id = p_owner_user_id then
    raise exception using message = 'cannot_invite_self', errcode = '22023';
  end if;
  if membership.id is null then
    insert into public.workspace_members(owner_user_id, invited_email, member_user_id, role, status, invite_sent_at)
    values(p_owner_user_id, normalized_email, recipient_id, p_role,
      case when recipient_id is null then 'pending' else 'active' end, reserved_at)
    returning * into membership;
  else
    update public.workspace_members set member_user_id = recipient_id, role = p_role,
      status = case when recipient_id is null then 'pending' else 'active' end,
      invite_sent_at = reserved_at, invite_delivery = null, invite_error = null
    where id = membership.id returning * into membership;
  end if;
  return jsonb_build_object('id', membership.id, 'status', membership.status, 'reserved_at', membership.invite_sent_at);
end;
$$;
revoke all on function public.prepare_workspace_invitation(uuid,text,text) from public, anon, authenticated;
grant execute on function public.prepare_workspace_invitation(uuid,text,text) to service_role;

-- Profile creation remains separate from verified-email effects. This preserves
-- admin grants while preventing a signup with an unverified address claiming one.
create or replace function private.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles(user_id,email) values(new.id,new.email)
  on conflict(user_id) do update set email = excluded.email;
  return new;
end;
$$;
revoke all on function private.handle_new_user() from public, anon, authenticated;

create or replace function private.sync_verified_workspace_identity()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.workspace_members wm
  set member_user_id = null,
      status = case when wm.status = 'revoked' then 'revoked' else 'pending' end
  where wm.member_user_id = new.id
    and (new.email_confirmed_at is null or new.email is null
         or lower(btrim(wm.invited_email)) <> lower(btrim(new.email)));
  if new.email_confirmed_at is not null and new.email is not null then
    if exists(select 1 from private.admin_emails where lower(btrim(email)) = lower(btrim(new.email))) then
      perform private.grant_admin_access(new.id);
    end if;
    update public.workspace_members wm set member_user_id = new.id, status = 'active'
    where wm.status = 'pending' and wm.owner_user_id <> new.id
      and lower(btrim(wm.invited_email)) = lower(btrim(new.email))
      and private.workspace_owner_is_entitled(wm.owner_user_id);
  end if;
  return new;
end;
$$;
revoke all on function private.sync_verified_workspace_identity() from public, anon, authenticated;
drop trigger if exists on_auth_user_email_verified on auth.users;
-- Trigger names sort after on_auth_user_created, so the profile already exists.
create trigger on_auth_user_email_verified
  after insert or update of email,email_confirmed_at on auth.users
  for each row execute function private.sync_verified_workspace_identity();

commit;
