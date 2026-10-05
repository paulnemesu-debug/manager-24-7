import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ts from 'typescript';
import { beforeEach, describe, expect, it, vi } from 'vitest';

let entitled = true;
let remaining = 19;
let configured = true;
let membership: { owner_user_id: string; role: string } | null = null;
let ownerLicensed = true;
let handler: (request: Request) => Promise<Response>;
const quota = vi.fn(async () => ({ data: remaining, error: null }));
const provider = vi.fn(async () => Response.json({ content: [{ type: 'text', text: '{"rows":[{"name":"Făină","quantity":2,"unit":"kg"}]}' }] }));

beforeEach(() => {
  entitled = true; remaining = 19; configured = true; membership = null; ownerLicensed = true;
  quota.mockClear(); provider.mockClear();
  const source = readFileSync(resolve('supabase/functions/scan-consumption-document/index.ts'), 'utf8').replace(/^import .*;$/gm, '');
  const script = ts.transpile(source, { target: ts.ScriptTarget.ES2022 });
  const createClient = (_url: string, key: string) => key === 'public' ? {
    auth: { getUser: async (token: string) => token === 'user-token' ? { data: { user: { id: 'user' } }, error: null } : { data: { user: null }, error: { message: 'invalid JWT' } } },
    rpc: async () => ({ data: entitled, error: null }),
  } : {
    rpc: quota,
    from: (table: string) => {
      const chain = {
        select: (_columns: string) => chain,
        eq: (_key: string, _value: unknown) => chain,
        maybeSingle: async () => ({ data: table === 'workspace_members' ? membership : table === 'profiles' ? { role: ownerLicensed ? 'admin' : 'client' } : { status: 'expired', current_period_end: '2020-01-01' }, error: null }),
      };
      return chain;
    },
  };
  const environment: Record<string, string> = { SUPABASE_URL: 'https://test.supabase.co', SUPABASE_ANON_KEY: 'public', SUPABASE_SERVICE_ROLE_KEY: 'service', ANTHROPIC_API_KEY: 'provider-test' };
  new Function('Deno', 'createClient', 'fetch', script)(
    { env: { get: (key: string) => key === 'ANTHROPIC_API_KEY' && !configured ? undefined : environment[key] }, serve: (value: typeof handler) => { handler = value; } }, createClient, provider,
  );
});

const request = (token?: string, body: unknown = { document: { mediaType: 'image/jpeg', data: 'AQ==' } }) => new Request('https://test/scan', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : { apikey: 'sb_publishable_test' }) }, body: JSON.stringify(body) });

describe('scan authorization before provider spending', () => {
  it('rejects an API key without a user session', async () => {
    expect((await handler(request())).status).toBe(401);
    expect(provider).not.toHaveBeenCalled(); expect(quota).not.toHaveBeenCalled();
  });
  it('rejects a publishable key sent as a bearer token', async () => {
    expect((await handler(request('sb_publishable_test'))).status).toBe(401);
    expect(provider).not.toHaveBeenCalled();
  });
  it('rejects an expired subscription', async () => {
    entitled = false;
    expect((await handler(request('user-token'))).status).toBe(403);
    expect(provider).not.toHaveBeenCalled(); expect(quota).not.toHaveBeenCalled();
  });
  it('checks the workspace owner subscription and denies viewers', async () => {
    membership = { owner_user_id: 'owner', role: 'viewer' };
    expect((await handler(request('user-token'))).status).toBe(403);
    membership.role = 'editor'; ownerLicensed = false;
    expect((await handler(request('user-token'))).status).toBe(403);
    expect(provider).not.toHaveBeenCalled();
  });
  it('does not reserve credit for invalid input or missing provider configuration', async () => {
    expect((await handler(request('user-token', {}))).status).toBe(400);
    configured = false;
    expect((await handler(request('user-token'))).status).toBe(503);
    expect(quota).not.toHaveBeenCalled();
  });
  it('denies daily and burst limits before contacting the provider', async () => {
    for (const value of [-1, -2]) { remaining = value; expect((await handler(request('user-token'))).status).toBe(429); }
    expect(provider).not.toHaveBeenCalled();
  });
  it('reserves an account credit and transcribes only an authorized document', async () => {
    const response = await handler(request('user-token'));
    expect(response.status).toBe(200);
    expect(quota).toHaveBeenCalledWith('reserve_document_scan', { p_account_id: 'user', p_limit: 20 });
    expect(provider).toHaveBeenCalledOnce();
    expect(await response.json()).toMatchObject({ rows: [{ name: 'Făină' }] });
  });
});
