import { createClient, type Session } from '@supabase/supabase-js';
import { beforeEach, expect, it, vi } from 'vitest';
import type { HrEmployee, HrShift } from '@/types/hr';

const fixture = vi.hoisted(() => ({
  client: null as ReturnType<typeof createClient> | null,
  storage: new Map<string, string>(),
  failRecoveryWrite: false,
}));
vi.mock('@react-native-async-storage/async-storage', () => ({ default: {
  getItem: async (key: string) => fixture.storage.get(key) ?? null,
  setItem: async (key: string, value: string) => {
    if (fixture.failRecoveryWrite && key.includes('.recovery.')) throw Error('Recovery storage unavailable');
    fixture.storage.set(key, value);
  },
} }));
vi.mock('@/lib/supabase', () => ({
  get supabase() { return fixture.client; }, isDemoMode: false, isSupabaseConfigured: true,
}));
vi.mock('@/lib/hr-lifecycle', () => ({ loadHrLifecycle: async () => [], applyHrLifecycle: (employees: unknown) => employees }));

import { loadHrData, removeHrEmployee, removeHrShift, saveHrEmployee } from '@/lib/hr-repository';

const owner = 'hr-retention-owner';
const key = `manager247.hr.v1.${owner}`;
const employee: HrEmployee = {
  id: 'chef', name: 'QA Chef', role: 'Cook', locationId: null, locationName: '',
  grossSalary: 6000, netSalary: 3600, active: true, syncState: 'synced',
  createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-11-05T05:00:00.123456+00:00',
};
const shift: HrShift = {
  id: 'shift', employeeId: employee.id, workDate: '2026-11-04',
  plannedStart: '08:00', plannedEnd: '16:00', actualStart: '08:00', actualEnd: '16:00',
  status: 'present', notes: 'Retained shift', syncState: 'synced', updatedAt: employee.updatedAt,
};
const remoteEmployee = (value = employee) => ({
  id: value.id, name: value.name, role: value.role, location_id: value.locationId,
  location_name: value.locationName, gross_salary: value.grossSalary, net_salary: value.netSalary,
  active: value.active, created_at: value.createdAt, updated_at: value.updatedAt,
});
const remoteShift = (value = shift) => ({
  id: value.id, employee_id: value.employeeId, work_date: value.workDate,
  planned_start: value.plannedStart, planned_end: value.plannedEnd,
  actual_start: value.actualStart, actual_end: value.actualEnd, status: value.status,
  notes: value.notes, updated_at: value.updatedAt,
});
let employees: ReturnType<typeof remoteEmployee>[];
let shifts: ReturnType<typeof remoteShift>[];
let deletions: { entity: string; row_id: string }[];
let offline = false;
let deleteFails = false;
let uploads: string[];
let headers: (string | null)[];
let deleteHeaders: (string | null)[];
let currentOwner: string;
let switchOnLedger: boolean;
let rejectUploads: boolean;
beforeEach(() => {
  fixture.failRecoveryWrite = switchOnLedger = rejectUploads = false;
  currentOwner = owner; headers = []; deleteHeaders = [];
  fixture.storage.clear();
  fixture.storage.set(key, JSON.stringify({ employees: [employee], shifts: [shift] }));
  employees = []; shifts = []; deletions = []; uploads = []; offline = false; deleteFails = false;
  const fetchFixture: typeof fetch = async (input, init) => {
    if (offline) throw new Error('offline');
    const url = new URL(String(input));
    const header = new Headers(init?.headers).get('Authorization');
    headers.push(header);
    const table = url.pathname.split('/').at(-1)!;
    if (table === 'list_hr_deletions') {
      if (switchOnLedger) currentOwner = 'other-owner';
      return Response.json(deletions);
    }
    if (init?.method === 'DELETE') {
      deleteHeaders.push(header);
      expect(url.searchParams.get('user_id')).toBe(`eq.${owner}`);
      return deleteFails ? Response.json({ message: 'offline deletion' }, { status: 503 }) : new Response(null, { status: 204 });
    }
    if (init?.method === 'POST' || init?.method === 'PATCH') {
      uploads.push(table);
      if (rejectUploads) return Response.json({ code: '42501' }, { status: 403 });
      const payload = JSON.parse(String(init.body));
      for (const row of Array.isArray(payload) ? payload : [payload]) expect(row.user_id).toBe(owner);
      const stamp = (row: Record<string, unknown>) => ({ ...row, updated_at: row.updated_at ?? employee.updatedAt });
      return Response.json(Array.isArray(payload) ? payload.map(stamp) : stamp(payload));
    }
    expect(url.searchParams.get('user_id')).toBe(`eq.${owner}`);
    return Response.json(table === 'hr_employees' ? employees : shifts);
  };
  fixture.client = createClient('http://127.0.0.1:9876', 'qa-fixture-key', {
    db: { retry: false }, global: { fetch: fetchFixture }, auth: { persistSession: false, autoRefreshToken: false },
  });
  vi.spyOn(fixture.client.auth, 'getSession').mockImplementation(async () => ({
    data: { session: { user: { id: currentOwner }, access_token: 'token-' + currentOwner } as Session }, error: null,
  }));
});

it('retains acknowledged employees and shifts after an omitted list and offline reopen without uploading them', async () => {
  expect(await loadHrData(owner)).toEqual({ employees: [employee], shifts: [shift] });
  offline = true;
  expect(await loadHrData(owner)).toEqual({ employees: [employee], shifts: [shift] });
  expect(uploads).toEqual([]);
});

it('accepts a newer cloud edit while preserving a shift omitted from the page', async () => {
  employees = [remoteEmployee({ ...employee, name: 'QA Renamed', updatedAt: '2026-11-05T06:00:00Z' })];
  const result = await loadHrData(owner);
  expect(result.employees[0].name).toBe('QA Renamed');
  expect(result.shifts).toEqual([shift]);
  expect(uploads).toEqual([]);
});

it('uses the deletion ledger even when a stale list still contains the deleted employee and shift', async () => {
  employees = [remoteEmployee()]; shifts = [remoteShift()];
  deletions = [{ entity: 'hr_employees', row_id: employee.id }, { entity: 'hr_shifts', row_id: shift.id }];
  expect(await loadHrData(owner)).toEqual({ employees: [], shifts: [] });
  deletions = [];
  expect(await loadHrData(owner)).toEqual({ employees: [], shifts: [] });
  expect(uploads).toEqual([]);
});

it('compares a millisecond cache with a newer PostgreSQL microsecond revision', async () => {
  fixture.storage.set(key, JSON.stringify({ employees: [{ ...employee, updatedAt: '2026-11-05T05:00:00.123Z' }], shifts: [] }));
  employees = [remoteEmployee({ ...employee, name: 'Microsecond revision' })];
  expect((await loadHrData(owner)).employees[0].name).toBe('Microsecond revision');
});

it('retains unrelated employees when one employee is explicitly deleted', async () => {
  fixture.storage.set(key, JSON.stringify({ employees: [employee, { ...employee, id: 'second', name: 'Second' }], shifts: [shift] }));
  deletions = [{ entity: 'hr_employees', row_id: employee.id }];
  const result = await loadHrData(owner);
  expect(result.employees.map(item => item.id)).toEqual(['second']);
  expect(result.shifts).toEqual([]);
});

it.each([true, false])('keeps an intentional employee deletion hidden after stale lists, deleteFails=%s', async (fails) => {
  deleteFails = fails;
  employees = [remoteEmployee()]; shifts = [remoteShift()];
  await removeHrEmployee(owner, employee.id);
  expect(await loadHrData(owner)).toEqual({ employees: [], shifts: [] });
  offline = true;
  expect(await loadHrData(owner)).toEqual({ employees: [], shifts: [] });
  expect(uploads).toEqual([]);
});

it.each([true, false])('keeps an intentional shift deletion hidden while retaining its employee, deleteFails=%s', async (fails) => {
  deleteFails = fails;
  employees = [remoteEmployee()]; shifts = [remoteShift()];
  await removeHrShift(owner, shift.id);
  expect(await loadHrData(owner)).toEqual({ employees: [employee], shifts: [] });
  expect(uploads).toEqual([]);
});

it('keeps the retention cache isolated by owner', async () => {
  fixture.client = null;
  expect(await loadHrData('other-owner')).toEqual({ employees: [], shifts: [] });
  expect(JSON.parse(fixture.storage.get(key)!)).toEqual({ employees: [employee], shifts: [shift] });
});

it('uses the server revision for a new employee despite a fast device clock', async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2030-01-01T00:00:00Z'));
  try {
    expect((await saveHrEmployee(owner, { ...employee, id: 'new-chef' })).updatedAt).toBe(employee.updatedAt);
  } finally { vi.useRealTimers(); }
});

it('retains pending employee and same-day shift edits when the device clock is behind the server', async () => {
  const pendingEmployee = { ...employee, name: 'Offline changed name', updatedAt: '2020-01-01T00:00:00Z', syncState: 'pending' };
  const pendingShift = { ...shift, id: 'offline-shift', notes: 'Offline changed note', updatedAt: pendingEmployee.updatedAt, syncState: 'pending' };
  fixture.storage.set(key, JSON.stringify({ employees: [pendingEmployee], shifts: [pendingShift] }));
  employees = [remoteEmployee()]; shifts = [remoteShift()];
  const result = await loadHrData(owner);
  expect(result.employees[0]).toMatchObject({ name: pendingEmployee.name, syncState: 'pending' });
  expect(result.shifts).toEqual([pendingShift]);
  expect(uploads).toEqual([]);
});

it('keeps local pending values when a newer-clock local upload fails', async () => {
  const pending = { ...employee, name: 'Pending correction', updatedAt: '2030-01-01T00:00:00Z', syncState: 'pending' };
  fixture.storage.set(key, JSON.stringify({ employees: [pending], shifts: [shift] }));
  employees = [remoteEmployee()]; shifts = [remoteShift()]; rejectUploads = true;
  expect((await loadHrData(owner)).employees[0]).toEqual(pending);
  expect(JSON.parse(fixture.storage.get(key)!).employees[0]).toEqual(pending);
});

it('does not overwrite different cloud contents merely because a pending device clock is faster', async () => {
  const pending = { ...employee, name: 'Fast clock pending change', updatedAt: '2030-01-01T00:00:00Z', syncState: 'pending' };
  fixture.storage.set(key, JSON.stringify({ employees: [pending], shifts: [] }));
  employees = [remoteEmployee({ ...employee, name: 'Other device correction' })];
  expect((await loadHrData(owner)).employees[0]).toEqual(pending);
  expect(uploads).toEqual([]);
  expect(employees[0].name).toBe('Other device correction');
});

it.each(['{bad', ''])('blocks mutation of malformed cache bytes %s and preserves their exact recovery source', async raw => {
  fixture.storage.set(key, raw);
  await expect(saveHrEmployee(owner, employee)).rejects.toThrow();
  expect(fixture.storage.get(key)).toBe(raw);
  expect(uploads).toEqual([]);
  employees = [remoteEmployee()]; shifts = [remoteShift()];
  expect(await loadHrData(owner)).toEqual({ employees: [employee], shifts: [shift] });
  const archive = JSON.parse(fixture.storage.get(`manager247.hr.recovery.v1.${owner}`)!);
  expect(archive.some((item: { raw: string }) => item.raw === raw)).toBe(true);
});

it('retains original cache bytes if recovery archival cannot be saved', async () => {
  const raw = '{pending bytes';
  fixture.storage.set(key, raw);
  fixture.failRecoveryWrite = true;
  employees = [remoteEmployee()]; shifts = [remoteShift()];
  await expect(loadHrData(owner)).rejects.toThrow('Recovery storage unavailable');
  expect(fixture.storage.get(key)).toBe(raw);
  expect(uploads).toEqual([]);
});

it('keeps a delete pending when another account is active instead of falsely acknowledging zero affected rows', async () => {
  currentOwner = 'other-owner';
  await removeHrEmployee(owner, employee.id);
  expect(deleteHeaders).toEqual([]);
  const queue = JSON.parse(fixture.storage.get(`manager247.hr.deletions.v1.${owner}`)!);
  expect(queue.employees).toEqual([employee.id]);
  expect(queue.confirmedEmployees).toEqual([]);
});

it('does not replace or ignore an unreadable deletion queue when saving a fresh employee', async () => {
  fixture.storage.delete(key);
  const deletionKey = `manager247.hr.deletions.v1.${owner}`;
  fixture.storage.set(deletionKey, '{unknown delete intent');
  await expect(saveHrEmployee(owner, employee)).rejects.toThrow();
  expect(fixture.storage.get(deletionKey)).toBe('{unknown delete intent');
  expect(fixture.storage.has(key)).toBe(false);
  expect(uploads).toEqual([]);
});

it('pins the initial owner for the entire list, ledger and pending upload sequence', async () => {
  fixture.storage.set(key, JSON.stringify({ employees: [{ ...employee, syncState: 'pending' }], shifts: [] }));
  switchOnLedger = true;
  await loadHrData(owner);
  expect(headers.length).toBeGreaterThan(3);
  expect(headers.every(header => header === 'Bearer token-' + owner)).toBe(true);
  expect(fixture.storage.has('manager247.hr.v1.other-owner')).toBe(false);
});
