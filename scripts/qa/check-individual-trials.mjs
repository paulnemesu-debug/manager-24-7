// Real local PostgreSQL function/RLS regression; never contacts a hosted project.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
const db = new PGlite();
const sql = (s) => db.exec(s);
const query = async (s,args=[]) => (await db.query(s,args)).rows;
const scalar = async (s,args=[]) => (await query(s,args))[0]?.value;
const uid = n => '00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const alice=uid(1),bob=uid(2),admin=uid(3),paid=uid(4),unverified=uid(5);
const ddl = (file,table) => readFileSync(file,'utf8').match(new RegExp('create table if not exists public\\.'+table+' \\([\\s\\S]*?\\n\\);'))[0];
await sql(`set timezone='UTC'; create role anon; create role authenticated; create role service_role bypassrls;
create schema auth; create schema private;
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
grant usage on schema public,auth,private to anon,authenticated,service_role;
create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,last_sign_in_at timestamptz,created_at timestamptz default now(),raw_user_meta_data jsonb default '{}');
${ddl('supabase/migrations/20260826000000_initial_recipe_schema.sql','recipes')}
${ddl('supabase/migrations/20260826000000_initial_recipe_schema.sql','recipe_ingredients')}
${ddl('supabase/migrations/20260826210000_mobile_foundation.sql','profiles')}
${ddl('supabase/migrations/20260826210000_mobile_foundation.sql','subscriptions')}
${ddl('supabase/migrations/20260826210000_mobile_foundation.sql','ingredient_catalog')}
${ddl('supabase/migrations/20260917090000_manager247_operations_100.sql','business_locations')}
alter table public.profiles drop constraint profiles_role_check;
alter table public.profiles add constraint profiles_role_check check(role in ('owner','manager','chef','consultant','admin'));
alter table public.profiles add column locale text default 'ro';
alter table public.subscriptions drop constraint subscriptions_platform_check;
alter table public.subscriptions add constraint subscriptions_platform_check check(platform in ('google_play','manual','web','admin_grant'));
alter table public.recipe_ingredients add column ingredient_catalog_id uuid references public.ingredient_catalog(id);
create table public.workspace_members(id uuid primary key default gen_random_uuid(),owner_user_id uuid,member_user_id uuid,status text,invited_email text);
create function public.is_active_viewer_of(uuid) returns boolean language sql as $$select false$$;
create function public.has_professional_access() returns boolean language sql as $$select false$$;
create function public.start_my_trial() returns void language plpgsql as $$begin return; end$$;
create function public.extend_my_demo_after_otp() returns void language plpgsql as $$begin return; end$$;`);
await sql(readFileSync('supabase/migrations/20261004050832_enforce_single_location_access.sql','utf8'));
for(const table of ['recipes','recipe_ingredients','ingredient_catalog','profiles','subscriptions']) { const gate=['profiles','subscriptions'].includes(table)?'':' and public.has_professional_access()'; await sql('alter table public.'+table+' enable row level security; create policy own_select on public.'+table+' for select to authenticated using(user_id=auth.uid()'+gate+'); grant select on public.'+table+' to authenticated;'); }
await sql('alter table public.business_locations enable row level security; grant select on public.workspace_members to authenticated;');
const sourceFunction=(file,name)=>readFileSync(file,'utf8').match(new RegExp('create or replace function '+name.replaceAll('.','\\.')+'\\([\\s\\S]*?\\n\\$\\$;'))[0];
await sql('create table private.admin_emails(email text primary key,note text);');
await sql(sourceFunction('supabase/migrations/20260830140000_admin_access.sql','private.grant_admin_access'));
await sql(sourceFunction('supabase/migrations/20261019173014_harden_workspace_identity_and_entitlements.sql','private.sync_verified_workspace_identity'));
await sql('revoke all on function private.grant_admin_access(uuid),private.sync_verified_workspace_identity() from public,anon,authenticated;');
await sql('create trigger on_auth_user_email_verified after insert or update of email,email_confirmed_at on auth.users for each row execute function private.sync_verified_workspace_identity();');
await sql('create table public.trial_qa_operations(id uuid primary key default gen_random_uuid(),user_id uuid,notes text); alter table public.trial_qa_operations enable row level security; create policy owner_all on public.trial_qa_operations for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid()); grant select,insert,update,delete on public.trial_qa_operations to authenticated;');
const migration='supabase/migrations/'+readdirSync('supabase/migrations').find(n=>n.endsWith('_individual_trials.sql'));
await sql(readFileSync(migration,'utf8'));
const privileged=()=>sql('reset role;');
async function auth(id,role='authenticated') { await privileged(); await query("select set_config('request.jwt.claim.sub',$1,true)",[id??'']); await sql('set local role '+role); }
const get=()=>scalar('select public.get_my_trial_registration() as value');
const complete=(name='Restaurant exemplu',marketing=false)=>scalar("select public.complete_my_trial_registration($1,'2026-11-01','2026-11-01',$2) as value",[name,marketing]);
const registry=async(id=alice)=>{await privileged();return scalar('select to_jsonb(r) as value from private.individual_trial_registrations r where user_id=$1',[id]);};
const sub=async(id=alice)=>{await privileged();return scalar('select to_jsonb(s) as value from public.subscriptions s where user_id=$1',[id]);};
async function denied(s) { await sql('savepoint denied;'); let e; try{await sql(s);}catch(err){e=err;} await sql('rollback to savepoint denied; release savepoint denied;'); assert.ok(e,'operation unexpectedly allowed');assert.match(e.message,/permission denied|row-level security|Authentication|verified|legal|restaurant|admin|required/i); }
const results=[];
async function test(name,run){await sql('begin;');try{
for(const [id,email,role,verified] of [[alice,'alice@example.invalid','owner',true],[bob,'bob@example.invalid','owner',true],[admin,'owner@example.invalid','admin',true],[paid,'paid@example.invalid','owner',true],[unverified,'unverified@example.invalid','owner',false]]) {
await query('insert into auth.users(id,email,email_confirmed_at,last_sign_in_at) values($1,$2,case when $3 then clock_timestamp() else null end,clock_timestamp())',[id,email,verified]);
await query('insert into public.profiles(user_id,email,role) values($1,$2,$3)',[id,email,role]);}
await query("insert into public.subscriptions(user_id,platform,product_id,purchase_token_hash,status,current_period_start,current_period_end,auto_renew) values($1,'google_play','manager247_yearly','paid-fixture','active',now(),now()+interval '1 year',true)",[paid]);
await run();results.push({name,status:'PASS'});}catch(e){results.push({name,status:'FAIL',error:e.stack??e.message});}finally{await sql('rollback;');}}
await test('Auth first verified sign-in is recorded before registration or entitlement',async()=>{
const first=await registry();assert.ok(first.started_at);assert.equal(first.registered_at,null);
await auth(alice);const r=await get();assert.equal(r.registered,false);assert.equal(r.eligible,true);assert.equal(await scalar('select public.has_professional_access() as value'),false);
await privileged();assert.equal(await scalar('select count(*)::int as value from public.business_locations'),0);
assert.equal(await scalar('select extract(epoch from expires_at-started_at)::int as value from private.individual_trial_registrations where user_id=$1',[alice]),864000);
});
await test('Repeated OTP and delayed registration preserve original exact ten-day deadline',async()=>{
const first=await registry();await query("update auth.users set last_sign_in_at=clock_timestamp()+interval '1 minute' where id=$1",[alice]);assert.equal((await registry()).started_at,first.started_at);
await auth(alice);const r=await complete();assert.equal(r.started_at,first.started_at);assert.equal(r.expires_at,first.expires_at);assert.equal(r.registered,true);assert.equal(r.eligible,true);assert.equal(r.marketing_opt_in,false);
const s=await sub();assert.equal(s.product_id,'manager247_trial_10d');assert.equal(s.auto_renew,false);await auth(alice);assert.equal(await scalar('select public.has_professional_access() as value'),true);
});
await test('Legal versions and restaurant are mandatory before any grant',async()=>{
await auth(alice);for(const s of ["select public.complete_my_trial_registration('Cafe','old','2026-11-01')","select public.complete_my_trial_registration('Cafe','2026-11-01',null)","select public.complete_my_trial_registration('  ','2026-11-01','2026-11-01')"])await denied(s);assert.equal(await sub(),undefined);
});
await test('Unconfirmed Auth email and editable metadata cannot register or impersonate admin',async()=>{
await query("update public.profiles set email='admin@paradimoperations.com' where user_id=$1",[unverified]);
await query('update auth.users set raw_user_meta_data=$2::jsonb where id=$1',[unverified,JSON.stringify({role:'admin',email:'admin@paradimoperations.com'})]);
await auth(unverified);await denied('select public.get_my_trial_registration()');await denied("select public.complete_my_trial_registration('Cafe','2026-11-01','2026-11-01')");await auth(alice);await denied('select public.admin_list_trial_users()');await privileged();assert.equal(await scalar('select count(*)::int as value from private.individual_trial_registrations where user_id=$1',[unverified]),0);
});
await test('Registration retries preserve records and deduplicate owned seed and owner notification',async()=>{
await auth(alice);const first=await complete();const before=await sub();await auth(alice);assert.deepEqual(await complete('Changed name',true),first);assert.deepEqual(await sub(),before);await privileged();
assert.equal(await scalar('select count(*)::int as value from public.business_locations where owner_user_id=$1',[alice]),1);assert.equal(await scalar('select count(*)::int as value from public.recipes where user_id=$1',[alice]),1);assert.equal(await scalar('select count(*)::int as value from public.ingredient_catalog where user_id=$1',[alice]),2);assert.equal(await scalar('select count(*)::int as value from private.trial_owner_notifications where user_id=$1',[alice]),1);
});
await test('Expired window stays expired through registration/relogin/legacy RPCs',async()=>{
await query("update private.individual_trial_registrations set started_at=now()-interval '11 days',expires_at=now()-interval '1 day' where user_id=$1",[alice]);await auth(alice);const r=await complete();assert.equal(r.registered,true);assert.ok(Date.parse(r.expires_at)<Date.now());assert.equal(await scalar('select public.has_professional_access() as value'),false);await denied('select public.start_my_trial()');await denied('select public.extend_my_demo_after_otp()');const before=await sub();assert.equal(before.status,'expired');await query('update auth.users set last_sign_in_at=clock_timestamp() where id=$1',[alice]);await auth(alice);await complete();assert.deepEqual(await sub(),before);await privileged();assert.equal(await scalar('select count(*)::int as value from public.recipes where user_id=$1',[alice]),0);
});
await test('Legacy14day grant cannot bypass legal gate or gain a new window',async()=>{
await query('delete from private.individual_trial_registrations where user_id=$1',[bob]);await query("insert into public.subscriptions(user_id,platform,product_id,purchase_token_hash,status,current_period_start,current_period_end) values($1,'web','manager247_trial_14d','legacy','trialing',now()-interval '11 days',now()+interval '3 days')",[bob]);await auth(bob);assert.equal(await scalar('select public.has_professional_access() as value'),false);const r=await complete();assert.ok(Date.parse(r.expires_at)<Date.now());assert.equal((await sub(bob)).status,'expired');
});
await test('Paid/admin access and every paid subscription field remain unchanged',async()=>{
const before=await sub(paid);await auth(paid);assert.equal((await get()).eligible,false);assert.equal((await complete()).eligible,false);assert.equal(await scalar('select public.has_professional_access() as value'),true);assert.deepEqual(await sub(paid),before);await auth(admin);assert.equal((await get()).eligible,false);assert.equal(await scalar('select public.has_professional_access() as value'),true);
});
await test('Two testers receive separate seeds and RLS hides the other tenant',async()=>{
await auth(alice);const a=await complete();await auth(bob);const b=await complete();assert.notEqual(a.location_id,b.location_id);assert.equal(await scalar('select count(*)::int as value from public.business_locations'),1);assert.equal(await scalar('select count(*)::int as value from public.recipes'),1);assert.equal(await scalar('select count(*)::int as value from public.recipes where user_id=$1',[alice]),0);assert.equal(await scalar('select count(*)::int as value from public.ingredient_catalog'),2);
});
await test('Existing business data prevents fictional seed and overwrite',async()=>{
await query("insert into public.recipes(user_id,title,servings) values($1,'Existing real recipe',2)",[alice]);const before=await query('select to_jsonb(r) as value from public.recipes r');await auth(alice);const r=await complete();assert.equal(r.location_id,null);await privileged();assert.deepEqual(await query('select to_jsonb(r) as value from public.recipes r'),before);assert.equal(await scalar('select count(*)::int as value from public.ingredient_catalog'),0);
});
await test('Existing HR-only workspace is not a fresh fictional seed target',async()=>{
await sql('create table public.hr_employees(id uuid primary key default gen_random_uuid(),user_id uuid,name text);');
await query("insert into public.hr_employees(user_id,name) values($1,'Existing team member')",[alice]);
await auth(alice);const r=await complete();assert.equal(r.location_id,null);await privileged();assert.equal(await scalar('select count(*)::int as value from public.recipes where user_id=$1',[alice]),0);
});
await test('Expired paid subscriptions are consistently ineligible without replacement',async()=>{
await query("update public.subscriptions set status='expired',current_period_end=now()-interval '1 day' where user_id=$1",[paid]);
const before=await sub(paid);await auth(paid);assert.equal((await get()).eligible,false);assert.equal((await complete()).eligible,false);assert.deepEqual(await sub(paid),before);
});
await test('Admin roster uses verified Auth email and minimal fields',async()=>{
await auth(alice);await complete();await privileged();await query("update public.profiles set email='forged@example.invalid' where user_id=$1",[alice]);await auth(admin);const rows=await scalar('select public.admin_list_trial_users(51,0) as value');const a=rows.find(r=>r.user_id===alice);assert.equal(a.verified_email,'alice@example.invalid');assert.equal(a.status,'active');assert.deepEqual(Object.keys(a).sort(),['user_id','verified_email','restaurant_name','started_at','expires_at','registered_at','last_sign_in_at','marketing_opt_in','status'].sort());
});
await test('Admin roster excludes unrelated paid/admin and labels converted trials truthfully',async()=>{
await auth(alice);await complete();await privileged();await query("update public.subscriptions set platform='google_play',product_id='manager247_yearly',status='active',current_period_end=now()+interval '1 year' where user_id=$1",[alice]);
await auth(admin);const rows=await scalar('select public.admin_list_trial_users(200,0) as value');assert.equal(rows.some(r=>r.user_id===paid||r.user_id===admin),false);assert.equal(rows.find(r=>r.user_id===alice).status,'subscribed');
});
await test('Expiry at the server-clock boundary removes protected recipe reads',async()=>{
await auth(alice);await complete();await privileged();await query("update private.individual_trial_registrations set started_at=now()-interval '240 hours',expires_at=now() where user_id=$1",[alice]);await query("update public.subscriptions set current_period_start=now()-interval '240 hours',current_period_end=now() where user_id=$1",[alice]);
await auth(alice);assert.equal(await scalar('select public.has_professional_access() as value'),false);assert.equal(await scalar('select count(*)::int as value from public.recipes'),0);
});
await test('Verification without Auth sign-in does not start until the first authoritative sign-in',async()=>{
await query('update auth.users set last_sign_in_at=null,email_confirmed_at=null where id=$1',[unverified]);await query('update auth.users set email_confirmed_at=clock_timestamp() where id=$1',[unverified]);assert.equal(await registry(unverified),undefined);
await query('update auth.users set last_sign_in_at=clock_timestamp() where id=$1',[unverified]);const first=await registry(unverified);assert.ok(first.started_at);await auth(unverified);assert.equal((await get()).started_at,first.started_at);
});
await test('Even a trusted admin role requires confirmed Auth email for roster access',async()=>{
await query("update public.profiles set role='admin' where user_id=$1",[unverified]);await auth(unverified);await denied('select public.admin_list_trial_users()');
});
await test('Primary owner allowlist grants admin only after Auth confirms the exact authorized email',async()=>{
await query('update auth.users set email=$2 where id=$1',[unverified,'admin@paradimoperations.com']);await privileged();assert.equal(await scalar('select role as value from public.profiles where user_id=$1',[unverified]),'owner');await auth(unverified);await denied('select public.admin_list_trial_users()');await privileged();
await query('update auth.users set email_confirmed_at=clock_timestamp() where id=$1',[unverified]);assert.equal(await scalar('select role as value from public.profiles where user_id=$1',[unverified]),'admin');await auth(unverified);assert.ok(Array.isArray(await scalar('select public.admin_list_trial_users() as value')));
});
await test('All owner-only operational modules require legal completion and expire on the server',async()=>{
await auth(alice);await denied("insert into public.trial_qa_operations(user_id,notes) values(auth.uid(),'before legal')");await complete();await query("insert into public.trial_qa_operations(user_id,notes) values(auth.uid(),'after legal')");assert.equal(await scalar('select count(*)::int as value from public.trial_qa_operations'),1);await privileged();
await query("update private.individual_trial_registrations set started_at=now()-interval '240 hours',expires_at=now() where user_id=$1",[alice]);await auth(alice);assert.equal(await scalar('select count(*)::int as value from public.trial_qa_operations'),0);await denied("insert into public.trial_qa_operations(user_id,notes) values(auth.uid(),'after expiry')");
});
await test('Private registry/outbox and entitlement writes are denied to clients',async()=>{
await auth(alice);for(const s of ['select * from private.individual_trial_registrations','select * from private.trial_owner_notifications','select public.claim_trial_owner_notifications()',"select private.grant_admin_access(auth.uid())","update public.profiles set role='admin'","update public.subscriptions set current_period_end='2099-01-01'"])await denied(s);await auth(null,'anon');await denied('select public.get_my_trial_registration()');
});
await test('Service-only notification reservation is deduplicated and ack matches its lease',async()=>{
await auth(alice);await complete();await auth(null,'service_role');const rows=await scalar('select public.claim_trial_owner_notifications(20) as value');assert.equal(rows.length,1);assert.equal(rows[0].verified_email,'alice@example.invalid');assert.equal((await scalar('select public.claim_trial_owner_notifications(20) as value')).length,0);assert.equal(await scalar("select public.finish_trial_owner_notification($1,now()-interval '1 hour',true,null) as value",[rows[0].id]),false);assert.equal(await scalar('select public.finish_trial_owner_notification($1,$2,true,null) as value',[rows[0].id,rows[0].reserved_at]),true);assert.equal((await scalar('select public.claim_trial_owner_notifications(20) as value')).length,0);
});
await test('Account deletion cascades private trial metadata and outbox',async()=>{
await auth(alice);await complete();await privileged();await query('delete from auth.users where id=$1',[alice]);assert.equal(await scalar('select count(*)::int as value from private.individual_trial_registrations where user_id=$1',[alice]),0);assert.equal(await scalar('select count(*)::int as value from private.trial_owner_notifications where user_id=$1',[alice]),0);
});
console.log(JSON.stringify({mode:'local-only',migration,passed:results.filter(r=>r.status==='PASS').length,failed:results.filter(r=>r.status==='FAIL').length,results},null,2));await db.close();if(results.some(r=>r.status==='FAIL'))process.exitCode=1;
