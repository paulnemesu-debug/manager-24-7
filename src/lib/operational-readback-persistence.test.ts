import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createOperationalStore, type OperationalSync } from './operational-sync';

type Item = OperationalSync & { id: string; name: string; updatedAt: string };
type Row = { id: string; data: Item; version: number; updated_at: string };
const owner = 'operational-readback-owner';
const state = vi.hoisted(() => ({
  disk: new Map<string, string>(),
  rows: new Map<string, Row>(),
  readMode: 'normal' as 'normal' | 'empty' | 'stale',
  client: null as SupabaseClient | null,
}));

vi.mock('@react-native-async-storage/async-storage', () => ({ default: {
  getItem: async (key: string) => state.disk.get(key) ?? null,
  setItem: async (key: string, value: string) => { state.disk.set(key, value); },
} }));
vi.mock('@/lib/supabase', () => ({
  isDemoMode: false, isSupabaseConfigured: true,
  get supabase() { return state.client; },
}));

// Keep the Supabase/PostgREST request builder real. Only HTTP and the device
// storage/session adapters are controlled; no repository or store is replaced.
const fixtureFetch: typeof fetch = async (input, init) => {
  const url = new URL(String(input));
  if (url.pathname.endsWith('/rpc/sync_operational_record')) {
    const args = JSON.parse(String(init?.body));
    const previous = state.rows.get(args.p_id);
    const row: Row = {
      id: args.p_id, data: args.p_data,
      version: (previous?.version ?? 0) + 1,
      updated_at: '2026-11-04T12:00:00.000Z',
    };
    state.rows.set(row.id, row);
    return Response.json({ applied: true, record: row });
  }
  if (url.pathname.endsWith('/asset_profiles')) {
    if (state.readMode === 'empty') return Response.json([]);
    if (state.readMode === 'stale') return Response.json([...state.rows.values()].map(row => ({
      ...row, version: 1, data: { ...row.data, name: 'Original mixer' },
    })));
    return Response.json([...state.rows.values()]);
  }
  throw new Error(`Unexpected fixture request: ${url.pathname}`);
};

function makeStore() {
  return createOperationalStore<Item>({
    key: id => `qa.readback.${id}`,
    table: 'asset_profiles',
    id: item => item.id,
    normalize: value => {
      if (!value || typeof value !== 'object') return null;
      const item = value as Item;
      return typeof item.id === 'string' && typeof item.name === 'string'
        && typeof item.updatedAt === 'string' ? { ...item } : null;
    },
  });
}

beforeEach(() => {
  state.disk.clear(); state.rows.clear(); state.readMode = 'normal';
  state.client = createClient('http://127.0.0.1:9876', 'fixture-publishable-key', {
    global: { fetch: fixtureFetch },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  vi.spyOn(state.client.auth, 'getSession').mockResolvedValue({
    data: { session: {
      access_token: 'fixture-access-token', refresh_token: 'fixture-refresh-token',
      token_type: 'bearer', expires_in: 3600,
      user: { id: owner, app_metadata: {}, user_metadata: {}, aud: 'authenticated', created_at: '2026-11-04T00:00:00Z' },
    } }, error: null,
  });
});
afterEach(() => vi.restoreAllMocks());

describe('operational records survive cloud readback', () => {
  it('keeps a newly acknowledged equipment record after an empty list response and reopening', async () => {
    state.readMode = 'empty';
    const store = makeStore();
    const saved = await store.save(owner, { id: 'mixer', name: 'Bistro mixer', updatedAt: '' });
    expect(saved.name).toBe('Bistro mixer');
    expect(state.rows.size).toBe(1);
    expect((await makeStore().cached(owner)).map(item => item.name)).toEqual(['Bistro mixer']);
    expect((await makeStore().load(owner)).map(item => item.name)).toEqual(['Bistro mixer']);
  });

  it('does not downgrade an acknowledged edit when the list returns an older server revision', async () => {
    const store = makeStore();
    const first = await store.save(owner, { id: 'mixer', name: 'Original mixer', updatedAt: '' });
    state.readMode = 'stale';
    await store.save(owner, { ...first, name: 'Renamed mixer' });
    const reopened = await makeStore().load(owner);
    expect(reopened).toEqual([expect.objectContaining({ id: 'mixer', name: 'Renamed mixer', serverVersion: 2 })]);
  });

  it('does not interpret a later empty operational list as a deletion without a deletion record', async () => {
    const store = makeStore();
    await store.save(owner, { id: 'mixer', name: 'Existing mixer', updatedAt: '' });
    state.readMode = 'empty';
    expect((await makeStore().load(owner)).map(item => item.name)).toEqual(['Existing mixer']);
    expect((await makeStore().cached(owner)).map(item => item.name)).toEqual(['Existing mixer']);
    expect(await makeStore().cached('different-owner')).toEqual([]);
  });

  it('accepts a newer cloud revision instead of freezing the local copy', async () => {
    const store = makeStore();
    await store.save(owner, { id: 'mixer', name: 'Local mixer', updatedAt: '' });
    const row = state.rows.get('mixer')!;
    state.rows.set('mixer', { ...row, version: 2, data: { ...row.data, name: 'Cloud edit' } });
    expect(await makeStore().load(owner)).toEqual([
      expect.objectContaining({ name: 'Cloud edit', serverVersion: 2, syncState: 'synced' }),
    ]);
  });
});
