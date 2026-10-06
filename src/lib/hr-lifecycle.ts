import { translate, type Locale, type TranslationKey } from '@/i18n/translations';
import { isIsoDate } from '@/lib/local-date-time';
import { createOperationalStore, type OperationalSync } from '@/lib/operational-sync';
import type { HrEmployee } from '@/types/hr';

export type HrLifecycle = OperationalSync & {
  employeeId: string; status: 'onboarding' | 'active' | 'offboarding' | 'left';
  hireDate: string; exitDate: string; documents: boolean; medical: boolean; training: boolean;
  equipmentIssued: boolean; accessGranted: boolean; equipmentReturned: boolean; keysReturned: boolean;
  accessRevoked: boolean; handover: boolean; finalDocuments: boolean; notes: string; updatedAt: string;
};
export function getHrLifecycleLabels(locale: Locale = 'ro') {
  const t = (key: TranslationKey, params?: Record<string, string | number>) => translate(locale, key, params);
  return { onboarding: t('operational.lifecycle.onboarding'), active: t('operational.lifecycle.active'), offboarding: t('operational.lifecycle.offboarding'), left: t('operational.lifecycle.left') };
}
export const HR_LIFECYCLE_LABELS = getHrLifecycleLabels();
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
export function getHrLifecycleChecks(status: HrLifecycle['status'], locale: Locale = 'ro') {
  const checks = status === 'offboarding' || status === 'left' ? HR_OFFBOARDING_CHECKS : HR_ONBOARDING_CHECKS;
  return checks.map((check) => ({ ...check, label: translate(locale, `operational.lifecycle.${check.key}`) }));
}

export function defaultHrLifecycle(employee: Pick<HrEmployee, 'id' | 'active'>): HrLifecycle {
  return { employeeId: employee.id, status: employee.active ? 'active' : 'left', hireDate: '', exitDate: '',
    documents: false, medical: false, training: false, equipmentIssued: false, accessGranted: false,
    equipmentReturned: false, keysReturned: false, accessRevoked: false, handover: false, finalDocuments: false, notes: '', updatedAt: '' };
}
export function hrLifecycleProgress(item: HrLifecycle) {
  const checks = item.status === 'offboarding' || item.status === 'left' ? HR_OFFBOARDING_CHECKS : HR_ONBOARDING_CHECKS;
  return { completed: checks.filter((check) => item[check.key]).length, total: checks.length };
}
export function validateHrLifecycle(item: HrLifecycle, locale: Locale = 'ro') {
  const t = (key: TranslationKey, params?: Record<string, string | number>) => translate(locale, key, params);

  if (!Object.hasOwn(HR_LIFECYCLE_LABELS, item.status)) throw new Error(t('operational.lifecycle.invalidStatus'));
  if ((item.hireDate && !isIsoDate(item.hireDate)) || (item.exitDate && !isIsoDate(item.exitDate))) throw new Error(t('operational.lifecycle.dateValidation'));
  if (item.hireDate && item.exitDate && item.exitDate < item.hireDate) throw new Error(t('operational.lifecycle.dateOrder'));
  if (item.notes.length > 4000) throw new Error(t('operational.lifecycle.length'));
  if (item.status === 'left' && !item.exitDate) throw new Error(t('operational.lifecycle.requiredExit'));
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
export const saveHrLifecycle = (userId: string, item: HrLifecycle, locale: Locale = 'ro') => {
  validateHrLifecycle(item, locale);
  return store.save(userId, item);
};
export function applyHrLifecycle(employees: HrEmployee[], items: HrLifecycle[]) {
  const byId = new Map(items.map((item) => [item.employeeId, item]));
  return employees.map((employee) => {
    const lifecycle = byId.get(employee.id);
    return lifecycle ? { ...employee, active: lifecycle.status !== 'left' } : employee;
  });
}
