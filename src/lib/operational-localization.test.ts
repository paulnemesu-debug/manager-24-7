import { describe, expect, it, vi } from 'vitest';

vi.mock('@react-native-async-storage/async-storage', () => ({ default: { getItem: async () => null, setItem: async () => undefined } }));
vi.mock('@/lib/supabase', () => ({ isDemoMode: true, isSupabaseConfigured: false, supabase: null }));

import { buildDailyManager, dailyScore } from './ai-daily-manager';
import { inspectionReadiness, readinessScore } from './control-mode';
import { documentExpiryStatus, saveOperationalDocument } from './operational-documents';
import { defaultHrLifecycle, validateHrLifecycle } from './hr-lifecycle';
import { operationalSyncLabel } from './operational-sync';
import { parseEfacturaXml } from './efactura';

describe('operational module language', () => {
  it('renders e-Factura validation in the selected language while retaining invoice data', () => {
    const xml = '<Invoice><ID>INV-1</ID><InvoiceLine><ID>1</ID><Item><Name>Brânză</Name></Item></InvoiceLine></Invoice>';
    const en = parseEfacturaXml(xml, 'en');
    expect(en.lines[0].name).toBe('Brânză');
    expect(en.errors).toContain('Issue date is missing or is not ISO YYYY-MM-DD.');
    expect(en.warnings).toContain('1 lines have units requiring manual mapping.');
    expect(parseEfacturaXml(xml).errors).toContain('Data emiterii lipsește sau nu este ISO YYYY-MM-DD.');
  });
  const input = { foodCostHealth: 50, priceAlerts: 2, activeEmployees: 3, pendingAttendance: 1, haccpToday: 0, haccpExpected: 2, expiringDocuments: 1, expiredDocuments: 1, invalidDocuments: 1, pendingLifecycle: 1, dueInventories: 1, pendingOrders: 1, todayWasteValue: 12.5, pnlComplete: false };
  it('translates all generated daily priorities without changing severity, routing or score', () => {
    const ro = buildDailyManager(input, 'ro');
    const en = buildDailyManager(input, 'en');
    expect(en.map(({ id, severity, route }) => ({ id, severity, route }))).toEqual(ro.map(({ id, severity, route }) => ({ id, severity, route })));
    expect(dailyScore(en)).toBe(dailyScore(ro));
    expect(en.find((signal) => signal.id === 'prices')).toMatchObject({ title: '2 price alerts', action: 'Review' });
    expect(en.find((signal) => signal.id === 'waste')?.title).toBe('Waste today: 12.50 RON');
    for (const signal of en) {
      expect(signal.detail).not.toBe(ro.find((item) => item.id === signal.id)?.detail);
      expect(signal.action).not.toBe(ro.find((item) => item.id === signal.id)?.action);
    }
  });
  it('translates readiness checks without changing inspection results', () => {
    const source = { haccpDocuments: 1, expiredDocuments: 0, expiringDocuments: 0, activeEmployees: 1, attendanceRecorded: 1, documentCount: 1, haccpPending: 0, pendingLifecycle: 0 };
    for (const authority of ['DSVSA', 'DSP', 'ITM', 'AUDIT'] as const) {
      const en = inspectionReadiness(authority, source, 'en');
      const ro = inspectionReadiness(authority, source, 'ro');
      expect(readinessScore(en)).toBe(readinessScore(ro));
      expect(en[0].label).toBe('Documents recorded, with valid dates and not expired');
      en.forEach((check, index) => expect(check.label).not.toBe(ro[index].label));
    }
  });
  it('translates every expiry state and keeps the Romanian default', () => {
    const now = new Date('2026-10-05T12:00:00');
    for (const [date, label] of [['', 'No expiry date'], ['invalid', 'Invalid date'], ['2026-10-04', 'Expired'], ['2026-10-05', 'Expires today'], ['2026-10-15', 'Expires in 10 days'], ['2027-01-01', 'Valid']]) {
      expect(documentExpiryStatus(date, now, 'en').label).toBe(label);
    }
    expect(documentExpiryStatus('2026-10-05', now).label).toBe('Expiră azi');
  });
  it('uses the chosen language for document and HR validation before saving', async () => {
    const draft = { title: '', owner: '', category: 'other' as const, issueDate: '', expiryDate: '', notes: '' };
    await expect(saveOperationalDocument('demo', draft, 'en')).rejects.toThrow('Enter a title of up to 200 characters.');
    await expect(saveOperationalDocument('demo', { ...draft, title: 'Act', expiryDate: '2026-02-30' }, 'en')).rejects.toThrow('The date must exist in the calendar and use YYYY-MM-DD.');
    const item = { ...defaultHrLifecycle({ id: '1', active: true }), status: 'left' as const };
    expect(() => validateHrLifecycle(item, 'en')).toThrow('Enter the departure date.');
    expect(() => validateHrLifecycle(item)).toThrow('Completează data plecării.');
  });
  it('translates sync labels for every state', () => {
    expect(operationalSyncLabel({ syncState: 'synced' }, 'en')).toBe('Synced');
    expect(operationalSyncLabel({ syncState: 'pending' }, 'en')).toBe('Saved on device · sync pending');
    expect(operationalSyncLabel({ syncState: 'conflict' }, 'en')).toBe('Also changed on another device · choose a version');
    expect(operationalSyncLabel({}, 'en')).toBe('Saved on device');
  });
});
