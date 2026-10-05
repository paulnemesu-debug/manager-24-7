import { beforeEach, describe, expect, it, vi } from 'vitest';
const fixtures = vi.hoisted(() => ({ hr: { employees: [], shifts: [] } as any, documents: [] as any[], lifecycle: [] as any[], haccp: [] as any[], equipment: [] as any[], operations: { orders: [], waste: [], schedules: [] } as any }));
vi.mock('@react-native-async-storage/async-storage', () => ({ default: { getItem: async () => null } }));
vi.mock('@/lib/supabase', () => ({ isDemoMode: false, isSupabaseConfigured: false, supabase: null }));
vi.mock('@/lib/hr-repository', () => ({ loadHrData: async () => fixtures.hr }));
vi.mock('@/lib/hr-lifecycle', async (original) => ({ ...await original<typeof import('./hr-lifecycle')>(), loadHrLifecycle: async () => fixtures.lifecycle }));
vi.mock('@/lib/haccp-repository', () => ({ syncHaccpDocuments: async () => ({ documents: fixtures.haccp, pending: 0 }) }));
vi.mock('@/lib/haccp-routine-repository', () => ({ listHaccpEquipment: async () => fixtures.equipment, loadHaccpProfile: async () => ({ defaultLocationId: null, defaultLocationName: 'Bucătărie' }) }));
vi.mock('@/lib/operational-documents', async (original) => ({ ...await original<typeof import('./operational-documents')>(), loadOperationalDocuments: async () => fixtures.documents }));
vi.mock('@/lib/operations-control-repository', () => ({ loadOperationsControlData: async () => fixtures.operations }));
vi.mock('@/lib/pnl-repository', () => ({ syncPnlReports: async () => [] }));
vi.mock('@/lib/price-alert-history', () => ({ loadPriceAlertHistory: async () => [] }));
import { dailyAttendance, loadDailyOperations } from './daily-operations';
import { inspectionReadiness, readinessScore } from './control-mode';
beforeEach(() => { fixtures.hr = { employees: [], shifts: [] }; fixtures.documents = []; fixtures.lifecycle = []; fixtures.haccp = []; fixtures.equipment = []; fixtures.operations = { orders: [], waste: [], schedules: [] }; });
describe('Daily Operations integration', () => {
  it('counts only confirmed attendance of active staff on the local date', () => {
    fixtures.hr = { employees: [{ id: 'a', active: true }, { id: 'b', active: true }, { id: 'left', active: false }], shifts: [
      { employeeId: 'a', workDate: '2026-10-04', status: 'scheduled' },
      { employeeId: 'b', workDate: '2026-10-04', status: 'present' },
      { employeeId: 'left', workDate: '2026-10-04', status: 'present' },
    ] };
    expect(dailyAttendance(fixtures.hr, '2026-10-04')).toEqual({ activeEmployees: 2, attendanceRecorded: 1, pendingAttendance: 1 });
  });
  it('does not count document modification timestamps as completed HACCP tasks', async () => {
    fixtures.haccp = [{ id: 'old', formCode: 'FO-H-04-01', rows: [], headerValues: { month: '09', year: '2026' }, updatedAt: '2026-10-04T12:00:00Z' }];
    const result = await loadDailyOperations('demo', [], 'ro', 'QA', new Date('2026-10-04T12:00:00'));
    expect(result.input.haccpToday).toBe(0);
    expect(result.input.haccpExpected).toBe(2);
    expect(result.signals.some((item) => item.id === 'pnl')).toBe(true);
  });
  it('combines inventory, orders, waste and expiry with routes to the right tabs', async () => {
    fixtures.operations = {
      schedules: [{ enabled: true, nextDueDate: '2026-10-03' }, { enabled: false, nextDueDate: '2026-10-01' }],
      orders: [{ orderDate: '2026-10-04', status: 'draft' }, { orderDate: '2026-10-03', status: 'received' }, { orderDate: '2026-10-06', status: 'sent' }],
      waste: [{ eventDate: '2026-10-04', value: 15 }, { eventDate: '2026-10-03', value: 30 }],
    };
    fixtures.documents = [{ expiryDate: '2026-10-03' }, { expiryDate: '2026-10-01', archived: true }, { expiryDate: 'invalid' }];
    const result = await loadDailyOperations('demo', [], 'ro', 'QA', new Date('2026-10-04T12:00:00'));
    expect(result.input).toMatchObject({ dueInventories: 1, pendingOrders: 1, todayWasteValue: 15, expiredDocuments: 1, invalidDocuments: 1 });
    expect(result.signals.find((item) => item.id === 'inventory')?.route).toBe('/tools/operations-control?mode=inventory');
    expect(result.signals.find((item) => item.id === 'orders')?.route).toBe('/tools/operations-control?mode=orders');
    expect(result.signals.find((item) => item.id === 'waste')?.route).toBe('/tools/operations-control?mode=waste');
  });
  it('never treats an empty account as fully inspection-ready', () => {
    const checks = inspectionReadiness('AUDIT', { haccpDocuments: 0, expiredDocuments: 0, expiringDocuments: 0, activeEmployees: 0, attendanceRecorded: 0, documentCount: 0, haccpPending: 0, pendingLifecycle: 0 });
    expect(readinessScore(checks)).toBe(0);
  });
});
