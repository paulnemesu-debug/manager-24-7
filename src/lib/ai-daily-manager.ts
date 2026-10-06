import { translate, type Locale, type TranslationKey } from '@/i18n/translations';
export type DailySignal = { id: string; severity: 'critical' | 'warning' | 'info'; title: string; detail: string; action: string; route: string };
export type DailyManagerInput = {
  foodCostHealth: number | null; priceAlerts: number; activeEmployees: number; pendingAttendance: number;
  haccpToday: number; haccpExpected: number; expiringDocuments: number; expiredDocuments: number; pnlComplete: boolean;
  invalidDocuments?: number; pendingLifecycle?: number; dueInventories?: number; pendingOrders?: number; todayWasteValue?: number;
};
export function buildDailyManager(input: DailyManagerInput, locale: Locale = 'ro'): DailySignal[] {
  const t = (key: TranslationKey, params?: Record<string, string | number>) => translate(locale, key, params);

  const out: DailySignal[] = [];
  if (input.foodCostHealth !== null && input.foodCostHealth < 80) out.push({ id: 'food-cost', severity: input.foodCostHealth < 60 ? 'critical' : 'warning', title: `Food Cost Health ${input.foodCostHealth}/100`, detail: t('operational.daily.foodCostDetail'), action: t('operational.daily.actions'), route: '/tools/priorities' });
  if (input.priceAlerts) out.push({ id: 'prices', severity: 'warning', title: t('operational.daily.priceCount', { count: input.priceAlerts }), detail: t('operational.daily.pricesDetail'), action: t('operational.daily.review'), route: '/tools/alerts' });
  if (input.haccpExpected > 0 && input.haccpToday < input.haccpExpected) out.push({ id: 'haccp', severity: 'critical', title: `HACCP ${input.haccpToday}/${input.haccpExpected}`, detail: t('operational.daily.haccpDetail'), action: t('operational.daily.complete'), route: '/tools/haccp' });
  if (input.pendingAttendance) out.push({ id: 'hr', severity: 'warning', title: t('operational.daily.attendanceCount', { count: input.pendingAttendance }), detail: t('operational.daily.attendanceDetail'), action: t('operational.daily.openAttendance'), route: '/tools/hr?mode=schedule' });
  if (input.expiredDocuments || input.expiringDocuments || input.invalidDocuments) out.push({ id: 'docs', severity: input.expiredDocuments || input.invalidDocuments ? 'critical' : 'warning', title: input.invalidDocuments ? t('operational.daily.invalidCount', { count: input.invalidDocuments }) : input.expiredDocuments ? t('operational.daily.expiredCount', { count: input.expiredDocuments }) : t('operational.daily.expiringCount', { count: input.expiringDocuments }), detail: t('operational.daily.docsDetail'), action: t('operational.daily.documents'), route: '/tools/compliance-documents' });
  if (input.pendingLifecycle) out.push({ id: 'lifecycle', severity: 'warning', title: t('operational.daily.lifecycleCount', { count: input.pendingLifecycle }), detail: t('operational.daily.lifecycleDetail'), action: t('operational.daily.checklists'), route: '/tools/hr-lifecycle' });
  if (input.dueInventories) out.push({ id: 'inventory', severity: 'warning', title: t('operational.daily.inventoryCount', { count: input.dueInventories }), detail: t('operational.daily.inventoryDetail'), action: t('operational.daily.inventory'), route: '/tools/operations-control?mode=inventory' });
  if (input.pendingOrders) out.push({ id: 'orders', severity: 'warning', title: t('operational.daily.ordersCount', { count: input.pendingOrders }), detail: t('operational.daily.ordersDetail'), action: t('operational.daily.orders'), route: '/tools/operations-control?mode=orders' });
  if ((input.todayWasteValue ?? 0) > 0) out.push({ id: 'waste', severity: 'info', title: t('operational.daily.wasteValue', { value: input.todayWasteValue!.toFixed(2) }), detail: t('operational.daily.wasteDetail'), action: t('operational.daily.waste'), route: '/tools/operations-control?mode=waste' });
  if (!input.pnlComplete) out.push({ id: 'pnl', severity: 'info', title: t('operational.daily.pnl'), detail: t('operational.daily.pnlDetail'), action: t('operational.daily.completePnl'), route: '/tools/pnl' });
  const rank = { critical: 0, warning: 1, info: 2 } as const;
  return out.sort((a, b) => rank[a.severity] - rank[b.severity]);
}
export const dailyScore = (signals: DailySignal[]) => Math.max(0, 100 - signals.reduce((sum, item) => sum + (item.severity === 'critical' ? 18 : item.severity === 'warning' ? 9 : 4), 0));
