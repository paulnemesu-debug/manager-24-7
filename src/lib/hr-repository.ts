import AsyncStorage from '@react-native-async-storage/async-storage';

import { dedupeShiftsByEmployeeDay, normalizeHrEmployee, normalizeHrShift, upsertShiftForDay } from '@/lib/hr';
import { withStorageLock } from '@/lib/storage-lock';
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

async function loadCache(userId: string): Promise<HrData> {
  const raw = await AsyncStorage.getItem(keyFor(userId));
  if (!raw) return emptyData();
  try {
    const normalized = normalizeData(JSON.parse(raw));
    const deleted = await readDeletes(userId);
    normalized.employees = normalized.employees.filter((item) => !deleted.employees.includes(item.id));
    const employees = new Set(normalized.employees.map((item) => item.id));
    normalized.shifts = normalized.shifts.filter((item) => !deleted.shifts.includes(item.id) && employees.has(item.employeeId));
    return normalized;
  } catch {
    return emptyData();
  }
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
    updated_at: employee.updatedAt,
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
    updated_at: shift.updatedAt,
  };
}

function latestById<T extends { id: string; updatedAt: string }>(local: readonly T[], remote: readonly T[]) {
  const merged = new Map(remote.map((item) => [item.id, item]));
  for (const item of local) {
    const other = merged.get(item.id);
    if (!other || item.updatedAt > other.updatedAt) merged.set(item.id, item);
  }
  return [...merged.values()];
}

async function loadHrDataUnlocked(userId: string): Promise<HrData> {
  const local = await loadCache(userId);
  if (!canUseCloud(userId) || !supabase) return local;

  await flushDeletes(userId);
  const [employeeResult, shiftResult, deletedResult] = await Promise.all([
    readAllHrRows('hr_employees', employeeColumns, userId),
    readAllHrRows('hr_shifts', shiftColumns, userId),
    supabase.rpc('list_hr_deletions'),
  ]);
  if (employeeResult.error || shiftResult.error || deletedResult.error) return local;
  const deletedEmployees = new Set<string>();
  const deletedShifts = new Set<string>();
  for (const item of deletedResult.data ?? []) {
    (item.entity === 'hr_employees' ? deletedEmployees : deletedShifts).add(String(item.row_id));
  }
  local.employees = local.employees.filter((item) => !deletedEmployees.has(item.id));
  const localEmployeeIds = new Set(local.employees.map((item) => item.id));
  local.shifts = local.shifts.filter((item) => !deletedShifts.has(item.id) && localEmployeeIds.has(item.employeeId));

  let remoteEmployees = (employeeResult.data as RemoteEmployee[]).map(employeeFromRemote);
  let remoteShifts = (shiftResult.data as RemoteShift[]).map(shiftFromRemote);
  const remoteEmployeeById = new Map(remoteEmployees.map((item) => [item.id, item]));

  const employeesToUpload = local.employees.filter((item) => {
    const remote = remoteEmployeeById.get(item.id);
    return item.syncState !== 'synced' && (!remote || item.updatedAt > remote.updatedAt);
  });
  if (employeesToUpload.length) {
    const { data } = await supabase
      .from('hr_employees')
      .upsert(employeesToUpload.map((item) => employeeToRemote(userId, item)), { onConflict: 'id' })
      .select(employeeColumns);
    if (data) {
      const saved = (data as RemoteEmployee[]).map(employeeFromRemote);
      const byId = new Map(saved.map((item) => [item.id, item]));
      local.employees = local.employees.map((item) => byId.get(item.id) ?? item);
      remoteEmployees = latestById(remoteEmployees, saved);
    }
  }

  const remoteShiftByDay = new Map(remoteShifts.map((item) => [`${item.employeeId}:${item.workDate}`, item]));
  const remoteShiftById = new Map(remoteShifts.map((item) => [item.id, item]));
  const shiftsToUpload = local.shifts
    .map((item) => {
      const remote = remoteShiftByDay.get(`${item.employeeId}:${item.workDate}`);
      return remote && remote.id !== item.id ? { ...item, id: remote.id } : item;
    })
    .filter((item) => {
      const remote = remoteShiftByDay.get(`${item.employeeId}:${item.workDate}`);
      return item.syncState !== 'synced' && (!remote || item.updatedAt > remote.updatedAt);
    });
  if (shiftsToUpload.length) {
    const savedShifts: HrShift[] = [];
    for (const item of shiftsToUpload) {
      const payload = shiftToRemote(userId, item);
      const result = remoteShiftById.has(item.id)
        ? await supabase.from('hr_shifts').update(payload).eq('id', item.id).eq('user_id', userId).select(shiftColumns).single()
        : await supabase.from('hr_shifts').upsert(payload, { onConflict: 'user_id,employee_id,work_date' }).select(shiftColumns).single();
      if (result.data) savedShifts.push(shiftFromRemote(result.data as RemoteShift));
    }
    const byDay = new Map(savedShifts.map((item) => [`${item.employeeId}:${item.workDate}`, item]));
    local.shifts = local.shifts.map((item) => byDay.get(`${item.employeeId}:${item.workDate}`) ?? item);
    remoteShifts = dedupeShiftsByEmployeeDay(latestById(remoteShifts, savedShifts));
  }

  const retainedEmployees = local.employees.filter((item) => item.syncState !== 'synced' || remoteEmployees.some((remote) => remote.id === item.id));
  const retainedShifts = local.shifts.filter((item) => item.syncState !== 'synced' || remoteShifts.some((remote) => remote.id === item.id));
  const employees = latestById(retainedEmployees, remoteEmployees)
    .sort((left, right) => left.name.localeCompare(right.name, 'ro-RO'));
  const employeeIds = new Set(employees.map((item) => item.id));
  const shifts = dedupeShiftsByEmployeeDay(latestById(retainedShifts, remoteShifts))
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
    const { data: saved } = await supabase
      .from('hr_employees')
      .upsert(employeeToRemote(userId, employee), { onConflict: 'id' })
      .select(employeeColumns)
      .single();
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
    let result = await supabase
      .from('hr_shifts')
      .upsert(shiftToRemote(userId, shift), { onConflict: existing ? 'id' : 'user_id,employee_id,work_date' })
      .select(shiftColumns)
      .single();
    if (result.error && existing) {
      result = await supabase
        .from('hr_shifts')
        .upsert(shiftToRemote(userId, shift), { onConflict: 'user_id,employee_id,work_date' })
        .select(shiftColumns)
        .single();
    }
    if (result.data) shift = shiftFromRemote(result.data as RemoteShift);
  }
  const current = await loadCache(userId);
  await saveCache(userId, { ...current, shifts: upsertShiftForDay(current.shifts, shift) });
  return shift;
}


type Deletes = { employees: string[]; shifts: string[] };
const deletionKey = (userId: string) => `manager247.hr.deletions.v1.${userId}`;

async function readDeletes(userId: string): Promise<Deletes> {
  try {
    const raw = await AsyncStorage.getItem(deletionKey(userId));
    const value = raw ? JSON.parse(raw) : {};
    return { employees: Array.isArray(value.employees) ? value.employees : [], shifts: Array.isArray(value.shifts) ? value.shifts : [] };
  } catch { return { employees: [], shifts: [] }; }
}

async function writeDeletes(userId: string, value: Deletes) {
  await AsyncStorage.setItem(deletionKey(userId), JSON.stringify(value));
}

async function flushDeletes(userId: string) {
  if (!canUseCloud(userId) || !supabase) return;
  const queue = await readDeletes(userId);
  for (const kind of ['employees', 'shifts'] as const) {
    for (const id of [...queue[kind]]) {
      try {
        const result = await supabase.from(kind === 'employees' ? 'hr_employees' : 'hr_shifts').delete().eq('id', id).eq('user_id', userId);
        if (!result.error) { queue[kind] = queue[kind].filter((item) => item !== id); await writeDeletes(userId, queue); }
      } catch { /* Retain durable delete intent for the next connection. */ }
    }
  }
}

async function readAllHrRows(table: string, columns: string, userId: string) {
  const result: Record<string, unknown>[] = [];
  if (!supabase) return { data: result, error: 'not-configured' };
  try {
    for (let offset = 0; ; offset += 500) {
      const page = await supabase.from(table).select(columns).eq('user_id', userId).order('id').range(offset, offset + 499);
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

export const loadHrData = async (userId: string) => {
  const data = await withStorageLock(`hr:${userId}`, () => loadHrDataUnlocked(userId));
  const lifecycle = await loadHrLifecycle(userId);
  return { ...data, employees: applyHrLifecycle(data.employees, lifecycle) };
};
export const saveHrEmployee = (userId: string, draft: Parameters<typeof saveHrEmployeeUnlocked>[1]) => withStorageLock(`hr:${userId}`, () => saveHrEmployeeUnlocked(userId, draft));
export const saveHrShift = (userId: string, draft: Parameters<typeof saveHrShiftUnlocked>[1]) => withStorageLock(`hr:${userId}`, () => saveHrShiftUnlocked(userId, draft));
export const removeHrEmployee = (userId: string, id: string) => withStorageLock(`hr:${userId}`, () => removeHrEmployeeUnlocked(userId, id));
export const removeHrShift = (userId: string, id: string) => withStorageLock(`hr:${userId}`, () => removeHrShiftUnlocked(userId, id));
