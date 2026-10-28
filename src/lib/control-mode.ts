import { translate, type Locale, type TranslationKey } from '@/i18n/translations';
export type InspectionAuthority = 'DSVSA' | 'DSP' | 'ITM' | 'AUDIT';
export type InspectionCheck = { id: string; label: string; ok: boolean; route: string };
export function inspectionReadiness(authority: InspectionAuthority, input: {
  haccpDocuments: number; expiredDocuments: number; expiringDocuments: number; activeEmployees: number; attendanceRecorded: number;
  documentCount?: number; invalidDocuments?: number; pendingLifecycle?: number; haccpPending?: number;
}, locale: Locale = 'ro'): InspectionCheck[] {
  const t = (key: TranslationKey, params?: Record<string, string | number>) => translate(locale, key, params);

  const common: InspectionCheck[] = [{ id: 'docs', label: t('operational.control.docs'), ok: (input.documentCount ?? 0) > 0 && input.expiredDocuments === 0 && !input.invalidDocuments, route: '/tools/compliance-documents' }];
  if (authority === 'DSVSA' || authority === 'DSP' || authority === 'AUDIT') common.push({ id: 'haccp', label: t('operational.control.haccp'), ok: input.haccpDocuments > 0 && input.haccpPending === 0, route: '/tools/haccp' });
  if (authority === 'ITM' || authority === 'AUDIT') {
    common.push({ id: 'hr', label: t('operational.control.hr'), ok: input.activeEmployees > 0 && input.attendanceRecorded >= input.activeEmployees, route: '/tools/hr?mode=schedule' });
    common.push({ id: 'lifecycle', label: t('operational.control.lifecycle'), ok: input.activeEmployees > 0 && input.pendingLifecycle === 0, route: '/tools/hr-lifecycle' });
  }
  if (authority === 'DSVSA') common.push({ id: 'expiry', label: t('operational.control.expiry'), ok: input.expiringDocuments === 0, route: '/tools/compliance-documents' });
  return common;
}
export const readinessScore = (checks: InspectionCheck[]) => checks.length ? Math.round(checks.filter((check) => check.ok).length / checks.length * 100) : 0;
