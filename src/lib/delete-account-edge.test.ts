import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ts from 'typescript';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type ObjectRow = { bucket_id: string; name: string; owner_id: string };
let handler: (request: Request) => Promise<Response>;
let objects: ObjectRow[];
let order: string[];
let fail: string | null;
let userExists: boolean;
const userId = '11111111-1111-4111-8111-111111111111';
const otherId = '22222222-2222-4222-8222-222222222222';
let removed: { bucket: string; paths: string[] }[];

beforeEach(() => {
  objects = []; order = []; fail = null; userExists = true; removed = [];
  const admin = {
    auth: {
      getUser: async (token: string) => ({ data: { user: token === 'caller-token' && userExists ? { id: userId, email: 'synthetic@example.invalid' } : null }, error: null }),
      admin: {
        deleteUser: async (id: string) => {
          order.push('delete:' + id);
          if (fail === 'delete' || objects.some((item) => item.owner_id === id)) return { error: new Error('Deletion blocked') };
          userExists = false; return { error: null };
        },
        signOut: async () => { order.push('revoke'); return { error: null }; },
      },
    },
    rpc: async (name: string, args: { target_user_id: string; page_size?: number }) => {
      order.push(name);
      if (fail === name) return { data: null, error: new Error('Injected RPC failure') };
      if (name === 'list_account_storage_objects') return { data: objects.filter(item => item.owner_id === args.target_user_id).slice(0, args.page_size ?? 500).map(({ bucket_id, name }) => ({ bucket_id, name })), error: null };
      return { data: null, error: null };
    },
    storage: { from: (bucket: string) => ({ remove: async (paths: string[]) => {
      order.push('remove:' + bucket); removed.push({ bucket, paths });
      if (fail === 'storage') return { error: new Error('Injected Storage failure') };
      if (fail !== 'storage-no-progress') objects = objects.filter(item => item.bucket_id !== bucket || !paths.includes(item.name));
      return { data: paths.map(name => ({ name })), error: null };
    } }) },
  };
  const source = readFileSync(resolve('supabase/functions/delete-account/index.ts'), 'utf8').replace(/^import .*;$/gm, '');
  const script = ts.transpile(source, { target: ts.ScriptTarget.ES2022 });
  const environment: Record<string, string> = { SUPABASE_URL: 'https://example.invalid', SUPABASE_SERVICE_ROLE_KEY: 'test-service' };
  new Function('Deno', 'createClient', 'console', script)(
    { env: { get: (key: string) => environment[key] }, serve: (value: typeof handler) => { handler = value; } },
    () => admin, { error: vi.fn() },
  );
});
const request = (token = 'caller-token', body: unknown = {}) => new Request('https://example.invalid/delete-account', {
  method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});

describe('account deletion Edge workflow with synthetic service adapters', () => {
  it('removes all owned objects across buckets before database purge and Auth deletion', async () => {
    objects = [{ bucket_id: 'recipe-images', name: `${userId}/photo.jpg`, owner_id: userId }, { bucket_id: 'another-bucket', name: 'nested/owned-file.pdf', owner_id: userId }, { bucket_id: 'recipe-images', name: `${otherId}/keep.jpg`, owner_id: otherId }];
    const response = await handler(request('caller-token', { userId: otherId }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ success: true });
    expect(objects).toEqual([{ bucket_id: 'recipe-images', name: `${otherId}/keep.jpg`, owner_id: otherId }]);
    expect(order.indexOf('purge_own_data')).toBeGreaterThan(order.lastIndexOf('remove:another-bucket'));
    expect(order.indexOf('delete:' + userId)).toBeGreaterThan(order.indexOf('purge_own_data'));
  });
  it('does not purge or delete Auth when Storage deletion fails', async () => {
    objects = [{ bucket_id: 'recipe-images', name: 'owned.jpg', owner_id: userId }]; fail = 'storage';
    expect((await handler(request())).status).toBe(500);
    expect(order).not.toContain('purge_own_data'); expect(userExists).toBe(true);
  });
  it('does not purge when metadata enumeration fails', async () => {
    fail = 'list_account_storage_objects';
    expect((await handler(request())).status).toBe(500);
    expect(order).not.toContain('purge_own_data'); expect(userExists).toBe(true);
  });
  it('repeats deletion from the first remaining page without skipping files', async () => {
    objects = Array.from({ length: 1201 }, (_, i) => ({ bucket_id: 'recipe-images', name: `nested/${i}.jpg`, owner_id: userId }));
    expect((await handler(request())).status).toBe(200);
    expect(removed.reduce((sum, group) => sum + group.paths.length, 0)).toBe(1201);
    expect(removed.every(group => group.paths.length <= 1000)).toBe(true);
    expect(objects).toEqual([]);
  });
  it('stops without purging if Storage acknowledges removal but metadata makes no progress', async () => {
    objects = [{ bucket_id: 'recipe-images', name: 'owned.jpg', owner_id: userId }]; fail = 'storage-no-progress';
    expect((await handler(request())).status).toBe(500);
    expect(order).not.toContain('purge_own_data'); expect(userExists).toBe(true);
  });
  it('can retry a failure after Storage was removed without deleting another account', async () => {
    objects = [{ bucket_id: 'recipe-images', name: 'owned.jpg', owner_id: userId }]; fail = 'purge_own_data';
    expect((await handler(request())).status).toBe(500);
    expect(objects).toEqual([]); expect(userExists).toBe(true);
    fail = null;
    expect((await handler(request())).status).toBe(200); expect(userExists).toBe(false);
  });
  it('rejects unverified identity without enumerating or changing data', async () => {
    expect((await handler(request('invalid-token'))).status).toBe(401);
    expect(order).toEqual([]);
  });
  it('rejects non-POST methods without changing data', async () => {
    expect((await handler(new Request('https://example.invalid/delete-account'))).status).toBe(405);
    expect(order).toEqual([]);
  });
});
