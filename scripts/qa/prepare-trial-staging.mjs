// Reproduce the application's prerequisites on the existing empty staging
// project. This tool only writes local SQL and runs isolated PostgreSQL checks;
// it never connects to Supabase, reads secrets, or applies remote migrations.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const migrationsDirectory = resolve(root, 'supabase/migrations');
const outputDirectory = resolve(root, 'qa-results');
const sourceNames = readdirSync(migrationsDirectory)
  .filter((name) => /^\d{14}_.+\.sql$/.test(name) && name < '20261101000000_')
  .sort();
const sources = sourceNames.map((name) => {
  const text = readFileSync(resolve(migrationsDirectory, name), 'utf8');
  return { name, text, sha256: createHash('sha256').update(text).digest('hex') };
});

function composeBaseline() {
  const guard = `begin;
-- EMPTY STAGING ONLY. Keep these guards and the single transaction intact.
lock table auth.users, public.recipes, public.recipe_ingredients in share mode;
do $staging_guard$
begin
  if exists(select 1 from auth.users) then
    raise exception 'trial_staging_requires_empty_auth';
  end if;
  if exists(select 1 from public.recipes) or exists(select 1 from public.recipe_ingredients) then
    raise exception 'trial_staging_requires_empty_recipes';
  end if;
  if (select count(*) from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public' and c.relkind in ('r','p')) <> 2 then
    raise exception 'trial_staging_requires_only_initial_recipe_tables';
  end if;
end;
$staging_guard$;
`;
  // These checked-in files are authoritative; remove only their standalone
  // transaction boundaries so no partial prerequisite state can be committed.
  const bodies = sources.map(({ name, text, sha256 }) => {
    const body = text.replace(/^\s*(?:begin|commit);\s*$/gmi, '');
    return `\n-- Source: supabase/migrations/${name}\n-- SHA256: ${sha256}\n${body}\n`;
  }).join('\n');
  return `${guard}${bodies}
-- Historical free-grant endpoints stay closed even before the new trial
-- migration is applied. This baseline must never open the legacy bypass.
revoke all on function public.start_my_trial() from public,anon,authenticated;
revoke all on function public.extend_my_demo_after_otp() from public,anon,authenticated;
commit;
`;
}

async function checkBaseline(baseline) {
  const { PGlite } = await import('@electric-sql/pglite');
  const initial = readFileSync(resolve(migrationsDirectory, '20260826000000_initial_recipe_schema.sql'), 'utf8');
  const db = new PGlite();
  const scalar = async (sql, args = []) => (await db.query(sql, args)).rows[0]?.value;
  const denied = async (sql, args = []) => {
    await db.exec('savepoint expected_gate_denial;');
    await assert.rejects(db.query(sql, args), /row-level security|permission denied/);
    await db.exec('rollback to savepoint expected_gate_denial; release savepoint expected_gate_denial;');
  };
  await db.exec(`
    set timezone='UTC';
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create schema storage;
    create function auth.jwt() returns jsonb language sql stable as $$
      select coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb,'{}'::jsonb)
    $$;
    create function auth.uid() returns uuid language sql stable as $$select nullif(auth.jwt()->>'sub','')::uuid$$;
    create table auth.users(
      id uuid primary key, email text, email_confirmed_at timestamptz, last_sign_in_at timestamptz,
      created_at timestamptz not null default now(), raw_user_meta_data jsonb not null default '{}',
      raw_app_meta_data jsonb not null default '{"provider":"email","providers":["email"]}'
    );
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,owner uuid,owner_id text);
    create function storage.foldername(text) returns text[] language sql immutable as $$select string_to_array($1,'/')$$;
    alter table storage.objects enable row level security;
    grant usage on schema public,auth,storage to anon,authenticated,service_role;
    grant select,insert,update,delete on storage.objects to authenticated;
    ${initial}
  `);

  try {
    // The deployment precondition must reject even one existing Auth account.
    await db.exec("insert into auth.users(id,email) values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','guard@example.invalid');");
    await assert.rejects(db.exec(baseline), /trial_staging_requires_empty_auth/);
    await db.exec('rollback; delete from auth.users;');
    await db.exec(baseline);
    assert.equal(await scalar("select to_regprocedure('public.has_professional_access()') is not null as value"), true);
    assert.equal(await scalar("select to_regprocedure('public.foodcost_recalculate(uuid)') is not null as value"), true);
    assert.equal(await scalar("select exists(select 1 from pg_trigger where tgname='on_auth_user_email_verified') as value"), true);
    assert.equal(await scalar("select exists(select 1 from pg_trigger where tgname='foodcost_refresh_lines') as value"), true);
    assert.equal(await scalar("select count(*)::int as value from auth.users"), 0);
    assert.equal(await scalar("select count(*)::int as value from public.recipes"), 0);
    assert.equal(await scalar("select has_function_privilege('authenticated','public.start_my_trial()','execute') as value"), false);

    const trialName = readdirSync(migrationsDirectory).find((name) => name.endsWith('_individual_trials.sql'));
    assert.ok(trialName, 'individual-trial migration is missing');
    await db.exec(readFileSync(resolve(migrationsDirectory, trialName), 'utf8'));
    await db.exec('begin;');
    const tester = '11111111-1111-4111-8111-111111111111';
    const other = '22222222-2222-4222-8222-222222222222';
    const owner = '33333333-3333-4333-8333-333333333333';
    const paid = '44444444-4444-4444-8444-444444444444';
    for (const [id, email] of [[tester, 'tester@example.invalid'], [other, 'other@example.invalid']]) {
      await db.query('insert into auth.users(id,email,email_confirmed_at,last_sign_in_at) values($1,$2,clock_timestamp(),clock_timestamp())', [id, email]);
    }
    await db.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: tester, role: 'authenticated' })]);
    await db.exec('set local role authenticated;');
    const before = await scalar('select public.get_my_trial_registration() as value');
    assert.equal(before.registered, false);
    assert.equal(await scalar('select public.has_professional_access() as value'), false);
    await denied("insert into public.hr_employees(user_id,name) values($1,'Unregistered employee')", [tester]);
    await denied("insert into public.haccp_equipment(user_id,name,kind) values($1,'Unregistered fridge','cold')", [tester]);
    await denied("insert into public.business_locations(owner_user_id,name) values($1,'Unregistered location')", [tester]);
    // Seed temporary rows as the migration role to prove reads are denied too,
    // then roll them back before testing genuinely fresh-account sample setup.
    await db.exec('savepoint unregistered_operational_fixtures; reset role;');
    await db.query("insert into public.hr_employees(user_id,name) values($1,'Hidden employee')", [tester]);
    await db.query("insert into public.haccp_equipment(user_id,name,kind) values($1,'Hidden fridge','cold')", [tester]);
    await db.query("insert into public.business_locations(owner_user_id,name) values($1,'Hidden location')", [tester]);
    await db.exec('set local role authenticated;');
    for (const table of ['hr_employees', 'haccp_equipment', 'business_locations']) {
      assert.equal(await scalar(`select count(*)::int as value from public.${table}`), 0);
    }
    await db.exec('rollback to savepoint unregistered_operational_fixtures; release savepoint unregistered_operational_fixtures;');
    const registered = await scalar("select public.complete_my_trial_registration('Staging fictional cafe','2026-11-01','2026-11-01') as value");
    assert.equal(registered.registered, true);
    assert.equal(await scalar('select public.has_professional_access() as value'), true);
    assert.equal(await scalar('select count(*)::int as value from public.recipes'), 1);
    assert.equal(await scalar('select count(*)::int as value from public.ingredient_catalog'), 2);
    assert.equal(await scalar('select count(*)::int as value from public.recipe_ingredients'), 2);
    assert.equal(await scalar('select total_cost as value from public.recipes'), '2.60');
    assert.equal(await scalar('select calculation_error as value from public.recipes'), null);
    await db.query("insert into public.hr_employees(user_id,name) values($1,'Registered employee')", [tester]);
    await db.query("insert into public.haccp_equipment(user_id,name,kind) values($1,'Registered fridge','cold')", [tester]);
    assert.equal((await db.query("update public.business_locations set address='Edited while entitled' returning id")).rows.length, 1);
    for (const table of ['hr_employees', 'haccp_equipment', 'business_locations']) {
      assert.equal(await scalar(`select count(*)::int as value from public.${table}`), 1);
    }
    await db.exec('savepoint private_registry_check;');
    await assert.rejects(db.query('select * from private.individual_trial_registrations'), /permission denied/);
    await db.exec('rollback to savepoint private_registry_check; release savepoint private_registry_check;');
    await db.exec('reset role;');
    await db.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: other, role: 'authenticated' })]);
    await db.exec('set local role authenticated;');
    assert.equal(await scalar('select count(*)::int as value from public.recipes'), 0);
    await db.exec('reset role;');
    // Exercise the actual viewer helper rather than replacing it with a stub.
    await db.query("select public.prepare_workspace_invitation($1,'other@example.invalid','viewer')", [tester]);
    await db.exec('set local role authenticated;');
    assert.equal(await scalar('select public.has_professional_access() as value'), true);
    assert.equal((await scalar('select public.get_my_trial_registration() as value')).eligible, false);
    assert.equal(await scalar('select count(*)::int as value from public.recipes'), 1);
    await db.exec('reset role;');
    await db.query("update private.individual_trial_registrations set started_at=now()-interval '11 days',expires_at=now()-interval '1 day' where user_id=$1", [tester]);
    await db.query("update public.subscriptions set current_period_start=now()-interval '11 days',current_period_end=now()-interval '1 day' where user_id=$1", [tester]);
    await db.exec('set local role authenticated;');
    assert.equal(await scalar('select public.has_professional_access() as value'), false);
    assert.equal(await scalar('select count(*)::int as value from public.recipes'), 0);
    // An expired sponsor cannot extend its old trial through a member. The
    // member may independently register once and receives separate owned data.
    const otherRegistration = await scalar("select public.complete_my_trial_registration('Second fictional cafe','2026-11-01','2026-11-01') as value");
    assert.notEqual(otherRegistration.location_id, registered.location_id);
    assert.equal(await scalar('select count(*)::int as value from public.recipes'), 1);
    assert.equal(await scalar('select count(*)::int as value from public.recipes where user_id=$1', [tester]), 0);
    await db.exec('reset role;');
    await db.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: tester, role: 'authenticated' })]);
    await db.exec('set local role authenticated;');
    assert.equal(await scalar('select public.has_professional_access() as value'), false);
    assert.equal(await scalar('select count(*)::int as value from public.recipes'), 0);
    for (const table of ['hr_employees', 'haccp_equipment', 'business_locations']) {
      assert.equal(await scalar(`select count(*)::int as value from public.${table}`), 0);
      assert.equal((await db.query(`update public.${table} set updated_at=clock_timestamp() returning id`)).rows.length, 0);
    }
    await denied("insert into public.hr_employees(user_id,name) values($1,'Expired employee')", [tester]);
    await denied("insert into public.haccp_equipment(user_id,name,kind) values($1,'Expired fridge','cold')", [tester]);
    await db.exec('reset role;');
    await db.query("insert into auth.users(id,email,last_sign_in_at) values($1,'admin@paradimoperations.com',clock_timestamp())", [owner]);
    assert.equal(await scalar('select role as value from public.profiles where user_id=$1', [owner]), 'owner');
    await db.query('update auth.users set email_confirmed_at=clock_timestamp() where id=$1', [owner]);
    assert.equal(await scalar('select role as value from public.profiles where user_id=$1', [owner]), 'admin');
    assert.equal(await scalar("select has_function_privilege('authenticated','private.grant_admin_access(uuid)','execute') as value"), false);
    await db.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: owner, role: 'authenticated' })]);
    await db.exec('set local role authenticated;');
    assert.equal(await scalar('select public.has_professional_access() as value'), true);
    assert.equal((await scalar('select public.get_my_trial_registration() as value')).eligible, false);
    assert.ok(Array.isArray(await scalar('select public.admin_list_trial_users() as value')));
    await db.query("insert into public.hr_employees(user_id,name) values($1,'Admin employee')", [owner]);
    await db.query("insert into public.haccp_equipment(user_id,name,kind) values($1,'Admin fridge','cold')", [owner]);
    await db.query("insert into public.business_locations(owner_user_id,name) values($1,'Admin location')", [owner]);
    for (const table of ['hr_employees', 'haccp_equipment', 'business_locations']) {
      assert.equal(await scalar(`select count(*)::int as value from public.${table}`), 1);
    }
    await db.exec('reset role;');
    await db.query("insert into auth.users(id,email,email_confirmed_at,last_sign_in_at) values($1,'paid@example.invalid',clock_timestamp(),clock_timestamp())", [paid]);
    await db.query("insert into public.subscriptions(user_id,platform,product_id,purchase_token_hash,status,current_period_start,current_period_end,auto_renew) values($1,'google_play','manager247_monthly','paid-staging-fixture','active',now(),now()+interval '30 days',true)", [paid]);
    const paidBefore = await scalar('select to_jsonb(s) as value from public.subscriptions s where user_id=$1', [paid]);
    await db.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: paid, role: 'authenticated' })]);
    await db.exec('set local role authenticated;');
    assert.equal(await scalar('select public.has_professional_access() as value'), true);
    assert.equal((await scalar("select public.complete_my_trial_registration('Ignored paid registration','2026-11-01','2026-11-01') as value")).eligible, false);
    assert.deepEqual(await scalar('select to_jsonb(s) as value from public.subscriptions s where user_id=$1', [paid]), paidBefore);
    await db.query("insert into public.hr_employees(user_id,name) values($1,'Paid employee')", [paid]);
    await db.query("insert into public.haccp_equipment(user_id,name,kind) values($1,'Paid fridge','cold')", [paid]);
    await db.query("insert into public.business_locations(owner_user_id,name) values($1,'Paid location')", [paid]);
    for (const table of ['hr_employees', 'haccp_equipment', 'business_locations']) {
      assert.equal(await scalar(`select count(*)::int as value from public.${table}`), 1);
    }
    await db.exec('rollback;');
    return { passed: true, migrationCount: sources.length, fullFoodcostTriggers: true, realOwnerRls: true,
      viewerExpiryRls: true, verifiedPrimaryAdminTrigger: true, operationalReadWriteGate: true,
      paidAdminAccessPreserved: true, hostedOperations: 0 };
  } finally {
    await db.close();
  }
}

mkdirSync(outputDirectory, { recursive: true });
const baseline = composeBaseline();
const output = resolve(outputDirectory, 'trial-staging-baseline.sql');
writeFileSync(output, baseline);
const manifest = sources.map(({ name, sha256 }) => ({ name, sha256 }));
writeFileSync(resolve(outputDirectory, 'trial-staging-baseline-manifest.json'), JSON.stringify(manifest, null, 2));
if (process.argv.includes('--check')) {
  console.log(JSON.stringify({ output, ...(await checkBaseline(baseline)) }, null, 2));
} else {
  console.log(JSON.stringify({ output, migrationCount: sources.length, localOnly: true }, null, 2));
}
