import { beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({
  storage: new Map<string, string>(), user: 'one' as string | null,
  requests: [] as { type: 'rpc' | 'read'; authorization: string | null; owner: string }[],
  afterExecute: null as (() => void) | null,
  beforeExecute: null as (() => void) | null,
  readSize: 0,
}));
vi.mock('@react-native-async-storage/async-storage', () => ({ default: {
  getItem: async (key: string) => state.storage.get(key) ?? null,
  setItem: async (key: string, value: string) => { state.storage.set(key, value); },
} }));
vi.mock('@/lib/supabase', () => {
  const builder = (type: 'rpc' | 'read', requestedOwner: string, item?: Record<string, unknown>) => {
    let authorization: string | null = null;
    const result = {
      setHeader: (key: string, value: string) => { if (key === 'Authorization') authorization = value; return result; },
      then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => Promise.resolve().then(() => {
        state.beforeExecute?.();
        const owner = authorization?.replace('Bearer token-', '') ?? state.user ?? '';
        state.requests.push({ type, authorization, owner });
        const row = (id: string) => ({ id, data: { id, updatedAt: '' }, version: 1, updated_at: '2026-11-03T00:00:00Z' });
        const response = type === 'rpc' ? { data: { applied: true, record: { ...row(String(item!.id)), data: item } }, error: null }
          : { data: requestedOwner === owner ? Array.from({ length: state.readSize }, (_, i) => row(`remote-${i}`)) : [], error: null };
        state.afterExecute?.();
        return response;
      }).then(resolve, reject),
    };
    return result;
  };
  return { isDemoMode: false, isSupabaseConfigured: true, supabase: {
    auth: { getSession: async () => ({ data: { session: state.user ? { user: { id: state.user }, access_token: `token-${state.user}` } : null }, error: null }) },
    rpc: (_name: string, args: { p_data: Record<string, unknown> }) => builder('rpc', '', args.p_data),
    from: () => ({ select: () => ({ eq: (_key: string, owner: string) => ({ order: () => ({ range: () => builder('read', owner) }) }) }) }),
  } };
});
import { createOperationalStore, type OperationalSync } from './operational-sync';
type Item = OperationalSync & { id: string; updatedAt: string };
const store = createOperationalStore<Item>({ key: u => `session-test.${u}`, table: 'asset_profiles', id: v => v.id, normalize: v => v && typeof v === 'object' && typeof (v as Item).id === 'string' ? v as Item : null });
beforeEach(() => { state.storage.clear(); state.requests = []; state.user = 'one'; state.afterExecute = null; state.beforeExecute = null; state.readSize = 0; });
describe('operational cloud session ownership', () => {
  it('retains a mismatched owner save locally pending without cloud requests', async () => {
    state.user = 'two';
    const saved = await store.save('one', { id: 'asset', updatedAt: '' });
    expect(saved.syncState).toBe('pending');
    expect(state.requests).toEqual([]);
    expect(await store.cached('two')).toEqual([]);
    expect(await store.cached('one')).toHaveLength(1);
  });
  it('pins an in-flight RPC to the captured owner and stops after account switch', async () => {
    state.storage.set('session-test.one', JSON.stringify([{ id: 'a', updatedAt: '', syncState: 'pending' }, { id: 'b', updatedAt: '', syncState: 'pending' }]));
    state.beforeExecute = () => { state.user = 'two'; };
    const result = await store.load('one');
    expect(state.requests).toEqual([{ type: 'rpc', authorization: 'Bearer token-one', owner: 'one' }]);
    expect(result.find(v => v.id === 'b')?.syncState).toBe('pending');
    expect(await store.cached('two')).toEqual([]);
  });
  it('pins read pages and stops before a second page after account switch', async () => {
    state.readSize = 500;
    state.afterExecute = () => { state.user = 'two'; };
    const result = await store.load('one');
    expect(state.requests).toEqual([{ type: 'read', authorization: 'Bearer token-one', owner: 'one' }]);
    expect(result).toEqual([]);
    expect(await store.cached('two')).toEqual([]);
  });
  it('performs no cloud requests when signed out', async () => {
    state.user = null;
    expect((await store.save('one', { id: 'asset', updatedAt: '' })).syncState).toBe('pending');
    expect(state.requests).toEqual([]);
  });
});
