import { generateKeyPairSync, createHash, webcrypto } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ts from 'typescript';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const userId = '11111111-1111-4111-8111-111111111111';
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const privateKey = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({ format: 'pem', type: 'pkcs8' });
const code = ts.transpile(readFileSync(resolve('supabase/functions/verify-google-play-purchase/index.ts'), 'utf8').replace(/^import .*;$/gm, ''), { target: ts.ScriptTarget.ES2022 });
let handler: (request: Request) => Promise<Response>;
let receipt: Record<string, unknown>;
let rpc: ReturnType<typeof vi.fn>;
let network: ReturnType<typeof vi.fn>;
let rpcResult: { data: Record<string, unknown> | null; error: Error | null };
const future = new Date(Date.now() + 86400000).toISOString();
beforeEach(() => {
  receipt = { subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE', acknowledgementState: 'ACKNOWLEDGEMENT_STATE_PENDING', startTime: '2026-01-01T00:00:00Z',
    externalAccountIdentifiers: { obfuscatedExternalAccountId: digest(userId) }, lineItems: [{ productId: 'pro', expiryTime: future }] };
  rpcResult = { data: { valid: true, status: 'active', current_period_end: future, reason: 'applied' }, error: null };
  rpc = vi.fn(async () => rpcResult);
  const client = { auth: { getUser: async () => ({ data: { user: { id: userId } }, error: null }) }, rpc };
  network = vi.fn(async (url: string) => {
    if (url === 'https://oauth2.googleapis.com/token') return Response.json({ access_token: 'synthetic' });
    if (url.includes('/subscriptionsv2/')) return Response.json(receipt);
    if (url.endsWith(':acknowledge')) return new Response(null, { status: 204 });
    throw new Error('Unexpected network call');
  });
  const environment: Record<string, string> = { SUPABASE_URL: 'https://example.invalid', SUPABASE_SERVICE_ROLE_KEY: 'synthetic', GOOGLE_PLAY_PACKAGE_NAME: 'example.invalid', GOOGLE_PLAY_SUBSCRIPTION_ID: 'pro', GOOGLE_PLAY_SERVICE_ACCOUNT_JSON: JSON.stringify({ client_email: 'qa@example.invalid', private_key: privateKey }) };
  new Function('Deno', 'createClient', 'fetch', 'crypto', 'console', code)(
    { env: { get: (key: string) => environment[key] }, serve: (value: typeof handler) => { handler = value; } },
    () => client, network, webcrypto, { error: vi.fn() },
  );
});
const invoke = (purchaseToken: unknown = 'synthetic-token', extra = {}) => handler(new Request('https://example.invalid/verify', {
  method: 'POST', headers: { Authorization: 'Bearer synthetic-session', 'Content-Type': 'application/json' },
  body: JSON.stringify({ packageName: 'example.invalid', productId: 'pro', purchaseToken, ...extra }),
}));
const acknowledgements = () => network.mock.calls.filter(([url]) => String(url).endsWith(':acknowledge'));

describe('Google verification Edge boundary (SQL integration in scripts/qa/check-google-purchases.cjs)', () => {
  it('persists only verified identity and token hashes through the atomic RPC', async () => {
    receipt.linkedPurchaseToken = 'predecessor-token';
    expect((await invoke('synthetic-token', { userId: 'forged-user' })).status).toBe(200);
    expect(rpc).toHaveBeenCalledOnce();
    expect(rpc.mock.calls[0]).toEqual(['apply_verified_google_play_subscription', expect.objectContaining({
      p_user_id: userId, p_token_hash: digest('synthetic-token'), p_linked_token_hash: digest('predecessor-token'), p_period_end: future,
    })]);
    expect(JSON.stringify(rpc.mock.calls)).not.toContain('synthetic-token');
    expect(acknowledgements()).toHaveLength(1);
  });
  it.each([undefined, 'invalid'])('normalizes absent/invalid Google expiry %s for SQL denial', async expiry => {
    receipt.lineItems = [{ productId: 'pro', expiryTime: expiry }]; rpcResult.data = { valid: false, status: 'expired', reason: 'applied' };
    expect((await invoke()).status).toBe(403);
    expect(rpc.mock.calls[0][1]).toMatchObject({ p_period_end: null });
    expect(acknowledgements()).toHaveLength(0);
  });
  it.each(['inactive_receipt', 'older_receipt', 'superseded', 'stale_verification'])('does not acknowledge a transaction rejected as %s', async reason => {
    rpcResult.data = { valid: false, reason };
    expect((await invoke()).status).toBe(403); expect(acknowledgements()).toHaveLength(0);
  });
  it('returns ownership conflict without acknowledging the purchase', async () => {
    rpcResult.data = { valid: false, reason: 'ownership_conflict' };
    expect((await invoke()).status).toBe(409); expect(acknowledgements()).toHaveLength(0);
  });
  it.each(['error', 'missing', 'malformed'])('fails closed on %s RPC result', async failure => {
    rpcResult = failure === 'error' ? { data: null, error: new Error('Injected failure') } : { data: failure === 'missing' ? null : { valid: 'true' }, error: null };
    expect((await invoke()).status).toBe(500); expect(acknowledgements()).toHaveLength(0);
  });
  it('rejects a Google account mismatch before persistence', async () => {
    receipt.externalAccountIdentifiers = { obfuscatedExternalAccountId: digest('other') };
    expect((await invoke()).status).toBe(403); expect(rpc).not.toHaveBeenCalled();
  });
  it.each([12, null, '', '   '])('rejects malformed token %s before Google calls', async token => {
    expect((await invoke(token)).status).toBe(400); expect(network).not.toHaveBeenCalled();
  });
});
