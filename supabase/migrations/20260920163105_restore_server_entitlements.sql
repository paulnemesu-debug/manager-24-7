begin;

-- The database is the authorization boundary. A modified APK may bypass its
-- own screens, but cannot read or write protected rows without this function
-- returning true under RLS.
create or replace function public.has_professional_access()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and (
      exists (
        select 1
        from public.profiles p
        where p.user_id = (select auth.uid())
          and p.role = 'admin'
      )
      or exists (
        select 1
        from public.subscriptions s
        where s.user_id = (select auth.uid())
          and s.status in ('active', 'trialing', 'grace_period', 'canceled')
          and s.current_period_end is not null
          and s.current_period_end > now()
      )
      or exists (
        select 1
        from public.workspace_members wm
        where wm.member_user_id = (select auth.uid())
          and wm.status = 'active'
      )
    );
$$;

revoke all on function public.has_professional_access() from public, anon;
grant execute on function public.has_professional_access() to authenticated;

commit;
