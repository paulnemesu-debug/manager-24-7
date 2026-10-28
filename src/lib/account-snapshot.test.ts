import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ cache: new Map<string, string>(), tables: {} as Record<string, Record<string, unknown>[]>,
  reads: [] as { table: string; start: number }[], offline: false }));
vi.mock('@react-native-async-storage/async-storage', () => ({ default: {
  getAllKeys: async () => [...state.cache.keys()],
  multiGet: async (keys: string[]) => keys.map((key) => [key, state.cache.get(key) ?? null]),
} }));
vi.mock('@/lib/supabase', () => ({ isDemoMode: false, supabase: {
  rpc: async (name: string) => ({ data: name === 'has_professional_access' ? true : [], error: null }),
  from: (table: string) => {
    let selected = '*'; let owner = 'user_id'; let user = ''; let start = 0; let end = 499;
    const query = {
      select: (columns: string) => { selected = columns; return query; },
      eq: (column: string, value: string) => { owner = column; user = value; return query; },
      order: () => query,
      range: (first: number, last: number) => { start = first; end = last; return query; },
      abortSignal: async () => {
        state.reads.push({ table, start });
        if (state.offline) return { data: null, error: { code: 'offline' } };
        const rows = (state.tables[table] ?? []).filter((row) => row[owner] === user).slice(start, end + 1);
        return { error: null, data: selected === '*' ? rows : rows.map((row) => Object.fromEntries(selected.split(',').map((key) => [key, row[key]]))) };
      },
    };
    return query;
  },
} }));
import { accountLocalModule, buildAccountSnapshot } from '@/lib/account-snapshot';

beforeEach(() => { state.cache.clear(); state.tables = {}; state.reads = []; state.offline = false; });

describe('complete account export', () => {
  it('includes HR, draft and period caches only for the requested account and excludes auth', async () => {
    state.cache.set('manager247.hr.v1.one', '{"employees":[{"id":"employee"}]}');
    state.cache.set('manager247.hr.v1.two', '{"secret":"other account"}');
    state.cache.set('manager247.recipe-drafts.v1.one', '[{"title":"draft"}]');
    state.cache.set('professional_foodcost.sales.2026-10-01.v1.one', '{"dish":50}');
    state.cache.set('sb-project-auth-token', '{"refresh_token":"secret"}');
    state.cache.set('manager247.telemetry.queue.v1', '[{"secret":"global"}]');
    const result = await buildAccountSnapshot('one', [], []);
    expect(result.localModules.hr).toEqual({ employees: [{ id: 'employee' }] });
    expect(result.localModules['sales.2026-10-01']).toEqual({ dish: 50 });
    expect(JSON.stringify(result)).not.toContain('secret');
    expect(accountLocalModule('manager247.hr.v1.other-one', 'one')).toBeNull();
    expect(result.manifest.cloudComplete).toBe(true);
  });
  it('exports every cloud page, inactive locations and safe subscription metadata', async () => {
    state.tables.hr_shifts = Array.from({ length: 1501 }, (_, id) => ({ id, user_id: 'one' }));
    state.tables.business_locations = [{ id: 'old', owner_user_id: 'one', active: false }, { id: 'other', owner_user_id: 'two' }];
    state.tables.subscriptions = [{ user_id: 'one', status: 'active', purchase_token_hash: 'billing-secret' }];
    const result = await buildAccountSnapshot('one', [], []);
    expect(result.serverTables.hr_shifts).toHaveLength(1501);
    expect(state.reads.filter((item) => item.table === 'hr_shifts').map((item) => item.start)).toEqual([0, 500, 1000, 1500]);
    expect(result.serverTables.business_locations).toHaveLength(1);
    expect(result.serverTables.business_locations[0].active).toBe(false);
    expect(JSON.stringify(result)).not.toContain('billing-secret');
  });
  it('retains local modules and marks cloud omissions instead of claiming a complete backup', async () => {
    state.offline = true;
    state.cache.set('manager247.pnl_reports.v1.one', '[{"id":"local-pnl"}]');
    const result = await buildAccountSnapshot('one', [], []);
    expect(result.localModules.pnl).toEqual([{ id: 'local-pnl' }]);
    expect(result.manifest.cloudComplete).toBe(false);
    expect(result.manifest.issues).toContainEqual({ module: 'hr_shifts', code: 'offline' });
  });
  it('preserves malformed local data for recovery and reports the damaged module', async () => {
    state.cache.set('manager247.recipe-drafts.v1.one', 'partial-json');
    const result = await buildAccountSnapshot('one', [], []);
    expect(result.localModules.recipeDrafts).toEqual({ unparsedData: 'partial-json' });
    expect(result.manifest.issues).toContainEqual({ module: 'recipeDrafts', code: 'invalid_local_json' });
  });
});
