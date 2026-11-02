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
  const denied = async (sql, args = [], pattern = /row-level security|permission denied/) => {
    await db.exec('savepoint expected_gate_denial;');
    await assert.rejects(db.query(sql, args), pattern);
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
    const auditRlsName = readdirSync(migrationsDirectory).find((name) => name.endsWith('_harden_private_audit_rls.sql'));
    assert.ok(auditRlsName, 'private-audit RLS migration is missing');
    await db.exec(readFileSync(resolve(migrationsDirectory, auditRlsName), 'utf8'));
    await db.exec('begin;');
    const privateAuditChecks = [];
    for (const table of ['account_deletion_audit', 'demo_otp_extensions', 'subscription_access_audit']) {
      assert.equal(await scalar('select relrowsecurity as value from pg_class where oid=$1::regclass', ['private.' + table]), true, table + ' must enable RLS');
      privateAuditChecks.push(table + ': RLS enabled');
      for (const role of ['anon', 'authenticated', 'service_role']) {
        assert.equal(await scalar("select has_table_privilege($1,$2,'SELECT,INSERT,UPDATE,DELETE') as value", [role, 'private.' + table]), false, role + ' must not gain direct audit access');
        privateAuditChecks.push(table + ': no direct ' + role + ' privilege');
      }
    }
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
    // Both accounts are entitled at the same time. Positive own-row controls
    // make each foreign-row denial meaningful rather than testing an empty DB
    // or an account that has no access to anything. Roll back this entire block
    // before exercising intentionally shared viewer access below.
    await db.exec('savepoint bilateral_trial_isolation; reset role;');
    const isolationChecks = [];
    const verify = async (name, check) => { await check(); isolationChecks.push(name); };
    const as = async (id, role = 'authenticated') => {
      await db.exec('reset role;');
      await db.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: id, role })]);
      await db.exec('set local role ' + role);
    };
    await as(other);
    const secondTrial = await scalar("select public.complete_my_trial_registration('Second isolated fictional cafe','2026-11-01','2026-11-01') as value");
    assert.notEqual(secondTrial.location_id, registered.location_id);
    await db.query("insert into public.hr_employees(user_id,name) values($1,'Second fictional employee')", [other]);
    await db.query("insert into public.haccp_equipment(user_id,name,kind) values($1,'Second fictional fridge','cold')", [other]);
    const tables = [
      ['recipes', 'user_id', 1], ['recipe_ingredients', 'user_id', 2],
      ['ingredient_catalog', 'user_id', 2], ['business_locations', 'owner_user_id', 1],
      ['hr_employees', 'user_id', 1], ['haccp_equipment', 'user_id', 1],
    ];
    const ownershipDenial = /row-level security|permission denied|foreign key constraint|belongs to another|must belong|same owner|own recipe|Subrecipe|hr_owner_mismatch/i;
    for (const [caller, foreign, ownTrial] of [[tester, other, registered], [other, tester, secondTrial]]) {
      await as(caller);
      await verify(caller + ': current caller registration only', async () => {
        const mine = await scalar('select public.get_my_trial_registration() as value');
        assert.equal(mine.location_id, ownTrial.location_id);
        assert.equal(mine.restaurant_name, ownTrial.restaurant_name);
        assert.equal(mine.registered, true);
        assert.equal(await scalar('select public.has_professional_access() as value'), true);
      });
      for (const [table, key, expected] of tables) {
        await verify(caller + ': own ' + table + ' read', async () =>
          assert.equal(await scalar(`select count(*)::int as value from public.${table} where ${key}=$1`, [caller]), expected));
        await verify(caller + ': foreign ' + table + ' read denied', async () =>
          assert.equal(await scalar(`select count(*)::int as value from public.${table} where ${key}=$1`, [foreign]), 0));
        await verify(caller + ': foreign ' + table + ' update denied', async () =>
          assert.equal((await db.query(`update public.${table} set updated_at=clock_timestamp() where ${key}=$1 returning id`, [foreign])).rows.length, 0));
        await verify(caller + ': foreign ' + table + ' delete denied', async () =>
          assert.equal((await db.query(`delete from public.${table} where ${key}=$1 returning id`, [foreign])).rows.length, 0));
        await verify(caller + ': own ' + table + ' update works', async () =>
          assert.equal((await db.query(`update public.${table} set updated_at=clock_timestamp() where ${key}=$1 returning id`, [caller])).rows.length, expected));
        await verify(caller + ': ' + table + ' owner reassignment denied', () =>
          denied(`update public.${table} set ${key}=$1 where ${key}=$2`, [foreign, caller], ownershipDenial));
      }
      await verify(caller + ': foreign-owner insert denied', () =>
        denied("insert into public.hr_employees(user_id,name) values($1,'Spoofed owner')", [foreign], ownershipDenial));
      await verify(caller + ': private registry direct read denied', () => denied('select * from private.individual_trial_registrations'));
      await verify(caller + ': private notification direct read denied', () => denied('select * from private.trial_owner_notifications'));
      await verify(caller + ': non-admin roster denied', () => denied('select public.admin_list_trial_users()', [], /admin|permission denied/i));
      await db.exec('reset role;');
      const foreignRecipe = await scalar('select id as value from public.recipes where user_id=$1 limit 1', [foreign]);
      const foreignCatalog = await scalar('select id as value from public.ingredient_catalog where user_id=$1 limit 1', [foreign]);
      await as(caller);
      await verify(caller + ': foreign recipe parent denied', () =>
        denied('update public.recipe_ingredients set recipe_id=$1 where user_id=$2', [foreignRecipe, caller], ownershipDenial));
      await verify(caller + ': foreign ingredient catalog denied', () =>
        denied('update public.recipe_ingredients set ingredient_catalog_id=$1 where user_id=$2', [foreignCatalog, caller], ownershipDenial));
      await verify(caller + ': foreign subrecipe denied', () =>
        denied('update public.recipe_ingredients set subrecipe_id=$1 where user_id=$2', [foreignRecipe, caller], ownershipDenial));
    }
    await db.exec('reset role;');
    await db.query("update private.individual_trial_registrations set started_at=now()-interval '11 days',expires_at=now()-interval '1 day' where user_id=$1", [tester]);
    await db.query("update public.subscriptions set current_period_start=now()-interval '11 days',current_period_end=now()-interval '1 day' where user_id=$1", [tester]);
    await as(tester);
    await verify('first trial expires independently', async () => {
      assert.equal(await scalar('select public.has_professional_access() as value'), false);
      for (const [table] of tables) assert.equal(await scalar(`select count(*)::int as value from public.${table}`), 0);
    });
    await as(other);
    await verify('second trial retains independent access', async () => {
      assert.equal(await scalar('select public.has_professional_access() as value'), true);
      for (const [table, key, expected] of tables)
        assert.equal(await scalar(`select count(*)::int as value from public.${table} where ${key}=$1`, [other]), expected);
    });
    await as(null, 'anon');
    await verify('anonymous registration and roster denied', async () => {
      await denied('select public.get_my_trial_registration()');
      await denied('select public.admin_list_trial_users()');
      await denied('select * from private.individual_trial_registrations');
      await denied('select * from private.trial_owner_notifications');
    });
    await db.exec('reset role;');
    const functionCodeHashes = (await db.query(`
      select n.nspname as schema,p.oid::regprocedure::text as signature,md5(p.prosrc) as source_md5
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname in ('public','private') and p.proname in (
        'get_my_trial_registration','complete_my_trial_registration','admin_list_trial_users',
        'user_has_nontrial_entitlement','user_has_professional_access','has_professional_access',
        'is_active_viewer_of','observe_individual_trial','capture_individual_trial_sign_in',
        'claim_trial_owner_notifications','finish_trial_owner_notification')
      order by n.nspname,p.oid::regprocedure::text
    `)).rows;
    await db.exec('rollback to savepoint bilateral_trial_isolation; release savepoint bilateral_trial_isolation;');
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
    await db.exec('reset role;');
    const auditRowsBefore = await scalar('select count(*)::int as value from private.subscription_access_audit');
    assert.equal((await scalar("select private.activate_manual_subscription('tester@example.invalid',30,'Local RLS regression') as value")).status, 'active');
    assert.equal(await scalar('select count(*)::int as value from private.subscription_access_audit'), auditRowsBefore + 1);
    privateAuditChecks.push('trusted manual activation still writes its audit');
    assert.equal((await scalar("select private.deactivate_manual_subscription('tester@example.invalid','Local RLS regression') as value")).status, 'expired');
    assert.equal(await scalar('select count(*)::int as value from private.subscription_access_audit'), auditRowsBefore + 2);
    privateAuditChecks.push('trusted manual deactivation still writes its audit');
    const deletionRowsBefore = await scalar('select count(*)::int as value from private.account_deletion_audit');
    const deletionFixture = '55555555-5555-4555-8555-555555555555';
    await db.query("insert into auth.users(id,email,email_confirmed_at,last_sign_in_at) values($1,'audit-delete@example.invalid',clock_timestamp(),clock_timestamp())", [deletionFixture]);
    await db.exec('set local role service_role;');
    await db.query("select public.purge_own_data($1,'audit-delete@example.invalid')", [deletionFixture]);
    await db.exec('reset role;');
    assert.equal(await scalar('select count(*)::int as value from private.account_deletion_audit'), deletionRowsBefore + 1);
    assert.equal(await scalar('select count(*)::int as value from public.profiles where user_id=$1', [deletionFixture]), 0);
    privateAuditChecks.push('service-only account purge still writes its audit');
    await db.exec('rollback;');
    return { passed: true, migrationCount: sources.length, fullFoodcostTriggers: true, realOwnerRls: true,
      viewerExpiryRls: true, verifiedPrimaryAdminTrigger: true, operationalReadWriteGate: true,
      paidAdminAccessPreserved: true, bilateralIsolation: { passed: isolationChecks.length, checks: isolationChecks },
      functionCodeHashes, privateAuditRls: { passed: privateAuditChecks.length, checks: privateAuditChecks }, hostedOperations: 0 };
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
