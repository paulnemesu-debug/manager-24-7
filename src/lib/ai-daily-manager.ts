export type DailySignal = { id: string; severity: 'critical' | 'warning' | 'info'; title: string; detail: string; action: string; route: string };
export type DailyManagerInput = {
  foodCostHealth: number | null; priceAlerts: number; activeEmployees: number; pendingAttendance: number;
  haccpToday: number; haccpExpected: number; expiringDocuments: number; expiredDocuments: number; pnlComplete: boolean;
  invalidDocuments?: number; pendingLifecycle?: number; dueInventories?: number; pendingOrders?: number; todayWasteValue?: number;
};
export function buildDailyManager(input: DailyManagerInput): DailySignal[] {
  const out: DailySignal[] = [];
  if (input.foodCostHealth !== null && input.foodCostHealth < 80) out.push({ id: 'food-cost', severity: input.foodCostHealth < 60 ? 'critical' : 'warning', title: `Food Cost Health ${input.foodCostHealth}/100`, detail: 'Marja sau costurile unor rețete necesită verificare.', action: 'Vezi acțiunile', route: '/tools/priorities' });
  if (input.priceAlerts) out.push({ id: 'prices', severity: 'warning', title: `${input.priceAlerts} alerte de preț`, detail: 'Verifică impactul scumpirilor în rețete și marjă.', action: 'Analizează', route: '/tools/alerts' });
  if (input.haccpExpected > 0 && input.haccpToday < input.haccpExpected) out.push({ id: 'haccp', severity: 'critical', title: `HACCP ${input.haccpToday}/${input.haccpExpected}`, detail: 'Există verificări zilnice nefinalizate sau neconforme.', action: 'Completează', route: '/tools/haccp' });
  if (input.pendingAttendance) out.push({ id: 'hr', severity: 'warning', title: `${input.pendingAttendance} angajați fără pontaj confirmat azi`, detail: 'Programarea turei nu confirmă prezența.', action: 'Deschide pontajul', route: '/tools/hr?mode=schedule' });
  if (input.expiredDocuments || input.expiringDocuments || input.invalidDocuments) out.push({ id: 'docs', severity: input.expiredDocuments || input.invalidDocuments ? 'critical' : 'warning', title: input.invalidDocuments ? `${input.invalidDocuments} documente cu date invalide` : input.expiredDocuments ? `${input.expiredDocuments} documente expirate` : `${input.expiringDocuments} documente expiră curând`, detail: 'Actualizează dosarul de conformitate.', action: 'Documente', route: '/tools/compliance-documents' });
  if (input.pendingLifecycle) out.push({ id: 'lifecycle', severity: 'warning', title: `${input.pendingLifecycle} checklisturi HR incomplete`, detail: 'Verifică documentele, instruirea și predarea accesului la angajare sau plecare.', action: 'Checklisturi HR', route: '/tools/hr-lifecycle' });
  if (input.dueInventories) out.push({ id: 'inventory', severity: 'warning', title: `${input.dueInventories} inventare scadente`, detail: 'Înregistrează stocurile și reprogramează următoarea verificare.', action: 'Inventar', route: '/tools/operations-control?mode=inventory' });
  if (input.pendingOrders) out.push({ id: 'orders', severity: 'warning', title: `${input.pendingOrders} comenzi deschise`, detail: 'Comenzi datate până azi, care nu au fost recepționate sau anulate.', action: 'Comenzi', route: '/tools/operations-control?mode=orders' });
  if ((input.todayWasteValue ?? 0) > 0) out.push({ id: 'waste', severity: 'info', title: `Risipă azi: ${input.todayWasteValue!.toFixed(2)} lei`, detail: 'Verifică motivele și efectul pierderilor asupra costurilor.', action: 'Registru risipă', route: '/tools/operations-control?mode=waste' });
  if (!input.pnlComplete) out.push({ id: 'pnl', severity: 'info', title: 'P&L incomplet', detail: 'Completează perioada curentă pentru o imagine financiară corectă.', action: 'Completează P&L', route: '/tools/pnl' });
  const rank = { critical: 0, warning: 1, info: 2 } as const;
  return out.sort((a, b) => rank[a.severity] - rank[b.severity]);
}
export const dailyScore = (signals: DailySignal[]) => Math.max(0, 100 - signals.reduce((sum, item) => sum + (item.severity === 'critical' ? 18 : item.severity === 'warning' ? 9 : 4), 0));
