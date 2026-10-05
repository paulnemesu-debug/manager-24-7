import { beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ storage: new Map<string, string>(), cloud: [] as Record<string, unknown>[], fail: false,
  writes: [] as Record<string, unknown>[][] }));
vi.mock('@react-native-async-storage/async-storage', () => ({ default: {
  getItem: async (key: string) => state.storage.get(key) ?? null,
  setItem: async (key: string, value: string) => { state.storage.set(key, value); },
} }));
vi.mock('@/lib/supabase', () => ({ isDemoMode: false, supabase: { from: () => ({
  select: () => ({ eq: (_: string, user: string) => ({ eq: async (_: string, period: string) => ({
    data: state.cloud.filter((row) => row.user_id === user && row.period_start === period), error: state.fail ? new Error('offline') : null,
  }) }) }),
  upsert: async (rows: Record<string, unknown>[]) => {
    if (state.fail) return { error: new Error('offline') };
    state.writes.push(rows);
    rows.forEach(row => { state.cloud = state.cloud.filter(old => old.user_id !== row.user_id
      || old.period_start !== row.period_start || old.recipe_id !== row.recipe_id); state.cloud.push(row); });
    return { error: null };
  },
}) } }));
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
  it('recovers from malformed sales caches', async () => {
    state.storage.set('professional_foodcost.sales.2026-10-01.v1.one', 'null');
    state.storage.set('professional_foodcost.sales_pending.2026-10-01.v1.one', '{"dish":null}');
    expect(await loadSales('one', '2026-10-01')).toEqual({});
  });
});
