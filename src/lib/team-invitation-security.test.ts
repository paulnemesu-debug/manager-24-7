import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ts from 'typescript';
import { beforeEach, describe, expect, it, vi } from 'vitest';

let handler: (request: Request) => Promise<Response>;
let rpcError: { message: string } | null;
let status: 'active' | 'pending';
let metadataError: { message: string } | null;
let useResend: boolean;
const reservedAt = '2026-10-19T12:00:00.000Z';
const rpc = vi.fn(async () => ({ data: rpcError ? null : { id: 'membership', status, reserved_at: reservedAt }, error: rpcError }));
const from = vi.fn();
const updates = vi.fn();
const otp = vi.fn(async () => ({ error: null }));
const provider = vi.fn(async () => new Response('{}', { status: 200 }));

beforeEach(() => {
  rpcError = null; status = 'active'; metadataError = null; useResend = false;
  rpc.mockClear(); from.mockClear(); updates.mockClear(); otp.mockClear(); provider.mockReset();
  provider.mockResolvedValue(new Response('{}', { status: 200 }));
  const chain = (table: string) => {
    const query = {
      select: () => query, eq: () => query, ilike: () => query,
      update: (value: unknown) => { updates(value); return query; }, upsert: () => query,
      maybeSingle: async () => ({ data: table === 'profiles' ? { user_id: 'forged-profile-user' } : null, error: null }),
      single: async () => ({ data: { id: 'membership', status: 'active' }, error: null }),
      then: (resolve: (value: unknown) => void) => resolve({ error: metadataError }),
    };
    return query;
  };
  from.mockImplementation(chain);
  const createClient = (_url: string, key: string) => key === 'service' ? { rpc, from } : {
    auth: {
      getUser: async (token: string) => ({ data: { user: token === 'valid-session' ? { id: 'owner', email: 'owner@example.test' } : null }, error: token === 'valid-session' ? null : { message: 'invalid' } }),
      signInWithOtp: otp,
    },
  };
  const environment: Record<string, string> = { SUPABASE_URL: 'https://test.supabase.co', SUPABASE_ANON_KEY: 'public', SUPABASE_SERVICE_ROLE_KEY: 'service' };
  const source = readFileSync(resolve('supabase/functions/send-team-invitation/index.ts'), 'utf8').replace(/^import .*;$/gm, '');
  new Function('Deno', 'createClient', 'fetch', ts.transpile(source, { target: ts.ScriptTarget.ES2022 }))(
    { env: { get: (key: string) => useResend && key === 'RESEND_API_KEY' ? 'test' : useResend && key === 'INVITATION_FROM_EMAIL' ? 'sender@example.test' : environment[key] }, serve: (value: typeof handler) => { handler = value; } }, createClient, provider,
  );
});
const request = (token: string | null = 'valid-session', body: unknown = { email: ' Member@Example.Test ', role: 'viewer', locale: 'en' }) => new Request('https://test/invite', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });

describe('team invitation verified identity boundary', () => {
  it('requires a verified user session before resolving identity or sending', async () => {
    expect((await handler(request(null))).status).toBe(401);
    expect((await handler(request('publishable-key'))).status).toBe(401);
    expect(rpc).not.toHaveBeenCalled(); expect(otp).not.toHaveBeenCalled(); expect(provider).not.toHaveBeenCalled();
  });
  it.each(['owner_not_entitled', 'cannot_invite_self', 'invalid_invitation', 'invite_rate_limited'])('fails closed before delivery on %s', async (message) => {
    rpcError = { message };
    const response = await handler(request());
    expect(response.status).toBe(message === 'owner_not_entitled' ? 403 : message === 'invite_rate_limited' ? 429 : 400);
    expect(await response.json()).toEqual({ error: message });
    expect(otp).not.toHaveBeenCalled(); expect(provider).not.toHaveBeenCalled();
  });
  it.each(['active', 'pending'] as const)('uses service-only Auth identity resolution and reports %s', async (membershipStatus) => {
    status = membershipStatus;
    const response = await handler(request());
    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith('prepare_workspace_invitation', { p_owner_user_id: 'owner', p_email: 'member@example.test', p_role: 'viewer' });
    expect(from.mock.calls.every(([table]) => table === 'workspace_members')).toBe(true);
    expect(await response.json()).toMatchObject({ status: membershipStatus, delivery: 'supabase_otp', memberId: 'membership' });
    expect(otp).toHaveBeenCalledOnce();
  });
  it('does not turn an unknown database failure into delivery or expose SQL details', async () => {
    rpcError = { message: 'private relation and secret database detail' };
    const response = await handler(request());
    expect(response.status).toBe(500); expect(await response.json()).toEqual({ error: 'membership_failed' }); expect(otp).not.toHaveBeenCalled();
  });
  it('records provider network failures and returns a controlled delivery error', async () => {
    useResend = true; provider.mockRejectedValue(new Error('network down'));
    const response = await handler(request());
    expect(response.status).toBe(502); expect(await response.json()).toEqual({ error: 'email_delivery_failed' });
    expect(updates).toHaveBeenCalledWith(expect.objectContaining({ invite_delivery: 'failed' }));
  });
  it('does not claim success if delivery status cannot be persisted', async () => {
    metadataError = { message: 'unavailable' };
    expect((await handler(request())).status).toBe(500);
  });
  it('rejects malformed input and self-invitations before database work', async () => {
    for (const body of [{email:'bad'}, {email:'member@example.test',role:'admin'}, {email:'OWNER@example.test'}]) expect((await handler(request('valid-session',body))).status).toBe(400);
    expect(rpc).not.toHaveBeenCalled(); expect(otp).not.toHaveBeenCalled();
  });
});
