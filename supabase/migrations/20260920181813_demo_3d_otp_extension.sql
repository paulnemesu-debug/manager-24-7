begin;

create table if not exists private.demo_otp_extensions (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  otp_verified_at bigint not null,
  previous_period_end timestamptz,
  new_period_end timestamptz not null,
  created_at timestamptz not null default now(),
  unique (user_id, otp_verified_at)
);

revoke all on table private.demo_otp_extensions from public, anon, authenticated;

create or replace function public.extend_my_demo_after_otp()
returns table(status text, current_period_end timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  claims jsonb := auth.jwt();
  latest_method text;
  otp_timestamp bigint;
  old_end timestamptz;
  next_end timestamptz;
begin
  if caller is null then raise exception 'Authentication required'; end if;
  if lower(coalesce(claims ->> 'email', '')) <> 'paul.nemesu@paradim.ro' then
    raise exception 'This account is not eligible for demo extension';
  end if;

  latest_method := claims #>> '{amr,0,method}';
  begin
    otp_timestamp := (claims #>> '{amr,0,timestamp}')::bigint;
  exception when others then
    otp_timestamp := null;
  end;

  if latest_method <> 'otp'
     or otp_timestamp is null
     or otp_timestamp < extract(epoch from now() - interval '10 minutes')::bigint
     or otp_timestamp > extract(epoch from now() + interval '1 minute')::bigint then
    raise exception 'A fresh email OTP is required';
  end if;

  select s.current_period_end into old_end
  from public.subscriptions s
  where s.user_id = caller and s.product_id = 'manager247_demo_3d'
  for update;
  if not found then raise exception 'No eligible demo exists for this account'; end if;

  next_end := greatest(coalesce(old_end, now()), now()) + interval '3 days';
  insert into private.demo_otp_extensions (
    user_id, otp_verified_at, previous_period_end, new_period_end
  ) values (caller, otp_timestamp, old_end, next_end);

  update public.subscriptions
  set status = 'trialing', current_period_end = next_end, auto_renew = false,
      last_verified_at = now(), updated_at = now()
  where user_id = caller;

  return query
  select s.status, s.current_period_end
  from public.subscriptions s where s.user_id = caller;
exception
  when unique_violation then
    raise exception 'This OTP was already used for an extension';
end;
$$;

revoke all on function public.extend_my_demo_after_otp() from public, anon;
grant execute on function public.extend_my_demo_after_otp() to authenticated;

commit;
