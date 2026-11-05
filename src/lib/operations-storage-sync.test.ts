import { beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ storage: new Map<string, string>(), cloud: [] as Record<string, unknown>[], fail: false,
  writes: [] as Record<string, unknown>[][] }));
vi.mock('@react-native-async-storage/async-storage', () => ({ default: {
  getItem: async (key: string) => state.storage.get(key) ?? null,
  setItem: async (key: string, value: string) => { state.storage.set(key, value); },
} }));
vi.mock('@/lib/supabase', () => ({ isDemoMode: false, supabase: {
  auth: { getSession: async () => ({ data: { session: { user: { id: 'one' }, access_token: 'fixture-token-one' } }, error: null }) },
  from: () => {
    let operation = 'read'; let values: Record<string, unknown>[] = [];
    const filters: [string, unknown][] = [];
    const chain = {
      select: () => chain, setHeader: () => chain, limit: () => chain,
      eq: (key: string, value: unknown) => { filters.push([key,value]); return chain; },
      in: (key: string, value: string[]) => { filters.push([key,value]); return chain; },
      upsert: (input: Record<string, unknown>[]) => { operation='upsert'; values=input; return chain; },
      insert: (input: Record<string, unknown>) => { operation='insert'; values=[input]; return chain; },
      update: (input: Record<string, unknown>) => { operation='update'; values=[input]; return chain; },
      then: (resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) => Promise.resolve().then(() => {
        if (state.fail) return { error: new Error('offline'), data: null };
        state.cloud = state.cloud.map(row => ({ source: 'manual', source_reference: null, updated_at: '2026-11-05T10:00:00.123456Z', ...row }));
        const matches = (row: Record<string, unknown>) => filters.every(([key,value]) => Array.isArray(value) ? value.includes(row[key]) : row[key] === value);
        if (operation === 'read') return { data: state.cloud.filter(matches), error: null };
        state.writes.push(values);
        const saved: Record<string, unknown>[] = [];
        for (const value of values) {
          const previous = state.cloud.find(row => operation === 'update' ? matches(row) : row.user_id === value.user_id && row.period_start === value.period_start && row.recipe_id === value.recipe_id);
          if (operation === 'insert' && previous) return { error: { code: '23505' }, data: null };
          if (operation === 'update' && !previous) continue;
          const next = { ...previous, ...value, updated_at: '2026-11-05T10:01:00.123456Z' };
          state.cloud = [...state.cloud.filter(row => row !== previous), next]; saved.push(next);
        }
        return { error: null, data: saved };
      }).then(resolve,reject),
    }; return chain;
  },
} }));
import { loadSales, saveSales } from '@/lib/operations-storage';
beforeEach(() => { state.storage.clear(); state.cloud = []; state.writes = []; state.fail = false; });
describe('menu sales offline synchronization', () => {
  it('keeps offline edits over stale cloud values, then syncs them without losing another cloud recipe', async () => {
    state.cloud = [{ user_id: 'one', period_start: '2026-10-01', recipe_id: 'dish', portions: 10 },
      { user_id: 'one', period_start: '2026-10-01', recipe_id: 'other', portions: 5 }];
    await loadSales('one', '2026-10-01'); state.fail = true;
    await expect(saveSales('one', { dish: 20, other: 5 }, '2026-10-01')).rejects.toThrow('offline');
    expect(await loadSales('one', '2026-10-01')).toEqual({ dish: 20, other: 5 });
    state.fail = false;
    expect(await loadSales('one', '2026-10-01')).toEqual({ dish: 20, other: 5 });
    expect(state.writes.at(-1)?.map(row => row.recipe_id)).toEqual(['dish']);
    expect(state.cloud.find(row => row.recipe_id === 'dish')?.portions).toBe(20);
  });
  it('isolates months and accounts and records confirmed zero sales', async () => {
    await saveSales('one', { dish: 0 }, '2026-10-01');
    expect(await loadSales('one', '2026-10-01')).toEqual({ dish: 0 });
    expect(await loadSales('one', '2026-09-01')).toEqual({});
    expect(await loadSales('two', '2026-10-01')).toEqual({});
  });
  it.each(['{"dish":{"portions":20', '{"dish":null}'])('preserves malformed pending sales bytes and blocks load/save: %s', async raw => {
    state.storage.set('professional_foodcost.sales.2026-10-01.v1.one', '{"dish":10}');
    state.storage.set('professional_foodcost.sales_pending.2026-10-01.v1.one', raw);
    const before = [...state.storage];
    await expect(loadSales('one', '2026-10-01')).rejects.toHaveProperty('translationKey', 'operational.sync.invalidLocal');
    await expect(saveSales('one', { dish: 20 }, '2026-10-01')).rejects.toHaveProperty('translationKey', 'operational.sync.invalidLocal');
    expect([...state.storage]).toEqual(before);
    expect(state.writes).toEqual([]);
  });
  it.each(['{"dish":', 'null'])('preserves malformed sales cache bytes and pending intent: %s', async raw => {
    state.storage.set('professional_foodcost.sales.2026-10-01.v1.one', raw);
    state.storage.set('professional_foodcost.sales_pending.2026-10-01.v1.one', '{"dish":{"portions":20,"source":"manual","sourceReference":null}}');
    const before = [...state.storage];
    await expect(loadSales('one', '2026-10-01')).rejects.toHaveProperty('translationKey', 'operational.sync.invalidLocal');
    await expect(saveSales('one', { dish: 30 }, '2026-10-01')).rejects.toHaveProperty('translationKey', 'operational.sync.invalidLocal');
    expect([...state.storage]).toEqual(before);
    expect(state.writes).toEqual([]);
  });
});
