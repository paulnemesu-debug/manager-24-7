import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createNotificationHandler } from '../supabase/functions/notify-trial-owner/handler.ts';

const notification = {
  id: '00000000-0000-4000-8000-000000000001',
  user_id: '00000000-0000-4000-8000-000000000002',
  verified_email: 'verified@example.invalid',
  restaurant_name: '<img src=x onerror=alert(1)>',
  started_at: '2026-11-01T12:00:00Z',
  expires_at: '2026-11-11T12:00:00Z',
  registered_at: '2026-11-01T12:05:00Z',
  attempt: 1,
  reserved_at: '2026-11-01T12:06:00Z',
};

function harness(overrides = {}) {
  const calls = [];
  const environment = {
    SUPABASE_URL: 'https://project.supabase.invalid',
    SUPABASE_ANON_KEY: 'public-test-key',
    SUPABASE_SERVICE_ROLE_KEY: 'service-test-key',
    RESEND_API_KEY: 'mail-test-key',
    INVITATION_FROM_EMAIL: 'Manager 24/7 <sender@example.invalid>',
    ...overrides.env,
  };
  const createClient = (_url, key) => ({
    auth: {
      async getUser(token) {
        calls.push(['getUser', key, token]);
        return overrides.userResult ?? { data: { user: { id: 'trusted-admin' } }, error: null };
      },
    },
    async rpc(name, args) {
      calls.push([name, key, args]);
      if (name === 'admin_list_trial_users') return overrides.adminResult ?? { data: [], error: null };
      if (name === 'claim_trial_owner_notifications') return overrides.claimResult ?? { data: [notification], error: null };
      if (name === 'finish_trial_owner_notification') return overrides.finishResult ?? { data: true, error: null };
      throw new Error('Unexpected RPC');
    },
  });
  const fetch = async (url, options) => {
    calls.push(['send', url, options]);
    if (overrides.providerThrows) throw new Error('private provider message');
    return new Response(JSON.stringify({ id: 'provider-message-id' }), { status: overrides.providerStatus ?? 200 });
  };
  const handler = createNotificationHandler({ env: (name) => environment[name], createClient, fetch });
  const request = (authorization = 'Bearer signed-user-token') => new Request('https://function.invalid', {
    method: 'POST',
    headers: authorization ? { Authorization: authorization } : {},
    body: JSON.stringify({ to: 'attacker@example.invalid', verified_email: 'spoofed@example.invalid' }),
  });
  return { calls, handler, request };
}

test('requires a validated Auth user before inspecting the outbox', async () => {
  const missing = harness();
  assert.equal((await missing.handler(missing.request(null))).status, 401);
  assert.deepEqual(missing.calls, []);
  const invalid = harness({ userResult: { data: { user: null }, error: 'invalid token' } });
  assert.equal((await invalid.handler(invalid.request())).status, 401);
  assert.equal(invalid.calls.some(([name]) => name === 'claim_trial_owner_notifications'), false);
});

test('an authenticated nonadmin cannot claim or send notifications', async () => {
  const fixture = harness({ adminResult: { data: null, error: { code: '42501', message: 'admin_required' } } });
  const response = await fixture.handler(fixture.request());
  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), { error: 'admin_required' });
  assert.equal(fixture.calls.some(([name]) => name === 'claim_trial_owner_notifications' || name === 'send'), false);
});

test('missing mail credentials leave notifications unclaimed and report configuration failure', async () => {
  const fixture = harness({ env: { RESEND_API_KEY: undefined } });
  const response = await fixture.handler(fixture.request());
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: 'delivery_not_configured', queued: true });
  assert.equal(fixture.calls.some(([name]) => name === 'claim_trial_owner_notifications' || name === 'send'), false);
});

test('sends authoritative fields only to the fixed owner and acknowledges the matching reservation', async () => {
  const fixture = harness();
  const response = await fixture.handler(fixture.request());
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { sent: 1, failed: 0, delivery: 'resend' });
  const [, url, options] = fixture.calls.find(([name]) => name === 'send');
  assert.equal(url, 'https://api.resend.com/emails');
  assert.equal(options.headers['Idempotency-Key'], `manager247-trial-owner:${notification.id}`);
  const payload = JSON.parse(options.body);
  assert.deepEqual(payload.to, ['admin@paradimoperations.com']);
  assert.match(payload.html, /verified@example.invalid/);
  assert.match(payload.html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.doesNotMatch(payload.html, /<img|spoofed@example|attacker@example/);
  assert.deepEqual(fixture.calls.find(([name]) => name === 'finish_trial_owner_notification'), [
    'finish_trial_owner_notification', 'service-test-key', {
      p_id: notification.id, p_reserved_at: notification.reserved_at, p_delivered: true, p_error: null,
    },
  ]);
});

for (const [description, overrides, expectedError] of [
  ['provider rejection', { providerStatus: 429 }, 'resend_429'],
  ['network failure', { providerThrows: true }, 'provider_unavailable'],
]) {
  test(`${description} preserves a retryable failed outbox entry without leaking provider details`, async () => {
    const fixture = harness(overrides);
    const response = await fixture.handler(fixture.request());
    assert.equal(response.status, 502);
    assert.deepEqual(await response.json(), { error: 'email_delivery_failed', sent: 0, failed: 1 });
    const finish = fixture.calls.find(([name]) => name === 'finish_trial_owner_notification');
    assert.equal(finish[2].p_delivered, false);
    assert.equal(finish[2].p_error, expectedError);
  });
}

test('an acknowledgment failure does not report successful delivery', async () => {
  const fixture = harness({ finishResult: { data: false, error: null } });
  const response = await fixture.handler(fixture.request());
  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), { error: 'notification_status_failed' });
});

test('an empty outbox sends no message and reports zero processed', async () => {
  const fixture = harness({ claimResult: { data: [], error: null } });
  const response = await fixture.handler(fixture.request());
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { sent: 0, failed: 0, delivery: 'resend' });
  assert.equal(fixture.calls.some(([name]) => name === 'send'), false);
});

test('database failures return a generic error without sending mail', async () => {
  const fixture = harness({ claimResult: { data: null, error: { message: 'sensitive database context' } } });
  const response = await fixture.handler(fixture.request());
  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), { error: 'notification_claim_failed' });
  assert.equal(fixture.calls.some(([name]) => name === 'send'), false);
});
