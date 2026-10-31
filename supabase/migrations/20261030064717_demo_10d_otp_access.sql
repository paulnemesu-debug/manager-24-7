begin;

-- Contul cloud de demonstrație este separat de administratorul PARADIM.
-- Primul OTP valid activează o singură fereastră de 10 zile. OTP-urile
-- următoare permit autentificarea, dar nu mută data de expirare.
create or replace function public.extend_my_demo_after_otp()
returns table(status text, current_period_end timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  claims jsonb := (select auth.jwt());
  otp_timestamp bigint;
  existing public.subscriptions%rowtype;
  activated_at timestamptz := clock_timestamp();
begin
  if caller is null then
    raise exception 'Authentication required';
  end if;
  if lower(btrim(coalesce(claims ->> 'email', ''))) <> 'demo@paradim.ro' then
    raise exception 'This account is not eligible for demo access';
  end if;

  begin
    select max((method ->> 'timestamp')::bigint)
      into otp_timestamp
    from jsonb_array_elements(coalesce(claims -> 'amr', '[]'::jsonb)) method
    where method ->> 'method' = 'otp'
      and coalesce(method ->> 'timestamp', '') ~ '^[0-9]{1,20}$';
  exception when others then
    otp_timestamp := null;
  end;

  if otp_timestamp is null
     or otp_timestamp < extract(epoch from activated_at - interval '10 minutes')::bigint
     or otp_timestamp > extract(epoch from activated_at + interval '1 minute')::bigint then
    raise exception 'A fresh email OTP is required';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(caller::text || ':manager247-demo-10d', 0)
  );

  select s.* into existing
  from public.subscriptions s
  where s.user_id = caller
  for update;

  if found then
    if existing.product_id <> 'manager247_demo_10d' then
      raise exception 'This account already has a different entitlement';
    end if;

    if existing.current_period_end is null or existing.current_period_end <= activated_at then
      update public.subscriptions s
      set status = 'expired', auto_renew = false,
          last_verified_at = activated_at, updated_at = activated_at
      where s.user_id = caller;
    end if;
  else
    insert into public.subscriptions (
      user_id, platform, product_id, purchase_token_hash, status,
      current_period_start, current_period_end, auto_renew, last_verified_at
    ) values (
      caller, 'manual', 'manager247_demo_10d', 'demo10d:' || caller::text, 'trialing',
      activated_at, activated_at + interval '10 days', false, activated_at
    );
  end if;

  return query
  select s.status, s.current_period_end
  from public.subscriptions s
  where s.user_id = caller;
end;
$$;

revoke all on function public.extend_my_demo_after_otp() from public, anon;
grant execute on function public.extend_my_demo_after_otp() to authenticated;

commit;
