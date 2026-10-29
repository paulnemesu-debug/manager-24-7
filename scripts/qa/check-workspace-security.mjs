// Local PostgreSQL regression harness. Never connects to a hosted database.
// QA_PGLITE_PATH can override the pinned project dependency for isolated debugging.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
const runtime = process.env.QA_PGLITE_PATH;
const { PGlite } = runtime
  ? await import(pathToFileURL(resolve(runtime, 'dist/index.js')).href)
  : await import('@electric-sql/pglite');
const db = new PGlite();
const sql = (value) => db.exec(value);
const scalar = async (value) => (await db.query(value)).rows[0]?.value;
const uid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const owner = uid(1), member = uid(2), attacker = uid(3), other = uid(4), admin = uid(5);
const auth = async (id) => { await sql(`select set_config('request.jwt.claim.sub', '${id}', true); set local role authenticated;`); };
const privileged = () => sql('reset role;');
const denied = async (statement) => {
  await sql('savepoint denied_statement;');
  let error;
  try { await sql(statement); } catch (caught) { error = caught; }
  await sql('rollback to savepoint denied_statement; release savepoint denied_statement;');
  assert.ok(error, 'operation unexpectedly allowed');
};
await sql(`
create role anon; create role authenticated; create role service_role bypassrls;
create schema auth; create schema private; create schema storage;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
grant usage on schema public, auth to authenticated, anon, service_role;
create table auth.users(id uuid primary key, email text, email_confirmed_at timestamptz);
create table public.profiles(user_id uuid primary key references auth.users(id), email text, business_name text, role text default 'owner');
create table public.subscriptions(user_id uuid primary key references auth.users(id), platform text, product_id text, purchase_token_hash text, status text, google_order_id text, current_period_start timestamptz, current_period_end timestamptz, auto_renew boolean, auto_renewing boolean, last_verified_at timestamptz);
create table private.admin_emails(email text primary key);
create function private.set_updated_at() returns trigger language plpgsql as $$ begin new.updated_at=now(); return new; end $$;
create function private.grant_admin_access(target_user_id uuid) returns void language plpgsql security definer set search_path='' as $$ begin
update public.profiles set role='admin' where user_id=target_user_id;
insert into public.subscriptions(user_id,platform,product_id,purchase_token_hash,status,current_period_start,current_period_end,auto_renewing,last_verified_at) values(target_user_id,'admin_grant','admin','admin:'||target_user_id,'active',now(),'2099-12-31',false,now()) on conflict(user_id) do update set status='active',current_period_end='2099-12-31'; end $$;
revoke all on function private.grant_admin_access(uuid) from public;
create function public.has_professional_access() returns boolean language sql as $$ select false $$;
create table public.recipes(
  id uuid primary key default gen_random_uuid(), user_id uuid, title text, servings numeric
);
create table public.recipe_ingredients(
  id uuid primary key default gen_random_uuid(), recipe_id uuid, user_id uuid,
  ingredient_name text, quantity_net numeric, unit text, purchase_price numeric, price_unit text
);
create table public.ingredient_catalog(
  id uuid primary key default gen_random_uuid(), user_id uuid, name text,
  normalized_name text, purchase_price numeric, price_unit text
);
create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
create function storage.foldername(text) returns text[] language sql immutable as $$ select string_to_array($1,'/') $$;
grant usage on schema storage to authenticated; grant select on storage.objects to authenticated;
alter table storage.objects enable row level security;
alter table public.profiles enable row level security;
alter table public.subscriptions enable row level security;
alter table public.recipes enable row level security;
alter table public.recipe_ingredients enable row level security;
alter table public.ingredient_catalog enable row level security;
create policy own_profiles on public.profiles for select to authenticated using(user_id=auth.uid());
create policy own_subscriptions on public.subscriptions for select to authenticated using(user_id=auth.uid());
create policy recipes_insert_entitled on public.recipes for insert to authenticated
  with check(user_id=auth.uid() and public.has_professional_access());
create policy recipes_update_entitled on public.recipes for update to authenticated
  using(user_id=auth.uid() and public.has_professional_access())
  with check(user_id=auth.uid() and public.has_professional_access());
create policy recipes_delete_entitled on public.recipes for delete to authenticated
  using(user_id=auth.uid() and public.has_professional_access());
create policy recipe_ingredients_insert_entitled on public.recipe_ingredients for insert to authenticated
  with check(user_id=auth.uid() and public.has_professional_access());
create policy recipe_ingredients_update_entitled on public.recipe_ingredients for update to authenticated
  using(user_id=auth.uid() and public.has_professional_access())
  with check(user_id=auth.uid() and public.has_professional_access());
create policy recipe_ingredients_delete_entitled on public.recipe_ingredients for delete to authenticated
  using(user_id=auth.uid() and public.has_professional_access());
create policy ingredient_catalog_insert_entitled on public.ingredient_catalog for insert to authenticated
  with check(user_id=auth.uid() and public.has_professional_access());
create policy ingredient_catalog_update_entitled on public.ingredient_catalog for update to authenticated
  using(user_id=auth.uid() and public.has_professional_access())
  with check(user_id=auth.uid() and public.has_professional_access());
create policy ingredient_catalog_delete_entitled on public.ingredient_catalog for delete to authenticated
  using(user_id=auth.uid() and public.has_professional_access());
grant select on public.profiles,public.subscriptions to authenticated;
grant select,insert,update,delete on public.recipes,public.recipe_ingredients,public.ingredient_catalog
  to authenticated;
`);
await sql(readFileSync('supabase/migrations/20260902140000_workspace_viewers.sql','utf8'));
await sql(`create trigger on_auth_user_created after insert on auth.users for each row execute function private.handle_new_user();
alter table public.workspace_members drop constraint workspace_members_role_check;
alter table public.workspace_members add constraint workspace_members_role_check check(role in ('viewer','manager','head_chef'));
alter table public.workspace_members add column invite_sent_at timestamptz, add column invite_delivery text, add column invite_error text;
create policy recipe_images_select_entitled on storage.objects for select to authenticated using(bucket_id='recipe-images' and ((storage.foldername(name))[1]=auth.uid()::text or exists(select 1 from public.workspace_members wm where wm.owner_user_id::text=(storage.foldername(name))[1] and wm.member_user_id=auth.uid() and wm.status='active')));
`);
await sql(readFileSync('supabase/migrations/20260920163105_restore_server_entitlements.sql','utf8'));
// Exercise migration cleanup against real legacy rows, including a valid one.
await sql(`insert into auth.users(id,email,email_confirmed_at) values('${uid(101)}','legacy-owner@example.test',now()),('${uid(102)}','unverified@example.test',null),('${uid(103)}','legacy-attacker@example.test',now()),('${uid(104)}','legacy-member@example.test',now());
insert into public.subscriptions(user_id,status,current_period_end) values('${uid(101)}','active',now()+interval '30 days');
insert into public.workspace_members(owner_user_id,member_user_id,invited_email,status) values
('${uid(103)}','${uid(103)}','legacy-attacker@example.test','active'),
('${uid(101)}','${uid(103)}','victim@example.test','active'),
('${uid(101)}','${uid(102)}','unverified@example.test','active'),
('${uid(101)}','${uid(104)}','legacy-member@example.test','active');`);
if (!process.argv.includes('--baseline')) await sql(readFileSync('supabase/migrations/20261019173014_harden_workspace_identity_and_entitlements.sql','utf8'));
if (!process.argv.includes('--baseline')) await sql(readFileSync('supabase/migrations/20260916023654_manager247_pnl_reports_070.sql','utf8'));
if (!process.argv.includes('--baseline')) await sql(readFileSync('supabase/migrations/20261019173510_atomic_google_play_verification.sql','utf8'));
const migrationChecks=[];
for (const [email,expectedStatus,expectedMember] of [['legacy-attacker@example.test','revoked',null],['victim@example.test','pending',null],['unverified@example.test','pending',null],['legacy-member@example.test','active',uid(104)]]) {
  const row=(await db.query(`select status,member_user_id from public.workspace_members where invited_email='${email}'`)).rows[0];
  const pass=row.status===expectedStatus && row.member_user_id===expectedMember;
  migrationChecks.push({name:`Historical identity cleanup: ${email}`,status:pass?'PASS':'FAIL',...(pass?{}:{error:JSON.stringify(row)})});
}
await sql('delete from public.workspace_members; delete from public.subscriptions; delete from public.profiles; delete from auth.users;');
await sql(`grant usage on schema public to service_role; grant all on all tables in schema public to service_role;`);
const results=[...migrationChecks];
async function test(name, run) {
  await sql('begin;');
  try {
    await sql(`insert into auth.users(id,email,email_confirmed_at) values ('${owner}','owner@example.test',now()),('${member}','member@example.test',now()),('${attacker}','attacker@example.test',now()),('${other}','other@example.test',now()),('${admin}','admin@example.test',now());
    insert into public.subscriptions(user_id,status,current_period_end) values('${owner}','active',now()+interval '30 days');
    update public.profiles set role='admin' where user_id='${admin}';`);
    await run(); results.push({name, status:'PASS'});
  } catch(error) { results.push({name,status:'FAIL',error:error.message}); }
  finally { await sql('rollback;'); }
}
const link = (ownerId=owner, memberId=member, email='member@example.test') => sql(`insert into public.workspace_members(owner_user_id,member_user_id,invited_email,status) values('${ownerId}','${memberId}','${email}','active');`);
const prepare = (who=owner,email='member@example.test',role='viewer') => scalar(`select public.prepare_workspace_invitation('${who}','${email}','${role}') as value`);
await test('Data API cannot create self membership',async()=>{ await auth(attacker); await denied(`insert into public.workspace_members(owner_user_id,member_user_id,invited_email,status) values('${attacker}','${attacker}','attacker@example.test','active')`); });
await test('Data API cannot grant another member access',async()=>{ await auth(owner); await denied(`insert into public.workspace_members(owner_user_id,member_user_id,invited_email,status) values('${owner}','${member}','member@example.test','active')`); });
await test('Owner can revoke but cannot reactivate or rebind',async()=>{ await link(); await auth(owner); await sql(`update public.workspace_members set status='revoked' where owner_user_id='${owner}'`); assert.equal(await scalar(`select status as value from public.workspace_members limit 1`),'revoked'); await denied(`update public.workspace_members set status='active' where owner_user_id='${owner}'`); await denied(`update public.workspace_members set member_user_id='${attacker}' where owner_user_id='${owner}'`); });
await test('Members and unrelated owners cannot revoke another workspace',async()=>{ await link(); await auth(member); await sql(`update public.workspace_members set status='revoked' where owner_user_id='${owner}'`); await privileged(); assert.equal(await scalar('select status as value from public.workspace_members limit 1'),'active'); await auth(other); await sql(`update public.workspace_members set status='revoked' where owner_user_id='${owner}'`); await privileged(); assert.equal(await scalar('select status as value from public.workspace_members limit 1'),'active'); });
await test('Direct delete and role escalation are forbidden',async()=>{ await link(); await auth(owner); await denied('delete from public.workspace_members'); await denied("update public.workspace_members set role='manager'"); });
await test('Entitled owner grants professional access and shared images',async()=>{ await link(); await sql(`insert into storage.objects(bucket_id,name) values('recipe-images','${owner}/recipe.png')`); await auth(member); assert.equal(await scalar('select public.has_professional_access() as value'),true); assert.equal(await scalar(`select public.is_active_viewer_of('${owner}') as value`),true); assert.equal(await scalar('select count(*)::int as value from storage.objects'),1); });
await test('Owner expiration removes inherited professional and image access',async()=>{ await link(); await sql(`update public.subscriptions set current_period_end=now()-interval '1 second'; insert into storage.objects(bucket_id,name) values('recipe-images','${owner}/recipe.png')`); await auth(member); assert.equal(await scalar('select public.has_professional_access() as value'),false); assert.equal(await scalar(`select public.is_active_viewer_of('${owner}') as value`),false); assert.equal(await scalar('select count(*)::int as value from storage.objects'),0); });
await test('Admin grant and current trial remain entitled',async()=>{ await link(admin); await auth(member); assert.equal(await scalar('select public.has_professional_access() as value'),true); await privileged(); await sql(`delete from public.workspace_members; insert into public.subscriptions(user_id,status,current_period_end) values('${member}','trialing',now()+interval '3 days')`); await auth(member); assert.equal(await scalar('select public.has_professional_access() as value'),true); });
await test('Service invitation resolves confirmed Auth email despite forged profile',async()=>{ await sql(`update public.profiles set email='member@example.test' where user_id='${attacker}'`); await sql('set local role service_role;'); const row=await prepare(); assert.equal(row.status,'active'); await privileged(); assert.equal(await scalar('select member_user_id::text as value from public.workspace_members limit 1'),member); });
await test('Editable profile email cannot bind an invitation',async()=>{ await sql(`update public.profiles set email='victim@example.test' where user_id='${attacker}'`); await sql('set local role service_role;'); const row=await prepare(owner,'victim@example.test'); assert.equal(row.status,'pending'); await privileged(); assert.equal(await scalar('select member_user_id as value from public.workspace_members limit 1'),null); });
await test('Unconfirmed signup stays pending until Auth email is confirmed',async()=>{ await sql(`insert into public.workspace_members(owner_user_id,invited_email) values('${owner}','new@example.test'); insert into auth.users(id,email) values('${uid(6)}','new@example.test')`); assert.equal(await scalar('select status as value from public.workspace_members limit 1'),'pending'); await sql(`update auth.users set email_confirmed_at=now() where id='${uid(6)}'`); assert.equal(await scalar('select status as value from public.workspace_members limit 1'),'active'); });
await test('Signup cannot activate revoked invites or invites of expired owners',async()=>{ await sql(`insert into public.workspace_members(owner_user_id,invited_email,status) values('${owner}','new@example.test','revoked'),('${other}','new@example.test','pending'); insert into auth.users(id,email,email_confirmed_at) values('${uid(6)}','new@example.test',now())`); assert.equal(await scalar("select count(*)::int as value from public.workspace_members where status='active'"),0); });
await test('Email changes remove previous membership identity',async()=>{ await link(); await sql(`update auth.users set email='new-member@example.test' where id='${member}'`); await auth(member); assert.equal(await scalar('select public.has_professional_access() as value'),false); await privileged(); assert.equal(await scalar('select member_user_id as value from public.workspace_members limit 1'),null); });
await test('Service invitation rejects self, unpaid owners, inherited-only owners and invalid input',async()=>{ await link(); await sql('set local role service_role;'); await denied(`select public.prepare_workspace_invitation('${owner}','owner@example.test','viewer')`); await denied(`select public.prepare_workspace_invitation('${attacker}','other@example.test','viewer')`); await denied(`select public.prepare_workspace_invitation('${member}','other@example.test','viewer')`); await denied(`select public.prepare_workspace_invitation('${owner}','bad','viewer')`); await denied(`select public.prepare_workspace_invitation('${owner}','other@example.test','admin')`); });
await test('Invitation reservation rate limits repeat attempts atomically',async()=>{ await sql('set local role service_role;'); await prepare(); await denied(`select public.prepare_workspace_invitation('${owner}','member@example.test','viewer')`); });
await test('Authenticated users cannot call service-only identity RPC or private entitlement lookup',async()=>{ await auth(attacker); await denied(`select public.prepare_workspace_invitation('${owner}','attacker@example.test','viewer')`); await denied(`select private.workspace_owner_is_entitled('${owner}')`); });
await test('Confirmed allowlisted administrator keeps admin grant; unconfirmed cannot claim it',async()=>{ await sql(`insert into private.admin_emails(email) values('new-admin@example.test'); insert into auth.users(id,email) values('${uid(6)}','new-admin@example.test')`); assert.notEqual(await scalar(`select role as value from public.profiles where user_id='${uid(6)}'`),'admin'); await sql(`update auth.users set email_confirmed_at=now() where id='${uid(6)}'`); assert.equal(await scalar(`select role as value from public.profiles where user_id='${uid(6)}'`),'admin'); });
await test('Reinviting an unconfirmed account removes any stale previous identity',async()=>{ await sql(`insert into auth.users(id,email) values('${uid(6)}','unconfirmed@example.test'); insert into public.workspace_members(owner_user_id,member_user_id,invited_email,status) values('${owner}','${attacker}','unconfirmed@example.test','revoked')`); await sql('set local role service_role;'); assert.equal((await prepare(owner,'unconfirmed@example.test')).status,'pending'); await privileged(); assert.equal(await scalar('select member_user_id as value from public.workspace_members limit 1'),null); });
await test('Database rejects even service self membership and active rows without identity',async()=>{ await sql('set local role service_role;'); await denied(`insert into public.workspace_members(owner_user_id,member_user_id,invited_email,status) values('${attacker}','${attacker}','attacker@example.test','active')`); await denied(`insert into public.workspace_members(owner_user_id,invited_email,status) values('${owner}','member@example.test','active')`); });
await test('Authorization independently rejects mismatched Auth identity',async()=>{ await link(owner,attacker,'member@example.test'); await auth(attacker); assert.equal(await scalar('select public.has_professional_access() as value'),false); assert.equal(await scalar(`select public.is_active_viewer_of('${owner}') as value`),false); });
if (!process.argv.includes('--baseline')) {
  try { await sql(readFileSync('supabase/tests/workspace_security.sql','utf8')); results.push({name:'Rollback-only post-deployment SQL smoke test',status:'PASS'}); }
  catch(error) { results.push({name:'Rollback-only post-deployment SQL smoke test',status:'FAIL',error:error.message}); await sql('rollback;'); }
  try {
    await sql(readFileSync('supabase/tests/two_account_isolation.sql','utf8'));
    assert.equal(await scalar("select count(*)::int as value from auth.users where email like 'qa-isolation-%@example.invalid'"),0);
    assert.equal(await scalar("select count(*)::int as value from public.pnl_reports where notes = 'qa-isolation'"),0);
    results.push({name:'Two-account hosted-compatible isolation smoke test',status:'PASS'});
  } catch(error) {
    results.push({name:'Two-account hosted-compatible isolation smoke test',status:'FAIL',error:error.message});
    await sql('rollback;');
  }
}
console.log(JSON.stringify({mode:process.argv.includes('--baseline')?'baseline':'migration',passed:results.filter(r=>r.status==='PASS').length,failed:results.filter(r=>r.status==='FAIL').length,results},null,2));
await db.close();
if(results.some(r=>r.status==='FAIL')) process.exitCode=1;
