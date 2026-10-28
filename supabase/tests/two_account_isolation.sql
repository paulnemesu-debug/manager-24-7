-- Hosted-compatible two-account RLS proof. Run only as a migration role in an
-- isolated staging database. All synthetic rows are removed by the final ROLLBACK.
begin;
do $$
declare
  account_a uuid := gen_random_uuid();
  account_b uuid := gen_random_uuid();
  token_a text := repeat('a', 64);
  token_b text := repeat('b', 64);
  visible_count integer;
begin
  insert into auth.users(id,email,email_confirmed_at) values
    (account_a,'qa-isolation-a-' || account_a || '@example.invalid',now()),
    (account_b,'qa-isolation-b-' || account_b || '@example.invalid',now());

  insert into public.subscriptions(user_id,platform,product_id,purchase_token_hash,status,current_period_end,last_verified_at)
  values
    (account_a,'google_play','qa-isolation',token_a,'active',now()+interval '1 day',now()),
    (account_b,'google_play','qa-isolation',token_b,'active',now()+interval '1 day',now());
  insert into private.google_play_purchase_tokens(token_hash,user_id,last_verified_at)
  values (token_a,account_a,now()),(token_b,account_b,now());
  insert into public.pnl_reports(user_id,period,revenue_food,notes)
  values (account_a,date_trunc('month',current_date)::date,100,'qa-isolation'),
         (account_b,date_trunc('month',current_date)::date,200,'qa-isolation');

  perform set_config('request.jwt.claim.sub',account_a::text,true);
  execute 'set local role authenticated';
  select count(*) into visible_count from public.profiles;
  if visible_count <> 1 then raise exception 'Account A profile isolation failed: %', visible_count; end if;
  select count(*) into visible_count from public.subscriptions;
  if visible_count <> 1 then raise exception 'Account A subscription isolation failed: %', visible_count; end if;
  select count(*) into visible_count from public.pnl_reports;
  if visible_count <> 1 then raise exception 'Account A P&L isolation failed: %', visible_count; end if;
  if exists(select 1 from public.pnl_reports where user_id=account_b) then
    raise exception 'Account A can read account B P&L';
  end if;
  if has_table_privilege('authenticated','private.google_play_purchase_tokens','SELECT') then
    raise exception 'Authenticated can access private Google Play tokens';
  end if;
  begin
    insert into public.pnl_reports(user_id,period,notes)
    values(account_b,(date_trunc('month',current_date)-interval '1 month')::date,'qa-isolation');
    raise exception 'Account A wrote account B P&L';
  exception when insufficient_privilege then null; end;
  execute 'reset role';

  perform set_config('request.jwt.claim.sub',account_b::text,true);
  execute 'set local role authenticated';
  select count(*) into visible_count from public.profiles;
  if visible_count <> 1 then raise exception 'Account B profile isolation failed: %', visible_count; end if;
  select count(*) into visible_count from public.subscriptions;
  if visible_count <> 1 then raise exception 'Account B subscription isolation failed: %', visible_count; end if;
  select count(*) into visible_count from public.pnl_reports;
  if visible_count <> 1 then raise exception 'Account B P&L isolation failed: %', visible_count; end if;
  if exists(select 1 from public.pnl_reports where user_id=account_a) then
    raise exception 'Account B can read account A P&L';
  end if;
  execute 'reset role';
end;
$$;
rollback;
