-- Run only against the isolated staging project after its baseline + trial
-- migration. Fictional Auth users never send mail and every row rolls back.
begin;
set local timezone='UTC';
create temp table trial_fixture(kind text primary key,id uuid not null default gen_random_uuid());
insert into trial_fixture(kind) values('a'),('b'),('admin'),('paid'),('unconfirmed');
grant select on trial_fixture to authenticated,anon,service_role;
create function pg_temp.assert_trial(p_ok boolean,p_check text) returns void language plpgsql as $$
begin if p_ok is distinct from true then raise exception 'trial regression: %',p_check; end if; end;
$$;
insert into auth.users(id,email,email_confirmed_at,last_sign_in_at,created_at,updated_at,aud,role,raw_app_meta_data,raw_user_meta_data)
select id,'trial-'||kind||'@example.invalid',case when kind<>'unconfirmed' then clock_timestamp() end,
  clock_timestamp(),clock_timestamp(),clock_timestamp(),'authenticated','authenticated',
  '{"provider":"email","providers":["email"]}'::jsonb,
  case when kind='unconfirmed' then '{"role":"admin","email":"admin@paradimoperations.com"}'::jsonb else '{}'::jsonb end
from trial_fixture;
update public.profiles set role='admin' where user_id=(select id from trial_fixture where kind='admin');
insert into public.subscriptions(user_id,platform,product_id,purchase_token_hash,status,current_period_start,current_period_end,auto_renew)
select id,'google_play','manager247_yearly','qa-paid:'||id,'active',now(),now()+interval '1 year',true from trial_fixture where kind='paid';
create temp table paid_before as select to_jsonb(s) as snapshot from public.subscriptions s where user_id=(select id from trial_fixture where kind='paid');
create temp table first_sign_in as select user_id,started_at,expires_at from private.individual_trial_registrations where user_id in(select id from trial_fixture);

select pg_temp.assert_trial((select count(*)=4 from private.individual_trial_registrations where user_id in(select id from trial_fixture)), 'verified login captured before registration');
select pg_temp.assert_trial((select bool_and(registered_at is null and expires_at-started_at=interval '240 hours') from private.individual_trial_registrations where user_id in(select id from trial_fixture)), 'fixed 864000 second clock window');
select set_config('request.jwt.claim.sub',(select id::text from trial_fixture where kind='a'),true);
set local role authenticated;
select pg_temp.assert_trial(not public.has_professional_access(),'no entitlement before legal registration');
do $$ begin
  perform public.complete_my_trial_registration('Cafe','old','2026-11-01');
  raise exception 'outdated legal version allowed';
exception when invalid_parameter_value then null; end $$;
select public.complete_my_trial_registration('Restaurant fictiv A','2026-11-01','2026-11-01',false,'ro');
select pg_temp.assert_trial(public.has_professional_access(),'completed trial entitled');
select pg_temp.assert_trial((select count(*)=1 from public.recipes),'caller sees only own seeded recipe');
select pg_temp.assert_trial((select count(*)=2 from public.ingredient_catalog),'caller sees only own two ingredients');
do $$ begin perform public.admin_list_trial_users(); raise exception 'nonadmin roster allowed'; exception when insufficient_privilege then null; end $$;
do $$ begin perform public.start_my_trial(); raise exception 'legacy14day RPC allowed'; exception when insufficient_privilege then null; end $$;
do $$ begin perform public.extend_my_demo_after_otp(); raise exception 'shared demo RPC allowed'; exception when insufficient_privilege then null; end $$;
do $$ begin perform private.grant_admin_access(auth.uid()); raise exception 'client admin selfgrant allowed'; exception when insufficient_privilege then null; end $$;
reset role;
create temp table registered_before as select to_jsonb(r) as snapshot from private.individual_trial_registrations r where user_id=(select id from trial_fixture where kind='a');
select set_config('request.jwt.claim.sub',(select id::text from trial_fixture where kind='a'),true);
set local role authenticated;
select public.complete_my_trial_registration('Changed restaurant','2026-11-01','2026-11-01',true,'en');
reset role;
select pg_temp.assert_trial((select to_jsonb(r)=(select snapshot from registered_before) from private.individual_trial_registrations r where user_id=(select id from trial_fixture where kind='a')),'registration retry immutable');
select pg_temp.assert_trial((select count(*)=1 from private.trial_owner_notifications where user_id=(select id from trial_fixture where kind='a')),'owner queue deduplicated');
update auth.users set last_sign_in_at=clock_timestamp() where id=(select id from trial_fixture where kind='a');
select pg_temp.assert_trial((select r.started_at=f.started_at and r.expires_at=f.expires_at from private.individual_trial_registrations r join first_sign_in f using(user_id) where user_id=(select id from trial_fixture where kind='a')),'OTP sign-in does not renew');

select set_config('request.jwt.claim.sub',(select id::text from trial_fixture where kind='b'),true);
set local role authenticated;
select public.complete_my_trial_registration('Restaurant fictiv B','2026-11-01','2026-11-01');
select pg_temp.assert_trial((select count(*)=1 from public.recipes),'second tenant sees one recipe');
select pg_temp.assert_trial((select count(*)=0 from public.recipes where user_id=(select id from trial_fixture where kind='a')),'second tenant cannot read first tenant');
reset role;
select pg_temp.assert_trial((select count(distinct location_id)=2 from private.individual_trial_registrations where user_id in(select id from trial_fixture where kind in ('a','b'))),'separate owned business locations');
select set_config('request.jwt.claim.sub',(select id::text from trial_fixture where kind='paid'),true);
set local role authenticated;
select pg_temp.assert_trial(not (public.get_my_trial_registration()->>'eligible')::boolean,'paid bypass registration');
select public.complete_my_trial_registration('No replacement','2026-11-01','2026-11-01');
select pg_temp.assert_trial(public.has_professional_access(),'paid access retained');
reset role;
select pg_temp.assert_trial((select to_jsonb(s)=(select snapshot from paid_before) from public.subscriptions s where user_id=(select id from trial_fixture where kind='paid')),'paid subscription untouched');

select set_config('request.jwt.claim.sub',(select id::text from trial_fixture where kind='unconfirmed'),true);
set local role authenticated;
do $$ begin perform public.get_my_trial_registration(); raise exception 'unconfirmed login allowed'; exception when insufficient_privilege then null; end $$;
do $$ begin perform public.admin_list_trial_users(); raise exception 'editable admin metadata allowed'; exception when insufficient_privilege then null; end $$;
reset role;
select set_config('request.jwt.claim.sub',(select id::text from trial_fixture where kind='admin'),true);
set local role authenticated;
select pg_temp.assert_trial(jsonb_typeof(public.admin_list_trial_users(51,0))='array','verified trusted admin roster');
reset role;
update private.individual_trial_registrations set started_at=now()-interval '240 hours',expires_at=now() where user_id=(select id from trial_fixture where kind='a');
update public.subscriptions set current_period_start=now()-interval '240 hours',current_period_end=now() where user_id=(select id from trial_fixture where kind='a');
select set_config('request.jwt.claim.sub',(select id::text from trial_fixture where kind='a'),true);
set local role authenticated;
select pg_temp.assert_trial(not public.has_professional_access(),'server boundary expired');
select pg_temp.assert_trial((select count(*)=0 from public.recipes),'expired RLS cannot read recipes');
select public.complete_my_trial_registration('No renewal','2026-11-01','2026-11-01');
select pg_temp.assert_trial(not public.has_professional_access(),'expired retry cannot renew');
reset role;
select jsonb_build_object('result','PASS','scope','staging real Auth triggers, foodcost seed, legal gate, paid/admin, legacy RPC revocation, two-tenant RLS, boundary expiry, idempotency','fixture_users',5,'delivery','not attempted; transaction rolled back') as verification;
rollback;
