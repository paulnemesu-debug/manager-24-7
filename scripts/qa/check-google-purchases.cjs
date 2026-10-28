/* Run actual Edge source + migration in isolated PGlite. Google/Auth are synthetic.
 * QA_PGLITE_MODULE must point at an independently installed @electric-sql/pglite.
 * No live network, server credentials, accounts or purchases are used.
 */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { createHash, generateKeyPairSync, webcrypto } = require('node:crypto');
const ts = require('typescript');
const { PGlite } = require(process.env.QA_PGLITE_MODULE || '@electric-sql/pglite');
const root = path.resolve(__dirname, '../..');
const out = process.env.QA_PAYMENT_OUTPUT;
const now = Date.now(), day = 86400000;
const iso = n => new Date(now + n * day).toISOString();
const hash = s => createHash('sha256').update(s).digest('hex');
const user = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';
const product = 'synthetic_pro', packageName = 'example.invalid.manager247';
const code = ts.transpileModule(fs.readFileSync(path.join(root, 'supabase/functions/verify-google-play-purchase/index.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const privateKey = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({ type: 'pkcs8', format: 'pem' });
const checks = [];
let db;
const purchase = overrides => ({
  subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE', acknowledgementState: 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED',
  startTime: iso(-1), externalAccountIdentifiers: { obfuscatedExternalAccountId: hash(user) },
  lineItems: [{ productId: product, expiryTime: iso(30), autoRenewingPlan: { autoRenewEnabled: true } }], ...overrides,
});
const sqlRpc = async args => {
  const names = ['p_user_id', 'p_product_id', 'p_token_hash', 'p_linked_token_hash', 'p_status', 'p_order_id', 'p_period_start', 'p_period_end', 'p_auto_renew', 'p_verified_at'];
  try {
    const { rows } = await db.query(`select public.apply_verified_google_play_subscription(${names.map((n, i) => `${n} => $${i + 1}`).join(',')}) as result`, names.map(n => args[n]));
    return { data: rows[0].result, error: null };
  } catch (error) { return { data: null, error }; }
};
function harness({ receipt = purchase(), account = user, failure, clock = now } = {}) {
  let handler; const calls = [], rpcs = [];
  const adapter = {
    auth: { getUser: async token => ({ data: { user: token === 'synthetic-session' ? { id: account } : null }, error: null }) },
    rpc: async (name, args) => { assert.equal(name, 'apply_verified_google_play_subscription'); rpcs.push(args); return failure === 'sql' ? { data: null, error: new Error('Injected database failure') } : sqlRpc(args); },
    // Execute old verifier writes too, so the pre-fix RED run reproduces data loss.
    from: table => { assert.equal(table, 'subscriptions'); return {
      select: () => ({ eq: (_, value) => ({ maybeSingle: async () => ({ data: (await db.query('select * from public.subscriptions where purchase_token_hash=$1', [value])).rows[0], error: null }) }) }),
      update: values => ({ eq: async (_, token) => { await db.query('update public.subscriptions set status=$1,current_period_end=$2 where purchase_token_hash=$3', [values.status, values.current_period_end, token]); return { error: null }; } }),
      upsert: async row => {
        if (failure === 'sql') return { error: new Error('Injected database failure') };
        const fields = Object.keys(row);
        await db.query(`insert into public.subscriptions(${fields}) values(${fields.map((_, i) => `$${i + 1}`)}) on conflict(user_id) do update set ${fields.filter(f => f !== 'user_id').map(f => `${f}=excluded.${f}`).join(',')}`, Object.values(row));
        return { error: null };
      },
    }; },
  };
  class Clock extends Date { constructor(...args) { super(...(args.length ? args : [clock])); } static now() { return clock; } }
  vm.runInNewContext(code, {
    require: name => { assert.equal(name, 'npm:@supabase/supabase-js@2.112.4'); return { createClient: () => adapter }; }, exports: {},
    Deno: { serve: cb => { handler = cb; }, env: { get: key => ({ SUPABASE_URL: 'https://example.invalid', SUPABASE_SERVICE_ROLE_KEY: 'synthetic', GOOGLE_PLAY_PACKAGE_NAME: packageName, GOOGLE_PLAY_SUBSCRIPTION_ID: product, GOOGLE_PLAY_SERVICE_ACCOUNT_JSON: JSON.stringify({ client_email: 'qa@example.invalid', private_key: privateKey }) })[key] } },
    crypto: webcrypto, Date: Clock, Response, Request, URLSearchParams, TextEncoder, Uint8Array, atob, btoa,
    console: { error() {} }, fetch: async (url) => {
      calls.push(String(url));
      if (String(url) === 'https://oauth2.googleapis.com/token') return Response.json({ access_token: 'synthetic' }, { status: failure === 'oauth' ? 503 : 200 });
      if (String(url).includes('/subscriptionsv2/')) return Response.json(receipt, { status: failure === 'google' ? 503 : 200 });
      if (String(url).endsWith(':acknowledge')) return new Response(null, { status: 204 });
      throw new Error('Unexpected network operation');
    },
  });
  return { calls, rpcs, async invoke(token = 'token-A', overrides = {}, method = 'POST', authorization = 'Bearer synthetic-session') {
    const res = await handler(new Request('https://example.invalid/verify', { method, headers: { Authorization: authorization, 'Content-Type': 'application/json' }, ...(method === 'POST' ? { body: JSON.stringify({ packageName, productId: product, purchaseToken: token, ...overrides }) } : {}) }));
    return { status: res.status, body: res.headers.get('content-type')?.includes('application/json') ? await res.json() : await res.text() };
  } };
}
const row = async (id = user) => (await db.query('select * from public.subscriptions where user_id=$1', [id])).rows[0];
const ledger = async token => (await db.query('select * from private.google_play_purchase_tokens where token_hash=$1', [hash(token)])).rows[0];
async function reset() { await db.exec('truncate public.subscriptions, private.google_play_purchase_tokens'); }
async function check(name, fn) { try { await reset(); await fn(); checks.push({ name, result: 'PASS' }); } catch (e) { checks.push({ name, result: 'FAIL', evidence: e.message }); } }
async function main() {
  db = new PGlite();
  await db.exec(`create schema auth; create schema private; create role anon; create role authenticated; create role service_role bypassrls;
    create table auth.users(id uuid primary key);
    insert into auth.users values('${user}'),('${other}');
    create table public.subscriptions(user_id uuid primary key references auth.users(id) on delete cascade, platform text not null default 'google_play', product_id text not null, purchase_token_hash text not null unique, status text not null default 'none', google_order_id text, current_period_start timestamptz, current_period_end timestamptz, auto_renew boolean not null default false, last_verified_at timestamptz not null default now(), created_at timestamptz not null default now(), updated_at timestamptz not null default now());
    alter table public.subscriptions enable row level security; grant usage on schema public,auth to service_role; grant all on public.subscriptions to service_role; grant select on auth.users to service_role;`);
  await db.query("insert into public.subscriptions(user_id,product_id,purchase_token_hash,status,current_period_end) values($1,'legacy',$2,'active',$3)", [user, hash('legacy-token'), iso(30)]);
  const migration = fs.readFileSync(path.join(root, 'supabase/migrations/20261019173510_atomic_google_play_verification.sql'), 'utf8');
  if (migration.trim()) await db.exec(migration);
  else await db.exec('create table private.google_play_purchase_tokens(token_hash text primary key,user_id uuid references auth.users(id) on delete cascade,superseded_by_hash text,last_verified_at timestamptz)');
  const migratedLegacy = await ledger('legacy-token');
  await check('Migration backfills ownership of existing Google subscription', async () => {
    assert.equal(migratedLegacy?.user_id, user); assert.equal(migratedLegacy.superseded_by_hash, null);
  });
  await check('Old expired receipt preserves a different current paid token (PAY03)', async () => {
    await harness().invoke(); const p = purchase({ subscriptionState: 'SUBSCRIPTION_STATE_EXPIRED' }); p.lineItems[0].expiryTime = iso(-1);
    assert.equal((await harness({ receipt: p }).invoke('old')).status, 403); assert.equal((await row()).purchase_token_hash, hash('token-A')); assert.equal((await row()).status, 'active');
  });
  await check('Pending linked replacement cannot expire current grant (PAY03)', async () => {
    await harness().invoke(); const p = purchase({ subscriptionState: 'SUBSCRIPTION_STATE_PENDING', linkedPurchaseToken: 'token-A' });
    assert.equal((await harness({ receipt: p }).invoke('pending')).status, 403); assert.equal((await row()).status, 'active'); assert.equal((await row()).purchase_token_hash, hash('token-A'));
  });
  for (const state of ['ACTIVE', 'IN_GRACE_PERIOD', 'CANCELED']) for (const expiry of [undefined, iso(-1), 'invalid']) await check(`${state} with ${expiry ?? 'missing'} expiry is denied (PAY05)`, async () => {
    const p = purchase({ subscriptionState: 'SUBSCRIPTION_STATE_' + state, acknowledgementState: 'ACKNOWLEDGEMENT_STATE_PENDING' }); p.lineItems[0].expiryTime = expiry;
    const h = harness({ receipt: p }); assert.equal((await h.invoke()).body.valid, false); assert.equal(h.calls.filter(x => x.endsWith(':acknowledge')).length, 0);
  });
  await check('Older still-active unrelated token cannot shorten current entitlement', async () => {
    await harness().invoke(); const p = purchase({ startTime: iso(-60) }); p.lineItems[0].expiryTime = iso(2);
    assert.equal((await harness({ receipt: p }).invoke('old-active')).status, 403); assert.equal((await row()).purchase_token_hash, hash('token-A'));
  });
  await check('Same-token revocation is applied', async () => {
    await harness().invoke(); const p = purchase({ subscriptionState: 'SUBSCRIPTION_STATE_EXPIRED' }); p.lineItems[0].expiryTime = iso(-1);
    assert.equal((await harness({ receipt: p, clock: now + 1 }).invoke()).status, 403); assert.equal((await row()).status, 'expired');
  });
  await check('Same-token renewal extends the period', async () => {
    await harness().invoke(); const p = purchase(); p.lineItems[0].expiryTime = iso(60);
    assert.equal((await harness({ receipt: p, clock: now + 1 }).invoke()).status, 200); assert.equal(new Date((await row()).current_period_end).toISOString(), iso(60));
  });
  await check('Valid linked replacement permanently invalidates predecessor', async () => {
    await harness().invoke(); const p = purchase({ linkedPurchaseToken: 'token-A' }); p.lineItems[0].expiryTime = iso(10);
    assert.equal((await harness({ receipt: p, clock: now + 1 }).invoke('token-B')).status, 200);
    assert.equal((await ledger('token-A')).superseded_by_hash, hash('token-B'));
    assert.equal((await harness({ clock: now + 2 }).invoke()).status, 403); assert.equal((await row()).purchase_token_hash, hash('token-B'));
  });
  await check('Invalid linked replacement never supersedes predecessor', async () => {
    await harness().invoke(); const p = purchase({ linkedPurchaseToken: 'token-A' }); delete p.lineItems[0].expiryTime;
    assert.equal((await harness({ receipt: p }).invoke('bad')).status, 403); assert.equal((await ledger('token-A')).superseded_by_hash, null); assert.equal((await row()).status, 'active');
  });
  await check('A receipt owned by another account cannot be assigned or changed', async () => {
    await harness().invoke(); const p = purchase({ externalAccountIdentifiers: { obfuscatedExternalAccountId: hash(other) } });
    assert.equal((await harness({ receipt: p, account: other }).invoke()).status, 409); assert.equal(await row(other), undefined); assert.equal((await row()).status, 'active');
  });
  await check('Foreign linked token rejects transaction without touching either grant', async () => {
    await harness().invoke(); const p = purchase({ linkedPurchaseToken: 'token-A', externalAccountIdentifiers: { obfuscatedExternalAccountId: hash(other) } });
    assert.equal((await harness({ receipt: p, account: other }).invoke('foreign')).status, 409); assert.equal((await row()).status, 'active'); assert.equal(await row(other), undefined);
  });
  await check('Older response arriving after revocation cannot reactivate token', async () => {
    await harness().invoke(); await harness({ receipt: purchase({ subscriptionState: 'SUBSCRIPTION_STATE_EXPIRED' }), clock: now + 20 }).invoke();
    assert.equal((await harness({ clock: now + 10 }).invoke()).status, 403); assert.equal((await row()).status, 'expired');
  });
  await check('Newer same-token revocation overrides previous active response', async () => {
    await harness().invoke(); await harness({ receipt: purchase({ subscriptionState: 'SUBSCRIPTION_STATE_ON_HOLD' }), clock: now + 20 }).invoke(); assert.equal((await row()).status, 'paused');
  });
  await check('Same-millisecond concurrent response cannot undo revocation', async () => {
    await harness().invoke(); await harness({ receipt: purchase({ subscriptionState: 'SUBSCRIPTION_STATE_EXPIRED' }) }).invoke();
    assert.equal((await harness().invoke()).status, 403); assert.equal((await row()).status, 'expired');
  });
  await check('Valid newer unrelated receipt replaces current and cannot later be reassigned', async () => {
    await harness().invoke(); const p = purchase({ startTime: iso(0) }); p.lineItems[0].expiryTime = iso(60);
    assert.equal((await harness({ receipt: p }).invoke('token-B')).status, 200);
    const foreign = purchase({ externalAccountIdentifiers: { obfuscatedExternalAccountId: hash(other) } });
    assert.equal((await harness({ receipt: foreign, account: other }).invoke()).status, 409); assert.equal((await row()).purchase_token_hash, hash('token-B')); assert.equal(await row(other), undefined);
  });
  await check('Different inactive Google receipt preserves an active manual grant', async () => {
    await db.query("insert into public.subscriptions(user_id,platform,product_id,purchase_token_hash,status,current_period_end) values($1,'manual','manual',$2,'active',$3)", [user, 'manual-grant', iso(90)]);
    assert.equal((await harness({ receipt: purchase({ subscriptionState: 'SUBSCRIPTION_STATE_PENDING' }) }).invoke()).status, 403); assert.equal((await row()).platform, 'manual'); assert.equal((await row()).status, 'active');
  });
  for (const state of ['PENDING', 'PENDING_PURCHASE_CANCELED']) await check(`Inactive ${state} receipt with unknown start permits a fresh unrelated paid token`, async () => {
    const pending = purchase({ subscriptionState: 'SUBSCRIPTION_STATE_' + state });
    delete pending.startTime; delete pending.lineItems[0].expiryTime;
    assert.equal((await harness({ receipt: pending }).invoke('initial-pending')).status, 403);
    assert.equal((await row()).current_period_start, null);
    assert.equal((await harness({ clock: now + 1 }).invoke('fresh-paid')).status, 200);
    assert.equal((await row()).status, 'active'); assert.equal((await row()).purchase_token_hash, hash('fresh-paid'));
    assert.equal((await ledger('initial-pending')).superseded_by_hash, hash('fresh-paid'));
  });
  await check('Inactive known-start grant still rejects a provably older unrelated token', async () => {
    await harness({ receipt: purchase({ subscriptionState: 'SUBSCRIPTION_STATE_ON_HOLD' }) }).invoke();
    const old = purchase({ startTime: iso(-60) }); old.lineItems[0].expiryTime = iso(60);
    assert.equal((await harness({ receipt: old, clock: now + 1 }).invoke('older-token')).status, 403);
    assert.equal((await row()).purchase_token_hash, hash('token-A')); assert.equal((await row()).status, 'paused');
  });
  await check('Active unknown-start grant still blocks unordered unrelated replacement', async () => {
    const current = purchase(); delete current.startTime; assert.equal((await harness({ receipt: current }).invoke()).status, 200);
    const next = purchase(); next.lineItems[0].expiryTime = iso(60);
    assert.equal((await harness({ receipt: next, clock: now + 1 }).invoke('unordered')).status, 403);
    assert.equal((await row()).purchase_token_hash, hash('token-A')); assert.equal((await row()).status, 'active');
  });
  await check('Concurrent synthetic claims serialize to one owner', async () => {
    const responses = await Promise.all([harness().invoke(), harness({ account: other, receipt: purchase({ externalAccountIdentifiers: { obfuscatedExternalAccountId: hash(other) } }) }).invoke()]);
    assert.deepEqual(responses.map(r => r.status).sort(), [200, 409]); assert.equal((await db.query('select * from public.subscriptions')).rows.length, 1);
  });
  await check('RPC persistence failure cannot acknowledge or report a grant', async () => {
    const h = harness({ failure: 'sql', receipt: purchase({ acknowledgementState: 'ACKNOWLEDGEMENT_STATE_PENDING' }) }); assert.equal((await h.invoke()).status, 500); assert.equal(await row(), undefined); assert.equal(h.calls.filter(x => x.endsWith(':acknowledge')).length, 0);
  });
  await check('Actual transaction rolls back linked invalidation on final write failure', async () => {
    await harness().invoke(); await db.exec("alter table public.subscriptions add constraint qa_failure check (google_order_id is distinct from 'inject-failure')");
    try { const p = purchase({ linkedPurchaseToken: 'token-A', latestOrderId: 'inject-failure' }); assert.equal((await harness({ receipt: p }).invoke('rollback')).status, 500); assert.equal((await ledger('token-A')).superseded_by_hash, null); assert.equal(await ledger('rollback'), undefined); assert.equal((await row()).status, 'active'); }
    finally { await db.exec('alter table public.subscriptions drop constraint qa_failure'); }
  });
  await check('RPC and ledger deny anonymous and authenticated callers', async () => {
    const signature = 'public.apply_verified_google_play_subscription(uuid,text,text,text,text,text,timestamp with time zone,timestamp with time zone,boolean,timestamp with time zone)';
    for (const role of ['anon', 'authenticated']) {
      assert.equal((await db.query('select has_function_privilege($1,$2,\'execute\') as permitted', [role, signature])).rows[0].permitted, false);
      assert.equal((await db.query("select has_table_privilege($1,'private.google_play_purchase_tokens','select,insert,update,delete') as permitted", [role])).rows[0].permitted, false);
    }
    const r = (await db.query("select relrowsecurity from pg_class where oid='private.google_play_purchase_tokens'::regclass")).rows[0]; assert.equal(r.relrowsecurity, true);
  });
  await check('Service role can execute the invoker RPC', async () => {
    await db.exec('set role service_role'); try { assert.equal((await harness().invoke()).status, 200); } finally { await db.exec('reset role'); }
  });
  await check('Deleting account cascades ownership history', async () => {
    await harness().invoke(); await db.query('delete from auth.users where id=$1', [user]); assert.equal(await ledger('token-A'), undefined); assert.equal(await row(), undefined); await db.query('insert into auth.users values($1)', [user]);
  });
  for (const [state, expected, valid] of [['ACTIVE', 'active', true], ['IN_GRACE_PERIOD', 'grace_period', true], ['CANCELED', 'canceled', true], ['PAUSED', 'paused', false], ['ON_HOLD', 'paused', false], ['EXPIRED', 'expired', false], ['PENDING_PURCHASE_CANCELED', 'expired', false], ['PENDING', 'none', false]]) await check(`Google ${state} retains expected mapping`, async () => {
    const response = await harness({ receipt: purchase({ subscriptionState: 'SUBSCRIPTION_STATE_' + state }) }).invoke(); assert.equal(response.body.valid, valid); assert.equal(response.body.status, expected);
  });
  await check('Valid free trial is acknowledged once per pending Google response', async () => {
    const p = purchase({ acknowledgementState: 'ACKNOWLEDGEMENT_STATE_PENDING' }); p.lineItems[0].offerPhase = { freeTrial: {} };
    const h = harness({ receipt: p }); const r = await h.invoke(); assert.equal(r.status, 200); assert.equal(r.body.status, 'trialing'); assert.equal(h.calls.filter(x => x.endsWith(':acknowledge')).length, 1); assert.equal(JSON.stringify(await row()).includes('token-A'), false);
  });
  await check('Idempotent active receipt produces one grant and one ledger record', async () => {
    assert.equal((await harness().invoke()).status, 200); assert.equal((await harness().invoke()).status, 200); assert.equal((await db.query('select * from private.google_play_purchase_tokens')).rows.length, 1);
  });
  await check('Missing session, malformed token and product mismatch make no Google request', async () => {
    const h = harness(); assert.equal((await h.invoke('a', {}, 'POST', '')).status, 401); assert.equal((await h.invoke(12)).status, 400); assert.equal((await h.invoke('   ')).status, 400); assert.equal((await h.invoke('a', { productId: 'wrong' })).status, 400); assert.equal(h.calls.length, 0);
  });
  await check('Wrong account binding cannot reach persistence', async () => {
    const h = harness({ receipt: purchase({ externalAccountIdentifiers: { obfuscatedExternalAccountId: hash(other) } }) }); assert.equal((await h.invoke()).status, 403); assert.equal(h.rpcs.length, 0);
  });
  for (const failure of ['oauth', 'google']) await check(`${failure} failure cannot change current paid grant`, async () => {
    await harness().invoke(); assert.equal((await harness({ failure }).invoke('unverified')).status, 500); assert.equal((await row()).purchase_token_hash, hash('token-A'));
  });
  const report = { mode: 'Actual Edge TypeScript + actual SQL migration in PGlite; synthetic Google/Auth/clock only', total: checks.length, passed: checks.filter(x => x.result === 'PASS').length, failed: checks.filter(x => x.result === 'FAIL').length, checks, limitations: ['PGlite uses a single database session; real cross-session lock contention is not simulated.', 'No live Google Play, Supabase deployment or purchase performed.'] };
  if (out) { fs.mkdirSync(path.dirname(out), { recursive: true }); fs.writeFileSync(out, JSON.stringify(report, null, 2) + '\n'); }
  console.log(JSON.stringify(report, null, 2)); await db.close(); process.exitCode = report.failed ? 1 : 0;
}
main().catch(async error => { console.error(error); if (db) await db.close(); process.exitCode = 2; });
