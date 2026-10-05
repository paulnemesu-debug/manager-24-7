export type InspectionAuthority = 'DSVSA' | 'DSP' | 'ITM' | 'AUDIT';
export type InspectionCheck = { id: string; label: string; ok: boolean; route: string };
export function inspectionReadiness(authority: InspectionAuthority, input: {
  haccpDocuments: number; expiredDocuments: number; expiringDocuments: number; activeEmployees: number; attendanceRecorded: number;
  documentCount?: number; invalidDocuments?: number; pendingLifecycle?: number; haccpPending?: number;
}): InspectionCheck[] {
  const common: InspectionCheck[] = [{ id: 'docs', label: 'Documente înregistrate, cu date valide și în termen', ok: (input.documentCount ?? 0) > 0 && input.expiredDocuments === 0 && !input.invalidDocuments, route: '/tools/compliance-documents' }];
  if (authority === 'DSVSA' || authority === 'DSP' || authority === 'AUDIT') common.push({ id: 'haccp', label: 'Înregistrări HACCP și verificări conforme azi', ok: input.haccpDocuments > 0 && input.haccpPending === 0, route: '/tools/haccp' });
  if (authority === 'ITM' || authority === 'AUDIT') {
    common.push({ id: 'hr', label: 'Personal înregistrat și pontaj confirmat azi', ok: input.activeEmployees > 0 && input.attendanceRecorded >= input.activeEmployees, route: '/tools/hr?mode=schedule' });
    common.push({ id: 'lifecycle', label: 'Checklisturi de personal completate', ok: input.activeEmployees > 0 && input.pendingLifecycle === 0, route: '/tools/hr-lifecycle' });
  }
  if (authority === 'DSVSA') common.push({ id: 'expiry', label: 'Fără termene în următoarele 30 zile', ok: input.expiringDocuments === 0, route: '/tools/compliance-documents' });
  return common;
}
export const readinessScore = (checks: InspectionCheck[]) => checks.length ? Math.round(checks.filter((check) => check.ok).length / checks.length * 100) : 0;
