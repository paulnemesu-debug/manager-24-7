import type { HrAttendanceStatus, HrEmployee, HrShift } from '@/types/hr';

type UnknownRecord = Record<string, unknown>;

function record(value: unknown): UnknownRecord {
  return value && typeof value === 'object' ? value as UnknownRecord : {};
}

function text(value: unknown, fallback = '') {
  return typeof value === 'string' ? value.trim() : fallback;
}

function nullableAmount(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : null;
}

function iso(value: unknown, fallback: string) {
  if (typeof value !== 'string' || !value.trim()) return fallback;
  return Number.isNaN(Date.parse(value)) ? fallback : value;
}

const attendanceStatuses: readonly HrAttendanceStatus[] = ['scheduled', 'present', 'absent', 'leave', 'day_off'];

/** Păstrează fișele locale v1.4.4, dar migrează schema tarif-orar la salarii lunare. */
export function normalizeHrEmployee(value: unknown, fallbackTimestamp = new Date().toISOString()): HrEmployee | null {
  const source = record(value);
  const id = text(source.id);
  const name = text(source.name);
  if (!id || !name) return null;
  return {
    id,
    name,
    role: text(source.role),
    locationId: text(source.locationId ?? source.location_id) || null,
    locationName: text(source.locationName ?? source.location_name),
    grossSalary: nullableAmount(source.grossSalary ?? source.gross_salary),
    netSalary: nullableAmount(source.netSalary ?? source.net_salary),
    active: source.active !== false,
    createdAt: iso(source.createdAt ?? source.created_at, fallbackTimestamp),
    updatedAt: iso(source.updatedAt ?? source.updated_at, fallbackTimestamp),
    ...(['local', 'pending', 'synced'].includes(String(source.syncState)) ? { syncState: source.syncState as 'local' | 'pending' | 'synced' } : {}),
  };
}

export function normalizeHrShift(value: unknown, fallbackTimestamp = new Date().toISOString()): HrShift | null {
  const source = record(value);
  const id = text(source.id);
  const employeeId = text(source.employeeId ?? source.employee_id);
  const workDate = text(source.workDate ?? source.work_date);
  if (!id || !employeeId || !/^\d{4}-\d{2}-\d{2}$/.test(workDate)) return null;
  const rawStatus = text(source.status) as HrAttendanceStatus;
  return {
    id,
    employeeId,
    workDate,
    plannedStart: text(source.plannedStart ?? source.planned_start, '08:00').slice(0, 5),
    plannedEnd: text(source.plannedEnd ?? source.planned_end, '16:00').slice(0, 5),
    actualStart: text(source.actualStart ?? source.actual_start).slice(0, 5),
    actualEnd: text(source.actualEnd ?? source.actual_end).slice(0, 5),
    status: attendanceStatuses.includes(rawStatus) ? rawStatus : 'scheduled',
    notes: text(source.notes),
    updatedAt: iso(source.updatedAt ?? source.updated_at, fallbackTimestamp),
    ...(['local', 'pending', 'synced'].includes(String(source.syncState)) ? { syncState: source.syncState as 'local' | 'pending' | 'synced' } : {}),
  };
}

export function upsertShiftForDay(shifts: readonly HrShift[], shift: HrShift) {
  return [
    shift,
    ...shifts.filter((item) => item.id !== shift.id && (
      item.employeeId !== shift.employeeId || item.workDate !== shift.workDate
    )),
  ];
}

export function dedupeShiftsByEmployeeDay(shifts: readonly HrShift[]) {
  const byDay = new Map<string, HrShift>();
  for (const shift of shifts) {
    const key = `${shift.employeeId}:${shift.workDate}`;
    const current = byDay.get(key);
    if (!current || shift.updatedAt > current.updatedAt) byDay.set(key, shift);
  }
  return [...byDay.values()].sort((left, right) => (
    right.workDate.localeCompare(left.workDate) || right.updatedAt.localeCompare(left.updatedAt)
  ));
}

export function totalMonthlyGrossSalary(employees: readonly HrEmployee[]) {
  return Math.round(employees
    .filter((employee) => employee.active)
    .reduce((sum, employee) => sum + (employee.grossSalary ?? 0), 0) * 100) / 100;
}

