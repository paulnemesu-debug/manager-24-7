import AsyncStorage from '@react-native-async-storage/async-storage';

import { dedupeShiftsByEmployeeDay, normalizeHrEmployee, normalizeHrShift, upsertShiftForDay } from '@/lib/hr';
import { withStorageLock } from '@/lib/storage-lock';
import { cloudRevisionTime } from '@/lib/cloud-revision-time';
import { OperationalError } from '@/lib/operational-sync';
import { applyHrLifecycle, loadHrLifecycle } from '@/lib/hr-lifecycle';
import { isDemoMode, isSupabaseConfigured, supabase } from '@/lib/supabase';
import type { HrData, HrEmployee, HrShift } from '@/types/hr';

type RemoteEmployee = {
  id: string;
  name: string;
  role: string;
  location_id: string | null;
  location_name: string;
  gross_salary: number | null;
  net_salary: number | null;
  active: boolean;
  created_at: string;
  updated_at: string;
};

type RemoteShift = {
  id: string;
  employee_id: string;
  work_date: string;
  planned_start: string;
  planned_end: string;
  actual_start: string;
  actual_end: string;
  status: HrShift['status'];
  notes: string;
  updated_at: string;
};

const employeeColumns = 'id,name,role,location_id,location_name,gross_salary,net_salary,active,created_at,updated_at';
const shiftColumns = 'id,employee_id,work_date,planned_start,planned_end,actual_start,actual_end,status,notes,updated_at';
const keyFor = (userId: string) => `manager247.hr.v1.${userId}`;
const emptyData = (): HrData => ({ employees: [], shifts: [] });
const uuid = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (character) => {
  const random = Math.floor(Math.random() * 16);
  return (character === 'x' ? random : (random & 3) | 8).toString(16);
});

function canUseCloud(userId: string) {
  return userId !== 'demo' && !isDemoMode && isSupabaseConfigured && Boolean(supabase);
}

async function hrAuthorization(userId: string): Promise<string | null> {
  if (!canUseCloud(userId) || !supabase) return null;
  try {
    const { data, error } = await supabase.auth.getSession();
    return !error && data.session?.user.id === userId && data.session.access_token
      ? `Bearer ${data.session.access_token}` : null;
  } catch { return null; }
}

function normalizeData(value: unknown): HrData {
  const parsed = value && typeof value === 'object' ? value as Partial<HrData> : {};
  const fallback = new Date().toISOString();
  const employees = (Array.isArray(parsed.employees) ? parsed.employees : [])
    .map((item) => normalizeHrEmployee(item, fallback))
    .filter((item): item is HrEmployee => item !== null);
  const employeeIds = new Set(employees.map((item) => item.id));
  const shifts = (Array.isArray(parsed.shifts) ? parsed.shifts : [])
    .map((item) => normalizeHrShift(item, fallback))
    .filter((item): item is HrShift => item !== null && employeeIds.has(item.employeeId));
  return { employees, shifts: dedupeShiftsByEmployeeDay(shifts) };
}

function isKnownHrEmployee(value: unknown) {
  if (!normalizeHrEmployee(value)) return false;
  const employee = value as Record<string, unknown>;
  const validSalary = (amount: unknown) => amount === undefined || amount === null || amount === ''
    || ((typeof amount === 'number' || typeof amount === 'string') && Number.isFinite(Number(amount)) && Number(amount) >= 0);
  return validSalary(employee.grossSalary ?? employee.gross_salary)
    && validSalary(employee.netSalary ?? employee.net_salary)
    && (employee.active === undefined || typeof employee.active === 'boolean');
}

function isKnownHrCache(value: unknown) {
  if (!value || typeof value !== 'object') return false;
  const parsed = value as Record<string, unknown>;
  return Array.isArray(parsed.employees) && parsed.employees.every(isKnownHrEmployee)
    && Array.isArray(parsed.shifts) && parsed.shifts.every((item: unknown) => normalizeHrShift(item) !== null);
}

async function readCache(userId: string, strict = false): Promise<{ data: HrData; known: boolean; raw: string | null }> {
  const raw = await AsyncStorage.getItem(keyFor(userId));
  const deleted = await readDeletes(userId);
  if (raw === null) return { data: emptyData(), known: false, raw };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch { return { data: emptyData(), known: false, raw }; }
  const source = parsed && typeof parsed === 'object' ? parsed as Partial<HrData> : {};
  const normalized = normalizeData(strict ? {
    ...source,
    employees: Array.isArray(source.employees) ? source.employees.filter(isKnownHrEmployee) : [],
  } : parsed);
  normalized.employees = normalized.employees.filter((item) => !deleted.employees.includes(item.id) && !deleted.confirmedEmployees.includes(item.id));
  const employees = new Set(normalized.employees.map((item) => item.id));
  normalized.shifts = normalized.shifts.filter((item) => !deleted.shifts.includes(item.id) && !deleted.confirmedShifts.includes(item.id) && employees.has(item.employeeId));
  return { data: normalized, known: isKnownHrCache(parsed), raw };
}

async function loadCache(userId: string): Promise<HrData> {
  const cached = await readCache(userId);
  if (cached.raw !== null && !cached.known) throw new OperationalError('operational.sync.invalidLocal');
  return cached.data;
}

async function preserveRecoverySource(userId: string, raw: string) {
  const key = `manager247.hr.recovery.v1.${userId}`;
  const stored = await AsyncStorage.getItem(key);
  let archive: { raw: string; recordedAt: string }[] = [];
  if (stored !== null) {
    try {
      const value: unknown = JSON.parse(stored);
      if (!Array.isArray(value) || value.some(item => !item || typeof item.raw !== 'string'
        || typeof item.recordedAt !== 'string')) throw new Error('Invalid archive');
      archive = value;
    } catch { throw new OperationalError('operational.sync.invalidLocal'); }
  }
  if (archive.some(item => item.raw === raw)) return;
  await AsyncStorage.setItem(key, JSON.stringify([...archive, { raw, recordedAt: new Date().toISOString() }]));
}

async function saveCache(userId: string, data: HrData) {
  const normalized = normalizeData(data);
  await AsyncStorage.setItem(keyFor(userId), JSON.stringify(normalized));
  return normalized;
}

function employeeFromRemote(row: RemoteEmployee): HrEmployee {
  return { ...normalizeHrEmployee(row, row.updated_at)!, syncState: 'synced' };
}

function shiftFromRemote(row: RemoteShift): HrShift {
  return { ...normalizeHrShift(row, row.updated_at)!, syncState: 'synced' };
}

function employeeToRemote(userId: string, employee: HrEmployee) {
  return {
    id: employee.id,
    user_id: userId,
    name: employee.name,
    role: employee.role,
    location_id: employee.locationId,
    location_name: employee.locationName,
    gross_salary: employee.grossSalary,
    net_salary: employee.netSalary,
    active: employee.active,
    created_at: employee.createdAt,
  };
}

function shiftToRemote(userId: string, shift: HrShift) {
  return {
    id: shift.id,
    user_id: userId,
    employee_id: shift.employeeId,
    work_date: shift.workDate,
    planned_start: shift.plannedStart,
    planned_end: shift.plannedEnd,
    actual_start: shift.actualStart,
    actual_end: shift.actualEnd,
    status: shift.status,
    notes: shift.notes,
  };
}

function latestById<T extends { id: string; updatedAt: string; syncState?: string }>(local: readonly T[], remote: readonly T[]) {
  const merged = new Map(remote.map((item) => [item.id, item]));
  for (const item of local) {
    const other = merged.get(item.id);
    if (!other || item.syncState === 'pending' || item.syncState === 'local'
      || (cloudRevisionTime(item.updatedAt) ?? -1n) > (cloudRevisionTime(other.updatedAt) ?? -1n)) merged.set(item.id, item);
  }
  return [...merged.values()];
}

async function replayPendingHr<T extends { id: string; syncState?: string }, R extends { id: string; updated_at: string }>(
  table: 'hr_employees' | 'hr_shifts', columns: string, userId: string, authorization: string,
  local: T[], remote: T[], identity: (item: T) => string,
  toRemote: (userId: string, item: T) => Record<string, unknown>,
  fromRemote: (row: R) => T, valid: (value: unknown) => boolean,
): Promise<T[]> {
  const result = new Map(local.map(item => [item.id, item]));
  const remoteByKey = new Map(remote.map(item => [identity(item), item]));
  const pending = local.filter(item => item.syncState !== 'synced');
  for (let offset = 0; offset < pending.length; offset += 50) {
    const batch = pending.slice(offset, offset + 50);
    const ids = batch.map(item => remoteByKey.get(identity(item))?.id ?? item.id);
    try {
      const checked = await supabase!.from(table).select(columns).eq('user_id', userId).in('id', ids)
        .limit(50).setHeader('Authorization', authorization);
      if (checked.error || !Array.isArray(checked.data)) continue;
      const rows = checked.data as unknown as R[];
      if (rows.some(row => !valid(row) || !ids.includes(row.id) || cloudRevisionTime(row.updated_at) === null)
        || new Set(rows.map(row => row.id)).size !== rows.length) continue;
      const verified = new Map(rows.map(row => { const item = fromRemote(row); return [identity(item), item]; }));
      for (const item of batch) {
        const cloud = verified.get(identity(item));
        if (cloud) {
          const localPayload = toRemote(userId, item);
          const cloudPayload = toRemote(userId, cloud);
          if (Object.keys(localPayload).filter(key => key !== 'id' && key !== 'created_at')
            .every(key => localPayload[key] === cloudPayload[key])) result.set(item.id, cloud);
          continue;
        }
        // An existing differing record requires an explicit save. A missing ID
        // is insert-only so a stale read cannot overwrite it or bypass the deletion ledger.
        const saved = await supabase!.from(table).insert(toRemote(userId, item)).select(columns).single()
          .setHeader('Authorization', authorization);
        const row = saved.data as unknown as R | null;
        if (!saved.error && row && row.id === item.id && valid(row) && cloudRevisionTime(row.updated_at) !== null) {
          result.set(item.id, fromRemote(row));
        }
      }
    } catch { /* Keep pending intent after a failed read, collision, or insert. */ }
  }
  return local.map(item => result.get(item.id)!);
}

type HrLoadOptions = { requireKnownEmployees?: boolean };

async function loadHrDataUnlocked(userId: string, options: HrLoadOptions): Promise<HrData> {
  const cached = await readCache(userId, options.requireKnownEmployees);
  const local = cached.data;
  if (!canUseCloud(userId) || !supabase) return local;
  const authorization = await hrAuthorization(userId);
  if (!authorization) {
    if (options.requireKnownEmployees && !cached.known) throw new Error('HR employee data is unavailable without a valid local cache.');
    return local;
  }

  await flushDeletes(userId, authorization);
  const results = await Promise.all([
    readAllHrRows('hr_employees', employeeColumns, userId, authorization),
    readAllHrRows('hr_shifts', shiftColumns, userId, authorization),
    supabase.rpc('list_hr_deletions').setHeader('Authorization', authorization),
  ]).catch((error: unknown) => {
    if (!options.requireKnownEmployees || !cached.known) throw error;
    return null;
  });
  if (!results) return local;
  const [employeeResult, shiftResult, deletedResult] = results;
  if (employeeResult.error || shiftResult.error || deletedResult.error
    || !Array.isArray(employeeResult.data) || !Array.isArray(shiftResult.data) || !Array.isArray(deletedResult.data)) {
    if (options.requireKnownEmployees && !cached.known) throw new Error('HR employee data is unavailable without a valid local cache.');
    return local;
  }
  if (cached.raw !== null && !cached.known) await preserveRecoverySource(userId, cached.raw);
  const deletionQueue = await readDeletes(userId);
  const deletedEmployees = new Set([...deletionQueue.employees, ...deletionQueue.confirmedEmployees]);
  const deletedShifts = new Set([...deletionQueue.shifts, ...deletionQueue.confirmedShifts]);
  for (const item of deletedResult.data ?? []) {
    (item.entity === 'hr_employees' ? deletedEmployees : deletedShifts).add(String(item.row_id));
  }
  // A stale list or deletion-ledger response must not undo an acknowledged deletion.
  const confirmedEmployees = [...new Set([...deletionQueue.confirmedEmployees,
    ...(deletedResult.data ?? []).filter((item: { entity: string }) => item.entity === 'hr_employees').map((item: { row_id: string }) => String(item.row_id))])];
  const confirmedShifts = [...new Set([...deletionQueue.confirmedShifts,
    ...(deletedResult.data ?? []).filter((item: { entity: string }) => item.entity === 'hr_shifts').map((item: { row_id: string }) => String(item.row_id))])];
  if (confirmedEmployees.length !== deletionQueue.confirmedEmployees.length || confirmedShifts.length !== deletionQueue.confirmedShifts.length) {
    await writeDeletes(userId, { ...deletionQueue, confirmedEmployees, confirmedShifts });
  }
  local.employees = local.employees.filter((item) => !deletedEmployees.has(item.id));
  const localEmployeeIds = new Set(local.employees.map((item) => item.id));
  local.shifts = local.shifts.filter((item) => !deletedShifts.has(item.id) && localEmployeeIds.has(item.employeeId));

  const remoteEmployees = (employeeResult.data as RemoteEmployee[]).map(employeeFromRemote).filter((item) => !deletedEmployees.has(item.id));
  const remoteShifts = (shiftResult.data as RemoteShift[]).map(shiftFromRemote)
    .filter((item) => !deletedShifts.has(item.id) && !deletedEmployees.has(item.employeeId));
  local.employees = await replayPendingHr('hr_employees', employeeColumns, userId, authorization,
    local.employees, remoteEmployees, item => item.id, employeeToRemote, employeeFromRemote, isKnownHrEmployee);
  local.shifts = await replayPendingHr('hr_shifts', shiftColumns, userId, authorization,
    local.shifts, remoteShifts, item => `${item.employeeId}:${item.workDate}`, shiftToRemote, shiftFromRemote,
    value => normalizeHrShift(value) !== null);

  // Missing list rows are not deletion evidence; the explicit ledger above is authoritative.
  const employees = latestById(local.employees, remoteEmployees)
    .sort((left, right) => left.name.localeCompare(right.name, 'ro-RO'));
  const employeeIds = new Set(employees.map((item) => item.id));
  const shifts = dedupeShiftsByEmployeeDay(latestById(local.shifts, remoteShifts))
    .filter((item) => employeeIds.has(item.employeeId));
  return saveCache(userId, { employees, shifts });
}

async function saveHrEmployeeUnlocked(
  userId: string,
  draft: Omit<HrEmployee, 'id' | 'createdAt' | 'updatedAt'> & { id?: string },
) {
  const data = await loadCache(userId);
  const previous = draft.id ? data.employees.find((item) => item.id === draft.id) : undefined;
  const now = new Date().toISOString();
  let employee: HrEmployee = {
    ...draft,
    id: draft.id ?? uuid(),
    name: draft.name.trim(),
    role: draft.role.trim(),
    locationName: draft.locationName.trim(),
    grossSalary: draft.grossSalary === null ? null : Math.max(0, draft.grossSalary),
    netSalary: draft.netSalary === null ? null : Math.max(0, draft.netSalary),
    createdAt: previous?.createdAt ?? now,
    updatedAt: now,
    syncState: canUseCloud(userId) ? 'pending' : 'local',
  };
  await saveCache(userId, { ...data, employees: [employee, ...data.employees.filter((item) => item.id !== employee.id)] });

  if (canUseCloud(userId) && supabase) {
    const authorization = await hrAuthorization(userId);
    if (!authorization) return employee;
    const { data: saved } = await supabase
      .from('hr_employees')
      .upsert(employeeToRemote(userId, employee), { onConflict: 'id' })
      .select(employeeColumns)
      .single().setHeader('Authorization', authorization);
    if (saved) employee = employeeFromRemote(saved as RemoteEmployee);
  }
  const current = await loadCache(userId);
  await saveCache(userId, { ...current, employees: [employee, ...current.employees.filter((item) => item.id !== employee.id)] });
  return employee;
}

async function saveHrShiftUnlocked(userId: string, draft: Omit<HrShift, 'id' | 'updatedAt'> & { id?: string }) {
  const data = await loadCache(userId);
  const existing = data.shifts.find((item) => item.id === draft.id || (
    item.employeeId === draft.employeeId && item.workDate === draft.workDate
  ));
  let shift: HrShift = {
    ...draft,
    id: existing?.id ?? draft.id ?? uuid(),
    notes: draft.notes.trim(),
    updatedAt: new Date().toISOString(),
    syncState: canUseCloud(userId) ? 'pending' : 'local',
  };
  await saveCache(userId, { ...data, shifts: upsertShiftForDay(data.shifts, shift) });

  if (canUseCloud(userId) && supabase) {
    const authorization = await hrAuthorization(userId);
    if (!authorization) return shift;
    let result = await supabase
      .from('hr_shifts')
      .upsert(shiftToRemote(userId, shift), { onConflict: existing ? 'id' : 'user_id,employee_id,work_date' })
      .select(shiftColumns)
      .single().setHeader('Authorization', authorization);
    if (result.error && existing) {
      result = await supabase
        .from('hr_shifts')
        .upsert(shiftToRemote(userId, shift), { onConflict: 'user_id,employee_id,work_date' })
        .select(shiftColumns)
        .single().setHeader('Authorization', authorization);
    }
    if (result.data) shift = shiftFromRemote(result.data as RemoteShift);
  }
  const current = await loadCache(userId);
  await saveCache(userId, { ...current, shifts: upsertShiftForDay(current.shifts, shift) });
  return shift;
}


type Deletes = { employees: string[]; shifts: string[]; confirmedEmployees: string[]; confirmedShifts: string[] };
const deletionKey = (userId: string) => `manager247.hr.deletions.v1.${userId}`;

async function readDeletes(userId: string): Promise<Deletes> {
  try {
    const raw = await AsyncStorage.getItem(deletionKey(userId));
    const value = raw === null ? {} : JSON.parse(raw);
    if (!value || typeof value !== 'object' || Array.isArray(value) || (raw !== null
      && ['employees', 'shifts', 'confirmedEmployees', 'confirmedShifts'].some(key =>
        value[key] !== undefined && (!Array.isArray(value[key]) || value[key].some((id: unknown) => typeof id !== 'string'))))) {
      throw new Error('Invalid deletion queue');
    }
    return {
      employees: Array.isArray(value.employees) ? value.employees : [],
      shifts: Array.isArray(value.shifts) ? value.shifts : [],
      confirmedEmployees: Array.isArray(value.confirmedEmployees) ? value.confirmedEmployees : [],
      confirmedShifts: Array.isArray(value.confirmedShifts) ? value.confirmedShifts : [],
    };
  } catch { throw new OperationalError('operational.sync.invalidLocal'); }
}

async function writeDeletes(userId: string, value: Deletes) {
  await AsyncStorage.setItem(deletionKey(userId), JSON.stringify(value));
}

async function flushDeletes(userId: string, capturedAuthorization?: string) {
  if (!canUseCloud(userId) || !supabase) return;
  const authorization = capturedAuthorization ?? await hrAuthorization(userId);
  if (!authorization) return;
  const queue = await readDeletes(userId);
  for (const kind of ['employees', 'shifts'] as const) {
    for (const id of [...queue[kind]]) {
      try {
        const result = await supabase.from(kind === 'employees' ? 'hr_employees' : 'hr_shifts').delete().eq('id', id).eq('user_id', userId).setHeader('Authorization', authorization);
        if (!result.error) {
          queue[kind] = queue[kind].filter((item) => item !== id);
          const confirmed = kind === 'employees' ? 'confirmedEmployees' : 'confirmedShifts';
          queue[confirmed] = [...new Set([...queue[confirmed], id])];
          await writeDeletes(userId, queue);
        }
      } catch { /* Retain durable delete intent for the next connection. */ }
    }
  }
}

async function readAllHrRows(table: string, columns: string, userId: string, authorization: string) {
  const result: Record<string, unknown>[] = [];
  if (!supabase) return { data: result, error: 'not-configured' };
  try {
    for (let offset = 0; ; offset += 500) {
      const page = await supabase.from(table).select(columns).eq('user_id', userId).order('id').range(offset, offset + 499).setHeader('Authorization', authorization);
      if (page.error) return { data: result, error: page.error };
      result.push(...((page.data ?? []) as unknown as Record<string, unknown>[]));
      if ((page.data?.length ?? 0) < 500) return { data: result, error: null };
    }
  } catch (error) { return { data: result, error }; }
}

async function removeHrEmployeeUnlocked(userId: string, employeeId: string) {
  const data = await loadCache(userId);
  const queue = await readDeletes(userId);
  queue.employees = [...new Set([...queue.employees, employeeId])];
  queue.shifts = [...new Set([...queue.shifts, ...data.shifts.filter((item) => item.employeeId === employeeId).map((item) => item.id)])];
  await writeDeletes(userId, queue);
  const saved = await saveCache(userId, { employees: data.employees.filter((item) => item.id !== employeeId), shifts: data.shifts.filter((item) => item.employeeId !== employeeId) });
  await flushDeletes(userId);
  return saved;
}

async function removeHrShiftUnlocked(userId: string, shiftId: string) {
  const queue = await readDeletes(userId);
  queue.shifts = [...new Set([...queue.shifts, shiftId])];
  await writeDeletes(userId, queue);
  const data = await loadCache(userId);
  const saved = await saveCache(userId, { ...data, shifts: data.shifts.filter((item) => item.id !== shiftId) });
  await flushDeletes(userId);
  return saved;
}

export const loadHrData = async (userId: string, options: HrLoadOptions = {}) => {
  const data = await withStorageLock(`hr:${userId}`, () => loadHrDataUnlocked(userId, options));
  const lifecycle = await loadHrLifecycle(userId);
  return { ...data, employees: applyHrLifecycle(data.employees, lifecycle) };
};
export const saveHrEmployee = (userId: string, draft: Parameters<typeof saveHrEmployeeUnlocked>[1]) => withStorageLock(`hr:${userId}`, () => saveHrEmployeeUnlocked(userId, draft));
export const saveHrShift = (userId: string, draft: Parameters<typeof saveHrShiftUnlocked>[1]) => withStorageLock(`hr:${userId}`, () => saveHrShiftUnlocked(userId, draft));
export const removeHrEmployee = (userId: string, id: string) => withStorageLock(`hr:${userId}`, () => removeHrEmployeeUnlocked(userId, id));
export const removeHrShift = (userId: string, id: string) => withStorageLock(`hr:${userId}`, () => removeHrShiftUnlocked(userId, id));
