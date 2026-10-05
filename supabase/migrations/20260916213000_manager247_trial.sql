begin;

-- Trialul este creat numai pe server și o singură dată pentru fiecare cont.
-- Un client modificat nu îl poate prelungi și nu poate alege alt utilizator.
create or replace function public.start_my_trial()
returns table(status text, current_period_end timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
begin
  if caller is null then
    raise exception 'Authentication required';
  end if;

  insert into public.subscriptions (
    user_id, platform, product_id, purchase_token_hash, status,
    current_period_start, current_period_end, auto_renew, last_verified_at
  ) values (
    caller, 'web', 'manager247_trial_14d', 'trial:' || caller::text, 'trialing',
    now(), now() + interval '14 days', false, now()
  ) on conflict (user_id) do nothing;

  return query
  select s.status, s.current_period_end
  from public.subscriptions s
  where s.user_id = caller;
end;
$$;

revoke all on function public.start_my_trial() from public, anon;
grant execute on function public.start_my_trial() to authenticated;

commit;
