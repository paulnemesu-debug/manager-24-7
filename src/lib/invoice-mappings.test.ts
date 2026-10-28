import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ storage: new Map<string, string>(), cloud: [] as Record<string, unknown>[],
  fail: false, accounts: [] as string[] }));
vi.mock('@react-native-async-storage/async-storage', () => ({ default: {
  getItem: async (key: string) => state.storage.get(key) ?? null,
  setItem: async (key: string, value: string) => { state.storage.set(key, value); },
} }));
vi.mock('@/lib/supabase', () => ({ isDemoMode: false, supabase: { from: () => ({
  select: () => ({ eq: (_: string, account: string) => { state.accounts.push(account); return { order: async () => ({
    data: state.cloud.filter((row) => row.user_id === account), error: state.fail ? new Error('offline') : null,
  }) }; } }),
  upsert: async (rows: Record<string, unknown>[]) => {
    if (state.fail) return { error: new Error('offline') };
    rows.forEach((row) => { state.cloud = state.cloud.filter((old) => old.user_id !== row.user_id
      || old.supplier !== row.supplier || old.normalized_name !== row.normalized_name); state.cloud.push(row); });
    return { error: null };
  },
}) } }));
import { loadInvoiceProductMappings, rememberInvoiceProductMappings } from '@/lib/invoice-mappings';
const mapping = (sourceName: string, catalogId = 'new-choice') => ({ supplier: 'METRO Pallady', sourceName,
  normalizedName: sourceName.toLowerCase(), catalogId });

beforeEach(() => { state.storage.clear(); state.cloud = []; state.fail = false; state.accounts = []; });
describe('confirmed invoice mapping synchronization', () => {
  it('keeps an offline correction over an older cloud match and retries it on reconnect', async () => {
    state.cloud = [{ user_id: 'one', supplier: 'METRO', source_name: 'Unt', normalized_name: 'unt', catalog_id: 'old-choice' }];
    state.fail = true;
    await rememberInvoiceProductMappings('one', [mapping('Unt')]);
    expect((await loadInvoiceProductMappings('one'))[0].catalogId).toBe('new-choice');
    state.fail = false;
    expect((await loadInvoiceProductMappings('one'))[0].catalogId).toBe('new-choice');
    expect(state.cloud.some((row) => row.catalog_id === 'new-choice')).toBe(true);
    const saved = JSON.parse([...state.storage.values()][0]);
    expect(saved[0].pending).toBe(false);
  });
  it('serializes concurrent confirmations and separates accounts', async () => {
    state.fail = true;
    await Promise.all([rememberInvoiceProductMappings('one', [mapping('Unt')]), rememberInvoiceProductMappings('one', [mapping('Lapte')])]);
    expect(await loadInvoiceProductMappings('one')).toHaveLength(2);
    expect(await loadInvoiceProductMappings('two')).toHaveLength(0);
    expect(state.accounts).toEqual(['one', 'two']);
  });
});
