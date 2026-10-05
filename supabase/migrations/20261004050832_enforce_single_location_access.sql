begin;

-- The administrator role is assigned only by server-side migrations/triggers.
-- Keep the check outside the exposed schema and reuse it from the DELETE RLS
-- policy. A future paid multi-location entitlement can extend this function.
create or replace function private.current_user_is_location_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles
    where user_id = (select auth.uid())
      and role = 'admin'
  );
$$;

revoke all on function private.current_user_is_location_admin() from public, anon;
grant execute on function private.current_user_is_location_admin() to authenticated;

-- Enforce one location for ordinary accounts on the server, not only in the
-- mobile UI. The transaction advisory lock prevents two simultaneous inserts
-- from both passing the count check.
create or replace function private.enforce_business_location_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
begin
  if caller_id is null or caller_id <> new.owner_user_id then
    raise exception 'location_owner_mismatch'
      using errcode = '42501',
            detail = 'A location can only be created for the authenticated account.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(new.owner_user_id::text, 0)
  );

  if exists (
    select 1
    from public.profiles
    where user_id = caller_id
      and role = 'admin'
  ) then
    return new;
  end if;

  if exists (
    select 1
    from public.business_locations
    where owner_user_id = new.owner_user_id
  ) then
    raise exception 'location_limit_reached'
      using errcode = '23514',
            detail = 'An ordinary account can create one business location.';
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_business_location_limit() from public, anon, authenticated;

drop trigger if exists business_locations_enforce_limit on public.business_locations;
create trigger business_locations_enforce_limit
before insert on public.business_locations
for each row execute function private.enforce_business_location_limit();

-- Separate policies make the allowed operations explicit:
-- owners can read/create/edit their own location; only an administrator can
-- delete locations. The insert trigger above applies the one-location limit.
drop policy if exists business_locations_owner_all on public.business_locations;
drop policy if exists business_locations_select_own on public.business_locations;
drop policy if exists business_locations_insert_own on public.business_locations;
drop policy if exists business_locations_update_own on public.business_locations;
drop policy if exists business_locations_delete_admin on public.business_locations;

create policy business_locations_select_own
on public.business_locations
for select to authenticated
using ((select auth.uid()) = owner_user_id);

create policy business_locations_insert_own
on public.business_locations
for insert to authenticated
with check ((select auth.uid()) = owner_user_id);

create policy business_locations_update_own
on public.business_locations
for update to authenticated
using ((select auth.uid()) = owner_user_id)
with check ((select auth.uid()) = owner_user_id);

create policy business_locations_delete_admin
on public.business_locations
for delete to authenticated
using (
  (select auth.uid()) = owner_user_id
  and (select private.current_user_is_location_admin())
);

grant select, insert, update, delete on public.business_locations to authenticated;

commit;
