import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  storage: new Map<string, string>(),
  failures: new Map<string, 'error' | 'throw'>(),
  rows: new Map<string, Record<string, unknown>[]>(),
}));

vi.mock('@react-native-async-storage/async-storage', () => ({ default: {
  getItem: async (key: string) => state.storage.get(key) ?? null,
  setItem: async (key: string, value: string) => { state.storage.set(key, value); },
} }));

function remoteResult(resource: string, data: unknown = []) {
  if (state.failures.get(resource) === 'throw') throw new Error('Network request failed');
  return state.failures.has(resource)
    ? { data: null, error: { message: 'Network request failed' } }
    : { data, error: null };
}

function query(table: string) {
  let write = false;
  let payload: unknown;
  let operation = 'upsert';
  const filters: [string, unknown][] = [];
  const inclusions: [string, readonly unknown[]][] = [];
  const matches = (row: Record<string, unknown>) => filters.every(([key, value]) => row[key] === value)
    && inclusions.every(([key, values]) => values.includes(row[key]));
  const prepareWrite = (value: unknown, kind: string) => {
    write = true;
    operation = kind;
    const stamp = (row: unknown) => ({ ...(row as Record<string, unknown>), updated_at: '2026-10-01T00:00:00Z' });
    payload = Array.isArray(value) ? value.map(stamp) : stamp(value);
    return builder;
  };
  const builder = {
    select: () => builder,
    eq: (key: string, value: unknown) => { filters.push([key, value]); return builder; },
    in: (key: string, values: readonly unknown[]) => { inclusions.push([key, values]); return builder; },
    setHeader: () => builder,
    order: () => builder,
    range: () => builder,
    limit: () => builder,
    single: () => builder,
    upsert: (value: unknown) => prepareWrite(value, 'upsert'),
    insert: (value: unknown) => prepareWrite(value, 'insert'),
    update: (value: unknown) => prepareWrite(value, 'update'),
    then: (resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) => (
      Promise.resolve().then(() => {
        const rows = state.rows.get(table) ?? [];
        if (!write) return remoteResult(table, rows.filter(matches));
        const candidates = Array.isArray(payload) ? payload : [payload];
        const result = remoteResult(`${table}:write`, operation === 'update' && !rows.some(matches) ? null : payload);
        if (!result.error && result.data) {
          state.rows.set(table, operation === 'update'
            ? rows.map(row => matches(row) ? { ...row, ...(payload as Record<string, unknown>) } : row)
            : [...rows.filter(row => !candidates.some(item => item.id === row.id)), ...candidates]);
        }
        return result;
      }).then(resolve, reject)
    ),
  };
  return builder;
}

vi.mock('@/lib/supabase', () => ({ isDemoMode: false, isSupabaseConfigured: true, supabase: {
  auth: { getSession: async () => ({ data: { session: { user: { id: 'payroll-loading' }, access_token: 'qa-payroll-token' } }, error: null }) },
  from: (table: string) => query(table),
  rpc: (name: string) => {
    const request = {
      setHeader: () => request,
      then: (resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) => (
        Promise.resolve().then(() => remoteResult(name)).then(resolve, reject)
      ),
    };
    return request;
  },
} }));

import { loadHrData } from '@/lib/hr-repository';
import { EMPTY_PNL_INPUTS } from '@/lib/pnl';
import { syncPnlReports } from '@/lib/pnl-repository';
import type { HrEmployee } from '@/types/hr';
import type { PnlReport } from '@/types/pnl';

const userId = 'payroll-loading';
const hrKey = `manager247.hr.v1.${userId}`;
const pnlKey = `manager247.pnl_reports.v1.${userId}`;
const employee: HrEmployee = {
  id: 'ana', name: 'Ana', role: '', locationId: null, locationName: '',
  grossSalary: 4200, netSalary: null, active: true, syncState: 'pending',
  createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-01T00:00:00Z',
};
const report: PnlReport = {
  ...EMPTY_PNL_INPUTS, id: 'october', period: '2026-10', notes: '', payrollCost: 4200,
  createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-01T00:00:00Z', syncState: 'synced',
};
const knownEmployees = { requireKnownEmployees: true };
const knownReports = { requireKnownReports: true };

beforeEach(() => { state.storage.clear(); state.failures.clear(); state.rows.clear(); });

describe('strict HR payroll loading', () => {
  it.each(['hr_employees', 'hr_shifts', 'list_hr_deletions'])('rejects unknown payroll when %s cannot be read', async (resource) => {
    state.failures.set(resource, 'error');
    await expect(loadHrData(userId, knownEmployees)).rejects.toThrow();
    expect(state.storage.has(hrKey)).toBe(false);
  });

  it.each([
    '{broken', 'null', '{}', '{"employees":[],"shifts":null}',
    '{"employees":[{}],"shifts":[]}',
    JSON.stringify({ employees: [{ ...employee, grossSalary: 'not a salary' }], shifts: [] }),
  ])('does not accept malformed HR cache %s as known payroll', async (raw) => {
    state.storage.set(hrKey, raw);
    state.failures.set('hr_employees', 'error');
    await expect(loadHrData(userId, knownEmployees)).rejects.toThrow();
    expect(state.storage.get(hrKey)).toBe(raw);
  });

  it.each(['hr_employees', 'hr_shifts', 'list_hr_deletions'])('uses a valid pending employee cache after a thrown %s read', async (resource) => {
    state.storage.set(hrKey, JSON.stringify({ employees: [employee], shifts: [] }));
    state.failures.set(resource, 'throw');
    expect((await loadHrData(userId, knownEmployees)).employees).toEqual([employee]);
  });

  it('accepts an explicitly cached empty employee list offline', async () => {
    state.storage.set(hrKey, JSON.stringify({ employees: [], shifts: [] }));
    state.failures.set('hr_employees', 'error');
    expect(await loadHrData(userId, knownEmployees)).toEqual({ employees: [], shifts: [] });
  });

  it('accepts online empty HR data and retains that knowledge for an offline retry', async () => {
    expect(await loadHrData(userId, knownEmployees)).toEqual({ employees: [], shifts: [] });
    state.failures.set('list_hr_deletions', 'error');
    expect(await loadHrData(userId, knownEmployees)).toEqual({ employees: [], shifts: [] });
  });

  it('recovers malformed HR storage from a successful cloud read', async () => {
    state.storage.set(hrKey, '{broken');
    expect(await loadHrData(userId, knownEmployees)).toEqual({ employees: [], shifts: [] });
    expect(JSON.parse(state.storage.get(hrKey)!)).toEqual({ employees: [], shifts: [] });
  });

  it('does not upload a malformed pending salary while recovering from the cloud', async () => {
    state.storage.set(hrKey, JSON.stringify({ employees: [{ ...employee, grossSalary: 'invalid' }], shifts: [] }));
    expect(await loadHrData(userId, knownEmployees)).toEqual({ employees: [], shifts: [] });
    expect(JSON.parse(state.storage.get(hrKey)!)).toEqual({ employees: [], shifts: [] });
  });

  it('preserves a valid pending employee when another cached entry is malformed', async () => {
    state.storage.set(hrKey, JSON.stringify({ employees: [employee, { ...employee, id: 'bad', grossSalary: 'invalid' }], shifts: [] }));
    expect((await loadHrData(userId, knownEmployees)).employees).toEqual([{ ...employee, syncState: 'synced' }]);
    expect(JSON.parse(state.storage.get(hrKey)!).employees).toEqual([{ ...employee, syncState: 'synced' }]);
  });

  it('keeps a mixed HR cache untouched and unknown when its cloud read fails', async () => {
    const raw = JSON.stringify({ employees: [employee, {}], shifts: [] });
    state.storage.set(hrKey, raw);
    state.failures.set('hr_employees', 'error');
    await expect(loadHrData(userId, knownEmployees)).rejects.toThrow();
    expect(state.storage.get(hrKey)).toBe(raw);
  });

  it('keeps the existing non-strict offline fallback', async () => {
    state.failures.set('hr_employees', 'error');
    expect(await loadHrData(userId)).toEqual({ employees: [], shifts: [] });
  });

  it('allows a new local demo to have no employees', async () => {
    expect(await loadHrData('demo', knownEmployees)).toEqual({ employees: [], shifts: [] });
  });
});

describe('strict P&L report loading', () => {
  it.each(['error', 'throw'] as const)('rejects unknown reports after a cloud read %s', async (failure) => {
    state.failures.set('pnl_reports', failure);
    await expect(syncPnlReports(userId, knownReports)).rejects.toThrow();
    expect(state.storage.has(pnlKey)).toBe(false);
  });

  it.each([
    '{broken', '{}', '[null]', '[{}]',
    JSON.stringify([{ ...report, payrollCost: 'invalid' }]),
    JSON.stringify([{ ...report, period: '2026-13' }]),
  ])('does not accept malformed P&L cache %s as known reports', async (raw) => {
    state.storage.set(pnlKey, raw);
    state.failures.set('pnl_reports', 'error');
    await expect(syncPnlReports(userId, knownReports)).rejects.toThrow();
    expect(state.storage.get(pnlKey)).toBe(raw);
  });

  it.each(['error', 'throw'] as const)('retains a saved payroll snapshot after a cloud read %s', async (failure) => {
    state.storage.set(pnlKey, JSON.stringify([report]));
    state.failures.set('pnl_reports', failure);
    expect(await syncPnlReports(userId, knownReports)).toEqual([report]);
  });

  it('accepts explicitly cached empty reports offline', async () => {
    state.storage.set(pnlKey, '[]');
    state.failures.set('pnl_reports', 'error');
    expect(await syncPnlReports(userId, knownReports)).toEqual([]);
  });

  it('accepts online empty reports and retains that knowledge for an offline retry', async () => {
    expect(await syncPnlReports(userId, knownReports)).toEqual([]);
    state.failures.set('pnl_reports', 'error');
    expect(await syncPnlReports(userId, knownReports)).toEqual([]);
  });

  it('recovers malformed report entries from a successful cloud read', async () => {
    state.storage.set(pnlKey, '[null,{}]');
    expect(await syncPnlReports(userId, knownReports)).toEqual([]);
    expect(state.storage.get(pnlKey)).toBe('[]');
  });

  it('preserves and uploads a known-new pending report when another cached entry is malformed', async () => {
    state.storage.set(pnlKey, JSON.stringify([{ ...report, syncState: 'pending', baseUpdatedAt: null }, null, {}]));
    expect(await syncPnlReports(userId, knownReports)).toEqual([expect.objectContaining({
      id: report.id, period: report.period, payrollCost: 4200, syncState: 'synced',
    })]);
    expect(JSON.parse(state.storage.get(pnlKey)!)).toEqual([expect.objectContaining({ payrollCost: 4200, syncState: 'synced' })]);
  });

  it('keeps a mixed report cache untouched and unknown when its cloud read fails', async () => {
    const raw = JSON.stringify([{ ...report, syncState: 'pending' }, null]);
    state.storage.set(pnlKey, raw);
    state.failures.set('pnl_reports', 'error');
    await expect(syncPnlReports(userId, knownReports)).rejects.toThrow();
    expect(state.storage.get(pnlKey)).toBe(raw);
  });

  it('retains a pending report when its upload and cloud read fail', async () => {
    state.storage.set(pnlKey, JSON.stringify([{ ...report, syncState: 'pending' }]));
    state.failures.set('pnl_reports:write', 'error');
    state.failures.set('pnl_reports', 'error');
    expect(await syncPnlReports(userId, knownReports)).toEqual([expect.objectContaining({
      id: report.id, period: report.period, payrollCost: 4200, syncState: 'pending',
    })]);
    expect(JSON.parse(state.storage.get(pnlKey)!)[0]).toMatchObject({ payrollCost: 4200, syncState: 'pending' });
  });

  it('keeps the existing non-strict offline fallback', async () => {
    state.failures.set('pnl_reports', 'error');
    expect(await syncPnlReports(userId)).toEqual([]);
  });

  it('allows a new local demo to have no reports', async () => {
    expect(await syncPnlReports('demo', knownReports)).toEqual([]);
  });
});
