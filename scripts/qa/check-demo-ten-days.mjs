// Local PostgreSQL regression harness. Never connects to a hosted database.
// Run from the repository root: node scripts/qa/check-demo-ten-days.mjs
// QA_PGLITE_PATH can override the pinned project dependency for isolated debugging.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const runtime = process.env.QA_PGLITE_PATH;
const { PGlite } = runtime
  ? await import(pathToFileURL(resolve(runtime, 'dist/index.js')).href)
  : await import('@electric-sql/pglite');
const db = new PGlite();
const sql = (value) => db.exec(value);
const query = async (value, parameters = []) => (await db.query(value, parameters)).rows;
const scalar = async (value, parameters = []) => (await query(value, parameters))[0]?.value;
const migration = 'supabase/migrations/20261030064717_demo_10d_otp_access.sql';
const foundation = readFileSync('supabase/migrations/20260826210000_mobile_foundation.sql', 'utf8');
const createTable = (table) => {
  const statement = foundation.match(new RegExp(`create table if not exists public\\.${table} \\([\\s\\S]*?\\n\\);`));
  assert.ok(statement, `Missing authoritative ${table} fixture DDL`);
  return statement[0];
};
const uid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const demo = uid(1), owner = uid(2), unrelated = uid(3);
const identities = [[demo, 'demo@paradim.ro'], [owner, 'paul.nemesu@paradim.ro'], [unrelated, 'other@example.invalid']];
const results = [];

// Only the tables/roles needed by this RPC are provisioned. Real table DDL keeps
// constraints and timestamp precision meaningful; auth helpers model signed JWT
// claims installed by the gateway, not an ability to change claims via Data API.
await sql(`
  set timezone = 'UTC';
  create role anon; create role authenticated;
  create schema auth;
  create function auth.jwt() returns jsonb language sql stable as $$
    select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb)
  $$;
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(auth.jwt() ->> 'sub', '')::uuid
  $$;
  grant usage on schema public, auth to authenticated, anon;
  create table auth.users (
    id uuid primary key, email text, email_confirmed_at timestamptz,
    raw_app_meta_data jsonb not null default '{"provider":"email","providers":["email"]}',
    raw_user_meta_data jsonb not null default '{}'
  );
  ${createTable('profiles')}
  ${createTable('subscriptions')}
  alter table public.profiles drop constraint profiles_role_check;
  alter table public.profiles add constraint profiles_role_check
    check (role in ('owner', 'manager', 'chef', 'consultant', 'admin'));
  alter table public.subscriptions drop constraint subscriptions_platform_check;
  alter table public.subscriptions add constraint subscriptions_platform_check
    check (platform in ('google_play', 'admin_grant', 'web', 'manual'));
  alter table public.profiles enable row level security;
  alter table public.subscriptions enable row level security;
  create policy profiles_select_own on public.profiles for select to authenticated
    using (user_id = auth.uid());
  create policy subscriptions_select_own on public.subscriptions for select to authenticated
    using (user_id = auth.uid());
  grant select on public.profiles, public.subscriptions to authenticated;
`);
await sql(readFileSync(migration, 'utf8'));

const privileged = () => sql('reset role;');
const epochOffset = async (seconds = 0) => Number(await scalar(
  'select floor(extract(epoch from clock_timestamp()))::bigint + $1::bigint as value', [seconds],
));
async function authenticate(id = demo, overrides = {}, role = 'authenticated') {
  await privileged();
  const claims = {
    sub: id,
    email: identities.find(([userId]) => userId === id)?.[1] ?? 'demo@paradim.ro',
    role,
    amr: [{ method: 'otp', timestamp: await epochOffset() }],
    ...overrides,
  };
  await query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify(claims)]);
  await sql(`set local role ${role};`);
}
const invoke = () => query('select * from public.extend_my_demo_after_otp()');
const subscription = async (id = demo) => {
  await privileged();
  return scalar('select to_jsonb(s) as value from public.subscriptions s where user_id = $1::uuid', [id]);
};
async function denied(statement, expectedMessage, expectedCode) {
  await sql('savepoint expected_denial;');
  let error;
  try { await sql(statement); } catch (caught) { error = caught; }
  await sql('rollback to savepoint expected_denial; release savepoint expected_denial;');
  assert.ok(error, 'operation unexpectedly allowed');
  if (expectedMessage) assert.match(error.message, expectedMessage);
  if (expectedCode) assert.equal(error.code, expectedCode);
}
async function seedSubscription({
  userId = demo, product = 'manager247_demo_10d', status = 'trialing',
  end = "clock_timestamp() + interval '5 days'", autoRenew = false,
} = {}) {
  await privileged();
  await query(`
    insert into public.subscriptions (
      user_id, platform, product_id, purchase_token_hash, status,
      current_period_start, current_period_end, auto_renew
    ) values ($1::uuid, 'manual', $2, 'fixture:' || $1, $3,
      clock_timestamp() - interval '5 days', ${end}, $4)
  `, [userId, product, status, autoRenew]);
}
async function test(name, run) {
  await sql('begin;');
  try {
    for (const [id, email] of identities) {
      await query('insert into auth.users(id, email, email_confirmed_at) values ($1::uuid, $2, now())', [id, email]);
      await query('insert into public.profiles(user_id, email) values ($1::uuid, $2)', [id, email]);
    }
    await run();
    results.push({ name, status: 'PASS' });
  } catch (error) {
    results.push({ name, status: 'FAIL', error: error.stack ?? error.message });
  } finally {
    await sql('rollback;');
  }
}

await test('Fresh email OTP creates exactly one nonrenewing ten-day trial', async () => {
  const before = await scalar('select clock_timestamp() as value');
  await authenticate();
  const result = await invoke();
  assert.equal(result.length, 1);
  assert.equal(result[0].status, 'trialing');
  const row = await subscription();
  assert.equal(row.user_id, demo);
  assert.equal(row.platform, 'manual');
  assert.equal(row.product_id, 'manager247_demo_10d');
  assert.equal(row.purchase_token_hash, `demo10d:${demo}`);
  assert.equal(row.auto_renew, false);
  assert.equal(await scalar(`select current_period_end = current_period_start + interval '10 days'
    and extract(epoch from current_period_end - current_period_start) = 864000
    and last_verified_at = current_period_start as value from public.subscriptions`), true);
  assert.equal(await scalar(`select current_period_start >= $1::timestamptz
    and current_period_start <= clock_timestamp() as value from public.subscriptions`, [before]), true);
  assert.equal(await scalar('select count(*)::int as value from public.subscriptions'), 1);
});

await test('Repeated valid OTP preserves the original expiry and all subscription fields', async () => {
  await authenticate();
  const first = await invoke();
  const before = await subscription();
  await authenticate();
  const second = await invoke();
  assert.deepEqual(second, first);
  assert.deepEqual(await invoke(), first);
  assert.deepEqual(await subscription(), before);
});

for (const [description, end] of [
  ['past', "clock_timestamp() - interval '1 second'"],
  ['boundary', 'now()'],
  ['missing', 'null'],
]) {
  await test(`A demo with ${description} expiry becomes expired without a renewed window`, async () => {
    await seedSubscription({ end, autoRenew: true });
    const before = await subscription();
    await authenticate();
    const result = await invoke();
    assert.equal(result[0].status, 'expired');
    const after = await subscription();
    assert.equal(after.current_period_end, before.current_period_end);
    assert.equal(after.current_period_start, before.current_period_start);
    assert.equal(after.auto_renew, false);
    assert.equal(after.status, 'expired');
    await authenticate();
    assert.equal((await invoke())[0].status, 'expired');
    assert.equal((await subscription()).current_period_end, before.current_period_end);
  });
}

await test('An already expired demo is not reactivated even with a future stored expiry', async () => {
  await seedSubscription({ status: 'expired' });
  const before = await subscription();
  await authenticate();
  assert.equal((await invoke())[0].status, 'expired');
  assert.deepEqual(await subscription(), before);
});

for (const [description, id] of [['PARADIM owner', owner], ['unrelated email', unrelated]]) {
  await test(`${description} cannot activate the demo with a fresh OTP`, async () => {
    await authenticate(id);
    await denied('select public.extend_my_demo_after_otp()', /not eligible for demo access/);
    await privileged();
    assert.equal(await scalar('select count(*)::int as value from public.subscriptions'), 0);
  });
}

await test('Missing authenticated user identity is rejected', async () => {
  await authenticate(null);
  await denied('select public.extend_my_demo_after_otp()', /Authentication required/);
});

await test('Anonymous role cannot execute even with forged eligible JWT fixture claims', async () => {
  await authenticate(demo, {}, 'anon');
  await denied('select public.extend_my_demo_after_otp()', /permission denied/, '42501');
  await privileged();
  assert.equal(await scalar("select has_function_privilege('anon', 'public.extend_my_demo_after_otp()', 'execute') as value"), false);
  assert.equal(await scalar("select has_function_privilege('authenticated', 'public.extend_my_demo_after_otp()', 'execute') as value"), true);
});

const invalidOtpCases = [
  ['missing AMR', () => ({ amr: undefined })],
  ['empty AMR', () => ({ amr: [] })],
  ['password authentication', async () => ({ amr: [{ method: 'password', timestamp: await epochOffset() }] })],
  ['stale OTP', async () => ({ amr: [{ method: 'otp', timestamp: await epochOffset(-660) }] })],
  ['future OTP beyond clock skew allowance', async () => ({ amr: [{ method: 'otp', timestamp: await epochOffset(120) }] })],
  ['missing timestamp', () => ({ amr: [{ method: 'otp' }] })],
  ['malformed timestamp', () => ({ amr: [{ method: 'otp', timestamp: 'not-a-number' }] })],
  ['overflowing timestamp', () => ({ amr: [{ method: 'otp', timestamp: '99999999999999999999' }] })],
  ['malformed AMR object', () => ({ amr: { method: 'otp', timestamp: 1 } })],
];
for (const [description, claims] of invalidOtpCases) {
  await test(`${description} cannot activate or renew a demo`, async () => {
    const overrides = await claims();
    await authenticate(demo, overrides);
    await denied('select public.extend_my_demo_after_otp()', /fresh email OTP is required/);
    assert.equal(await subscription(), undefined);
    await seedSubscription({ end: "clock_timestamp() - interval '1 day'" });
    const before = await subscription();
    await authenticate(demo, overrides);
    await denied('select public.extend_my_demo_after_otp()', /fresh email OTP is required/);
    assert.deepEqual(await subscription(), before);
  });
}

await test('Most recent valid OTP is selected among AMR methods', async () => {
  await authenticate(demo, { amr: [
    { method: 'otp', timestamp: await epochOffset(-900) },
    { method: 'otp', timestamp: String(await epochOffset(-30)) },
    { method: 'password', timestamp: await epochOffset() },
    { method: 'otp', timestamp: 'invalid' },
  ] });
  assert.equal((await invoke())[0].status, 'trialing');
});

await test('OTP within the permitted positive clock skew activates normally', async () => {
  await authenticate(demo, { amr: [{ method: 'otp', timestamp: await epochOffset(30) }] });
  assert.equal((await invoke())[0].status, 'trialing');
});

await test('Email comparison follows the migration case and whitespace normalization', async () => {
  await authenticate(demo, { email: '  DEMO@PARADIM.RO  ' });
  assert.equal((await invoke())[0].status, 'trialing');
});

for (const product of ['professional_foodcost_admin', 'manager247_yearly']) {
  await test(`Existing ${product} entitlement cannot be replaced by the demo`, async () => {
    await seedSubscription({ product, status: 'active', autoRenew: true });
    const before = await subscription();
    await authenticate();
    await denied('select public.extend_my_demo_after_otp()', /already has a different entitlement/);
    assert.deepEqual(await subscription(), before);
  });
}

await test('Activation changes no profile role or Auth metadata and touches no other user', async () => {
  await seedSubscription({ userId: owner, product: 'professional_foodcost_admin', status: 'active' });
  const beforeUsers = await query('select to_jsonb(u) as value from auth.users u order by id');
  const beforeProfiles = await query('select to_jsonb(p) as value from public.profiles p order by user_id');
  const ownerSubscription = await subscription(owner);
  await authenticate(demo, {
    app_metadata: { role: 'admin', plan: 'unlimited' },
    user_metadata: { role: 'admin', email: 'paul.nemesu@paradim.ro' },
  });
  assert.equal((await invoke())[0].status, 'trialing');
  await privileged();
  assert.deepEqual(await query('select to_jsonb(u) as value from auth.users u order by id'), beforeUsers);
  assert.deepEqual(await query('select to_jsonb(p) as value from public.profiles p order by user_id'), beforeProfiles);
  assert.deepEqual(await subscription(owner), ownerSubscription);
});

await test('Editable metadata cannot substitute for the eligible signed email or fresh OTP', async () => {
  await authenticate(unrelated, {
    user_metadata: { email: 'demo@paradim.ro', role: 'admin' },
    app_metadata: { email: 'demo@paradim.ro', role: 'admin' },
  });
  await denied('select public.extend_my_demo_after_otp()', /not eligible for demo access/);
  await authenticate(demo, { amr: [], app_metadata: { role: 'admin', amr: [{ method: 'otp', timestamp: await epochOffset() }] } });
  await denied('select public.extend_my_demo_after_otp()', /fresh email OTP is required/);
  assert.equal(await subscription(), undefined);
});

await test('Authenticated callers cannot bypass the RPC to write entitlement fields', async () => {
  await seedSubscription();
  const before = await subscription();
  await authenticate();
  await denied("update public.subscriptions set current_period_end = '2099-12-31'", /permission denied/, '42501');
  await denied("update public.profiles set role = 'admin'", /permission denied/, '42501');
  assert.deepEqual(await subscription(), before);
});

console.log(JSON.stringify({
  mode: 'local-only', migration,
  passed: results.filter(({ status }) => status === 'PASS').length,
  failed: results.filter(({ status }) => status === 'FAIL').length,
  results,
}, null, 2));
await db.close();
if (results.some(({ status }) => status === 'FAIL')) process.exitCode = 1;
