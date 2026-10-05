import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  storage: new Map<string, string>(),
  rows: {} as Record<string, Record<string, unknown>[]>,
  deleted: [] as { entity: string; row_id: string }[],
  online: false,
  writes: [] as { table: string; id: unknown }[],
  reads: [] as { table: string; start: number }[],
}));

vi.mock('@react-native-async-storage/async-storage', () => ({ default: {
  getItem: async (key: string) => { await Promise.resolve(); return state.storage.get(key) ?? null; },
  setItem: async (key: string, value: string) => { await Promise.resolve(); state.storage.set(key, value); },
  removeItem: async (key: string) => { state.storage.delete(key); },
} }));

type Result = { data: Record<string, unknown>[] | Record<string, unknown> | null; error: { message: string } | null };
function query(table: string) {
  let operation = 'read';
  let values: Record<string, unknown>[] = [];
  let one = false;
  let start = 0;
  let end = Number.MAX_SAFE_INTEGER;
  const filters: [string, unknown][] = [];
  const run = (): Result => {
    if (!state.online) return { data: null, error: { message: 'Network request failed' } };
    let rows = state.rows[table] ?? [];
    if (operation === 'write') {
      values.forEach((value) => {
        state.writes.push({ table, id: value.id });
        rows = [value, ...rows.filter((item) => item.id !== value.id)];
      });
      state.rows[table] = rows;
      return { data: one ? values[0] : values, error: null };
    }
    const selected = rows.filter((item) => filters.every(([key, value]) => item[key] === value));
    if (operation === 'delete') {
      selected.forEach((value) => state.deleted.push({ entity: table, row_id: String(value.id) }));
      state.rows[table] = rows.filter((item) => !selected.includes(item));
      return { data: null, error: null };
    }
    state.reads.push({ table, start });
    return { data: one ? selected[0] ?? null : selected.slice(start, end + 1), error: null };
  };
  const builder = {
    select: (_columns?: string) => builder,
    eq: (key: string, value: unknown) => { filters.push([key, value]); return builder; },
    order: (_key: string, _options?: unknown) => builder,
    limit: (_amount: number) => builder,
    range: (from: number, to: number) => { start = from; end = to; return builder; },
    upsert: (input: Record<string, unknown> | Record<string, unknown>[], _options?: unknown) => { operation = 'write'; values = Array.isArray(input) ? input : [input]; return builder; },
    update: (input: Record<string, unknown>) => { operation = 'write'; values = [input]; return builder; },
    delete: () => { operation = 'delete'; return builder; },
    single: () => { one = true; return builder; },
    maybeSingle: () => { one = true; return builder; },
    then: (resolve: (value: Result) => unknown, reject?: (reason: unknown) => unknown) => Promise.resolve(run()).then(resolve, reject),
  };
  return builder;
}

vi.mock('@/lib/supabase', () => ({ isDemoMode: false, isSupabaseConfigured: true, supabase: {
  from: (table: string) => query(table),
  rpc: async () => ({ data: state.online ? state.deleted : null, error: state.online ? null : { message: 'offline' } }),
} }));

import { saveStockPolicy, loadOperationsControlData } from '@/lib/operations-control-repository';
import { loadHrData, removeHrEmployee, saveHrEmployee } from '@/lib/hr-repository';
import { loadCachedHaccpDocuments, saveHaccpDocument } from '@/lib/haccp-repository';
import type { HaccpDocument } from '@/types/haccp';

const userId = 'recovery-test';
const employee = (id: string) => ({ id, name: 'Ana', role: 'Chef', locationId: null, locationName: '', grossSalary: null, netSalary: null, active: true, createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-01T00:00:00Z' });

beforeEach(() => { state.storage.clear(); state.rows = {}; state.deleted = []; state.writes = []; state.reads = []; state.online = false; });

describe('repository recovery', () => {
  it('keeps every concurrent offline threshold and uploads it after reconnecting', async () => {
    await Promise.all(['a', 'b', 'c'].map((id) => saveStockPolicy(userId, {
      id, catalogId: id, locationId: null, minimumQuantity: 2, targetQuantity: 5, storageZone: 'Rece',
    })));
    const offline = await loadOperationsControlData(userId);
    expect(offline.policies.map((item) => item.id).sort()).toEqual(['a', 'b', 'c']);
    expect(offline.policies.every((item) => item.syncState === 'pending')).toBe(true);
    state.online = true;
    const online = await loadOperationsControlData(userId);
    expect(state.rows.stock_policies).toHaveLength(3);
    expect(online.policies.every((item) => item.syncState === 'synced')).toBe(true);
    await loadOperationsControlData(userId);
    expect(state.writes.filter((item) => item.table === 'stock_policies')).toHaveLength(3);
  });

  it('does not lose one HACCP document when two saves start together', async () => {
    const doc = (id: string): HaccpDocument => ({ id, formCode: 'FO-H-20-02', headerValues: {}, rows: [], createdAt: '', updatedAt: '', syncState: 'local' });
    await Promise.all([saveHaccpDocument(userId, doc('first')), saveHaccpDocument(userId, doc('second'))]);
    expect((await loadCachedHaccpDocuments(userId)).map((item) => item.id).sort()).toEqual(['first', 'second']);
  });

  it('drops a remotely deleted employee from a stale cache before any upload', async () => {
    state.storage.set('manager247.hr.v1.' + userId, JSON.stringify({ employees: [employee('deleted')], shifts: [] }));
    state.deleted = [{ entity: 'hr_employees', row_id: 'deleted' }];
    state.online = true;
    expect((await loadHrData(userId)).employees).toEqual([]);
    expect(state.writes).toEqual([]);
  });

  it('retains an offline delete across reload and applies it on reconnection', async () => {
    state.rows.hr_employees = [{ ...employee('gone'), user_id: userId, created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-01T00:00:00Z' }];
    state.storage.set('manager247.hr.v1.' + userId, JSON.stringify({ employees: [employee('gone')], shifts: [] }));
    await removeHrEmployee(userId, 'gone');
    expect((await loadHrData(userId)).employees).toEqual([]);
    state.online = true;
    expect((await loadHrData(userId)).employees).toEqual([]);
    expect(state.rows.hr_employees).toEqual([]);
    expect(state.deleted).toContainEqual({ entity: 'hr_employees', row_id: 'gone' });
  });

  it('keeps both concurrent employee saves offline', async () => {
    await Promise.all(['one', 'two'].map((id) => saveHrEmployee(userId, employee(id))));
    expect((await loadHrData(userId)).employees).toHaveLength(2);
  });

  it('loads older attendance beyond the former 1,500-row ceiling', async () => {
    state.online = true;
    state.rows.hr_employees = Array.from({ length: 10 }, (_, index) => ({ ...employee('emp-' + index), user_id: userId }));
    state.rows.hr_shifts = Array.from({ length: 1501 }, (_, index) => ({
      id: 'shift-' + index, user_id: userId, employee_id: 'emp-' + (index % 10),
      work_date: new Date(Date.UTC(2026, 0, 1 + Math.floor(index / 10))).toISOString().slice(0, 10),
      status: 'present', actual_start: '08:00', actual_end: '16:00', updated_at: '2026-10-01T00:00:00Z',
    }));
    expect((await loadHrData(userId)).shifts).toHaveLength(1501);
    expect(state.reads.filter((item) => item.table === 'hr_shifts').map((item) => item.start)).toEqual([0, 500, 1000, 1500]);
  });
});
