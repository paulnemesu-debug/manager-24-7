begin;

-- Professional FoodCost is a paid authenticated product. The public website
-- calculator remains the free entry point; app data is available only to an
-- administrator or to a subscription with a future entitlement end date.
alter table public.subscriptions
  drop constraint if exists subscriptions_platform_check;

alter table public.subscriptions
  add constraint subscriptions_platform_check
  check (platform in ('google_play', 'admin_grant', 'web', 'manual'));

create or replace function public.has_professional_access()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.user_id = (select auth.uid())
      and (
        p.role = 'admin'
        or exists (
          select 1
          from public.subscriptions s
          where s.user_id = p.user_id
            and s.status in ('active', 'trialing', 'grace_period', 'canceled')
            and s.current_period_end is not null
            and s.current_period_end > now()
        )
      )
  );
$$;

revoke all on function public.has_professional_access() from public, anon;
grant execute on function public.has_professional_access() to authenticated;

-- A modified client can no longer bypass the paywall and write directly to
-- Supabase. Reads are also protected so an expired client cannot reconstruct
-- paid exports outside the application.
drop policy if exists recipes_select_own on public.recipes;
drop policy if exists recipes_insert_own on public.recipes;
drop policy if exists recipes_update_own on public.recipes;
drop policy if exists recipes_delete_own on public.recipes;

create policy recipes_select_entitled on public.recipes
  for select to authenticated
  using ((select auth.uid()) = user_id and (select public.has_professional_access()));
create policy recipes_insert_entitled on public.recipes
  for insert to authenticated
  with check ((select auth.uid()) = user_id and (select public.has_professional_access()));
create policy recipes_update_entitled on public.recipes
  for update to authenticated
  using ((select auth.uid()) = user_id and (select public.has_professional_access()))
  with check ((select auth.uid()) = user_id and (select public.has_professional_access()));
create policy recipes_delete_entitled on public.recipes
  for delete to authenticated
  using ((select auth.uid()) = user_id and (select public.has_professional_access()));

drop policy if exists ingredients_select_own on public.recipe_ingredients;
drop policy if exists ingredients_insert_own on public.recipe_ingredients;
drop policy if exists ingredients_update_own on public.recipe_ingredients;
drop policy if exists ingredients_delete_own on public.recipe_ingredients;
drop policy if exists recipe_ingredients_select_own on public.recipe_ingredients;
drop policy if exists recipe_ingredients_insert_own on public.recipe_ingredients;
drop policy if exists recipe_ingredients_update_own on public.recipe_ingredients;
drop policy if exists recipe_ingredients_delete_own on public.recipe_ingredients;

create policy recipe_ingredients_select_entitled on public.recipe_ingredients
  for select to authenticated
  using ((select auth.uid()) = user_id and (select public.has_professional_access()));
create policy recipe_ingredients_insert_entitled on public.recipe_ingredients
  for insert to authenticated
  with check ((select auth.uid()) = user_id and (select public.has_professional_access()));
create policy recipe_ingredients_update_entitled on public.recipe_ingredients
  for update to authenticated
  using ((select auth.uid()) = user_id and (select public.has_professional_access()))
  with check ((select auth.uid()) = user_id and (select public.has_professional_access()));
create policy recipe_ingredients_delete_entitled on public.recipe_ingredients
  for delete to authenticated
  using ((select auth.uid()) = user_id and (select public.has_professional_access()));

drop policy if exists ingredient_catalog_select_own on public.ingredient_catalog;
drop policy if exists ingredient_catalog_insert_own on public.ingredient_catalog;
drop policy if exists ingredient_catalog_update_own on public.ingredient_catalog;
drop policy if exists ingredient_catalog_delete_own on public.ingredient_catalog;

create policy ingredient_catalog_select_entitled on public.ingredient_catalog
  for select to authenticated
  using ((select auth.uid()) = user_id and (select public.has_professional_access()));
create policy ingredient_catalog_insert_entitled on public.ingredient_catalog
  for insert to authenticated
  with check ((select auth.uid()) = user_id and (select public.has_professional_access()));
create policy ingredient_catalog_update_entitled on public.ingredient_catalog
  for update to authenticated
  using ((select auth.uid()) = user_id and (select public.has_professional_access()))
  with check ((select auth.uid()) = user_id and (select public.has_professional_access()));
create policy ingredient_catalog_delete_entitled on public.ingredient_catalog
  for delete to authenticated
  using ((select auth.uid()) = user_id and (select public.has_professional_access()));

-- Temporary, auditable activation path until the website payment webhook is
-- connected. These functions are deliberately unavailable through the API.
create table if not exists private.subscription_access_audit (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  action text not null check (action in ('activate', 'deactivate')),
  platform text not null,
  product_id text not null,
  period_end timestamptz,
  note text,
  actor text not null default session_user,
  created_at timestamptz not null default now()
);

revoke all on table private.subscription_access_audit from public, anon, authenticated;

create index if not exists subscription_access_audit_user_id_idx
  on private.subscription_access_audit (user_id);

create or replace function private.activate_manual_subscription(
  target_email text,
  duration_days integer default 30,
  activation_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_user_id uuid;
  entitlement_end timestamptz;
begin
  if duration_days < 1 or duration_days > 3660 then
    raise exception 'duration_days must be between 1 and 3660';
  end if;

  select id into target_user_id
  from auth.users
  where lower(email) = lower(trim(target_email));

  if target_user_id is null then
    raise exception 'No account exists for this email';
  end if;

  entitlement_end := now() + make_interval(days => duration_days);

  insert into public.subscriptions (
    user_id, platform, product_id, purchase_token_hash, status,
    current_period_start, current_period_end, auto_renew, last_verified_at
  ) values (
    target_user_id, 'manual', 'manual_pro', 'manual:' || target_user_id::text,
    'active', now(), entitlement_end, false, now()
  )
  on conflict (user_id) do update set
    platform = excluded.platform,
    product_id = excluded.product_id,
    purchase_token_hash = excluded.purchase_token_hash,
    status = excluded.status,
    current_period_start = excluded.current_period_start,
    current_period_end = excluded.current_period_end,
    auto_renew = excluded.auto_renew,
    last_verified_at = excluded.last_verified_at,
    updated_at = now();

  insert into private.subscription_access_audit (
    user_id, action, platform, product_id, period_end, note
  ) values (
    target_user_id, 'activate', 'manual', 'manual_pro', entitlement_end,
    nullif(trim(activation_note), '')
  );

  return jsonb_build_object(
    'email', lower(trim(target_email)),
    'status', 'active',
    'period_end', entitlement_end
  );
end;
$$;

create or replace function private.deactivate_manual_subscription(
  target_email text,
  deactivation_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_user_id uuid;
begin
  select id into target_user_id
  from auth.users
  where lower(email) = lower(trim(target_email));

  if target_user_id is null then
    raise exception 'No account exists for this email';
  end if;

  update public.subscriptions
  set status = 'expired', current_period_end = now(), auto_renew = false,
      last_verified_at = now(), updated_at = now()
  where user_id = target_user_id and platform = 'manual';

  if not found then
    raise exception 'No manual subscription exists for this email';
  end if;

  insert into private.subscription_access_audit (
    user_id, action, platform, product_id, period_end, note
  ) values (
    target_user_id, 'deactivate', 'manual', 'manual_pro', now(),
    nullif(trim(deactivation_note), '')
  );

  return jsonb_build_object(
    'email', lower(trim(target_email)),
    'status', 'expired'
  );
end;
$$;

revoke all on function private.activate_manual_subscription(text, integer, text)
  from public, anon, authenticated;
revoke all on function private.deactivate_manual_subscription(text, text)
  from public, anon, authenticated;

commit;
