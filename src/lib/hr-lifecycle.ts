import { isIsoDate } from '@/lib/local-date-time';
import { createOperationalStore, type OperationalSync } from '@/lib/operational-sync';
import type { HrEmployee } from '@/types/hr';

export type HrLifecycle = OperationalSync & {
  employeeId: string; status: 'onboarding' | 'active' | 'offboarding' | 'left';
  hireDate: string; exitDate: string; documents: boolean; medical: boolean; training: boolean;
  equipmentIssued: boolean; accessGranted: boolean; equipmentReturned: boolean; keysReturned: boolean;
  accessRevoked: boolean; handover: boolean; finalDocuments: boolean; notes: string; updatedAt: string;
};
export const HR_LIFECYCLE_LABELS = { onboarding: 'Angajare', active: 'Activ', offboarding: 'Pregătire plecare', left: 'Plecat' };
export const HR_ONBOARDING_CHECKS = [
  { key: 'documents', label: 'Documentele de angajare verificate' },
  { key: 'medical', label: 'Fișa de aptitudine verificată' },
  { key: 'training', label: 'Instruirea pentru rol, igienă și siguranță efectuată' },
  { key: 'equipmentIssued', label: 'Echipamentul și cheile predate angajatului' },
  { key: 'accessGranted', label: 'Accesul necesar rolului configurat' },
] as const;
export const HR_OFFBOARDING_CHECKS = [
  { key: 'handover', label: 'Responsabilitățile și documentele predate' },
  { key: 'equipmentReturned', label: 'Echipamentul returnat' },
  { key: 'keysReturned', label: 'Cheile și cardurile returnate' },
  { key: 'accessRevoked', label: 'Accesul în aplicații revocat' },
  { key: 'finalDocuments', label: 'Documentele de plecare verificate' },
] as const;
export function defaultHrLifecycle(employee: Pick<HrEmployee, 'id' | 'active'>): HrLifecycle {
  return { employeeId: employee.id, status: employee.active ? 'active' : 'left', hireDate: '', exitDate: '',
    documents: false, medical: false, training: false, equipmentIssued: false, accessGranted: false,
    equipmentReturned: false, keysReturned: false, accessRevoked: false, handover: false, finalDocuments: false, notes: '', updatedAt: '' };
}
export function hrLifecycleProgress(item: HrLifecycle) {
  const checks = item.status === 'offboarding' || item.status === 'left' ? HR_OFFBOARDING_CHECKS : HR_ONBOARDING_CHECKS;
  return { completed: checks.filter((check) => item[check.key]).length, total: checks.length };
}
export function validateHrLifecycle(item: HrLifecycle) {
  if (!Object.hasOwn(HR_LIFECYCLE_LABELS, item.status)) throw new Error('Stare HR invalidă.');
  if ((item.hireDate && !isIsoDate(item.hireDate)) || (item.exitDate && !isIsoDate(item.exitDate))) throw new Error('Introdu date calendaristice valide (AAAA-LL-ZZ).');
  if (item.hireDate && item.exitDate && item.exitDate < item.hireDate) throw new Error('Plecarea nu poate preceda angajarea.');
  if (item.notes.length > 4000) throw new Error('Observațiile pot avea maximum 4000 de caractere.');
  if (item.status === 'left' && !item.exitDate) throw new Error('Completează data plecării.');
}
const store = createOperationalStore<HrLifecycle>({
  key: (userId) => `manager247.hr-lifecycle.v1.${userId}`, table: 'hr_lifecycle', id: (item) => item.employeeId,
  normalize(value) {
    if (!value || typeof value !== 'object') return null;
    const item = value as HrLifecycle;
    if (typeof item.employeeId !== 'string' || !Object.hasOwn(HR_LIFECYCLE_LABELS, item.status)) return null;
    const result = { ...defaultHrLifecycle({ id: item.employeeId, active: true }), ...item };
    for (const check of [...HR_ONBOARDING_CHECKS, ...HR_OFFBOARDING_CHECKS]) result[check.key] = item[check.key] === true;
    return result;
  },
});
export const loadHrLifecycle = store.load;
export const loadCachedHrLifecycle = store.cached;
export const resolveHrLifecycle = store.resolve;
export const saveHrLifecycle = (userId: string, item: HrLifecycle) => {
  validateHrLifecycle(item);
  return store.save(userId, item);
};
export function applyHrLifecycle(employees: HrEmployee[], items: HrLifecycle[]) {
  const byId = new Map(items.map((item) => [item.employeeId, item]));
  return employees.map((employee) => {
    const lifecycle = byId.get(employee.id);
    return lifecycle ? { ...employee, active: lifecycle.status !== 'left' } : employee;
  });
}
