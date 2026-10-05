import type { Locale } from '@/i18n/translations';
import { buildDailyManager, dailyScore } from '@/lib/ai-daily-manager';
import { loadHrData } from '@/lib/hr-repository';
import { defaultHrLifecycle, hrLifecycleProgress, loadHrLifecycle } from '@/lib/hr-lifecycle';
import { syncHaccpDocuments } from '@/lib/haccp-repository';
import { listHaccpEquipment, loadHaccpProfile } from '@/lib/haccp-routine-repository';
import { buildHaccpTodayTasks } from '@/lib/haccp-today';
import { localIsoDate } from '@/lib/local-date-time';
import { loadOperationalDocuments, documentExpiryStatus } from '@/lib/operational-documents';
import { loadOperationsControlData } from '@/lib/operations-control-repository';
import { calculatePnl, currentPnlPeriod } from '@/lib/pnl';
import { syncPnlReports } from '@/lib/pnl-repository';
import { loadPriceAlertHistory } from '@/lib/price-alert-history';
import { calculateProfitHealth } from '@/lib/profit-center';
import type { HrData } from '@/types/hr';
import type { Recipe } from '@/types/recipe';

export function dailyAttendance(hr: HrData, today: string) {
  const employees = hr.employees.filter((employee) => employee.active);
  const ids = new Set(employees.map((employee) => employee.id));
  const recorded = new Set(hr.shifts.filter((shift) => shift.workDate === today && ids.has(shift.employeeId) && shift.status !== 'scheduled').map((shift) => shift.employeeId)).size;
  return { activeEmployees: employees.length, attendanceRecorded: recorded, pendingAttendance: Math.max(0, employees.length - recorded) };
}
export async function loadDailyOperations(userId: string, recipes: Recipe[], locale: Locale = 'ro', identity = 'Operator', now = new Date()) {
  const [hr, haccp, equipment, profile, docs, operations, reports, alerts] = await Promise.all([
    loadHrData(userId), syncHaccpDocuments(userId), listHaccpEquipment(userId), loadHaccpProfile(userId, identity),
    loadOperationalDocuments(userId), loadOperationsControlData(userId), syncPnlReports(userId), loadPriceAlertHistory(userId),
  ]);
  const lifecycle = await loadHrLifecycle(userId);
  const today = localIsoDate(now);
  const tasks = buildHaccpTodayTasks(haccp.documents, equipment, locale, now, profile).filter((task) => task.required);
  const documents = docs.filter((doc) => !doc.archived);
  const expiry = documents.map((doc) => documentExpiryStatus(doc.expiryDate, now));
  const currentPnl = reports.find((report) => report.period === currentPnlPeriod(now));
  const pendingLifecycle = hr.employees.filter((employee) => {
    const item = lifecycle.find((entry) => entry.employeeId === employee.id) ?? defaultHrLifecycle(employee);
    const progress = hrLifecycleProgress(item);
    return progress.completed < progress.total;
  }).length;
  const input = {
    foodCostHealth: calculateProfitHealth(recipes.filter((recipe) => !recipe.isSubRecipe)), priceAlerts: alerts.length,
    ...dailyAttendance(hr, today), haccpToday: tasks.filter((task) => task.status === 'conform').length, haccpExpected: tasks.length,
    expiredDocuments: expiry.filter((status) => status.days !== null && status.days < 0).length,
    expiringDocuments: expiry.filter((status) => status.days !== null && status.days >= 0 && status.days <= 30).length,
    invalidDocuments: expiry.filter((status) => status.days === null && status.tone === 'danger').length,
    pendingLifecycle, pnlComplete: Boolean(currentPnl && calculatePnl(currentPnl).healthStatus !== 'incomplete'),
    dueInventories: operations.schedules.filter((item) => item.enabled && item.nextDueDate <= today).length,
    pendingOrders: operations.orders.filter((item) => item.orderDate <= today && !['received', 'cancelled'].includes(item.status)).length,
    todayWasteValue: operations.waste.filter((item) => item.eventDate === today).reduce((sum, item) => sum + item.value, 0),
  };
  const signals = buildDailyManager(input);
  const pendingSync = [...docs, ...lifecycle].filter((item) => item.syncState === 'pending' || item.syncState === 'conflict').length;
  return { input, signals, score: dailyScore(signals), pendingSync: pendingSync + haccp.pending, documentCount: documents.length, haccpDocuments: haccp.documents.filter((doc) => doc.rows.length > 0).length, updatedAt: now.toISOString() };
}
export type DailyOperations = Awaited<ReturnType<typeof loadDailyOperations>>;
