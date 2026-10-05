begin;

alter table public.profiles
  drop constraint if exists profiles_role_check;

alter table public.profiles
  add constraint profiles_role_check
  check (role in ('owner', 'manager', 'chef', 'consultant', 'admin'));

alter table public.subscriptions
  drop constraint if exists subscriptions_platform_check;

alter table public.subscriptions
  add constraint subscriptions_platform_check
  check (platform in ('google_play', 'admin_grant'));

-- Application users may edit their contact details, but administrative roles
-- remain server-managed and cannot be self-assigned through the client API.
revoke insert, update on table public.profiles from authenticated;
grant insert (user_id, email, business_name) on table public.profiles to authenticated;
grant update (email, business_name) on table public.profiles to authenticated;

commit;
