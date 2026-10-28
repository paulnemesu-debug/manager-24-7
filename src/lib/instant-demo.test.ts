import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const storage = vi.hoisted(() => new Map<string, string>());
const writes = vi.hoisted(() => vi.fn(async (pairs: readonly (readonly [string, string])[]) => { pairs.forEach(([key, value]) => storage.set(key, value)); }));
vi.mock('@react-native-async-storage/async-storage', () => ({ default: {
  getAllKeys: async () => [...storage.keys()],
  getItem: async (key: string) => storage.get(key) ?? null,
  setItem: async (key: string, value: string) => { storage.set(key, value); },
  multiSet: writes,
  multiRemove: async (keys: string[]) => { keys.forEach((key) => storage.delete(key)); },
} }));
vi.mock('@/lib/supabase', () => ({ isDemoMode: false, isSupabaseConfigured: false, supabase: null }));
import { resetInstantDemo } from './instant-demo';
import * as instantDemo from './instant-demo';
import { setInstantDemoIsolation, workspaceFetch } from './demo-isolation';
import { loadHrData } from './hr-repository';
import { hrLifecycleProgress, loadHrLifecycle } from './hr-lifecycle';
import { documentExpiryStatus, loadOperationalDocuments } from './operational-documents';
import { loadCachedPnlReports } from './pnl-repository';
import { loadOperationsControlData } from './operations-control-repository';
import { calculatePnl } from './pnl';
import { accountLocalModule } from './account-snapshot';
beforeEach(() => { storage.clear(); writes.mockClear(); setInstantDemoIsolation(false); });
afterEach(() => { setInstantDemoIsolation(false); vi.unstubAllGlobals(); });
describe('instant demo isolation', () => {
  it('blocks all cloud requests during demo and restores access on exit', async () => {
    const request = vi.fn().mockResolvedValue(new Response('{}'));
    vi.stubGlobal('fetch', request);
    setInstantDemoIsolation(true);
    await expect(workspaceFetch('https://example.invalid/rest/v1/recipes', { method: 'POST' })).rejects.toThrow('Demo instant');
    await expect(workspaceFetch('https://example.invalid/functions/v1/delete-account', { method: 'POST' })).rejects.toThrow('Demo instant');
    expect(request).not.toHaveBeenCalled();
    setInstantDemoIsolation(false);
    await workspaceFetch('https://example.invalid/rest/v1/recipes');
    expect(request).toHaveBeenCalledTimes(1);
  });
  it('resets only demo data, including new modules, while retaining accounts and credentials', async () => {
    const demo = ['manager247.operational-documents.v1.demo','manager247.hr-lifecycle.v1.demo','manager247.hr.v1.demo','professional_foodcost.demo_recipes.v2'];
    const keep = ['manager247.operational-documents.v1.real-user','manager247.hr-lifecycle.v1.real-user','sb-auth-token','unrelated.demo'];
    [...demo,...keep].forEach((key) => storage.set(key, 'data'));
    await resetInstantDemo();
    expect([...storage.keys()]).toEqual(keep);
  });

  it('seeds useful operational examples that existing repositories can load, without account writes', async () => {
    const now = new Date(2028, 11, 31, 23, 45);
    const keep = ['manager247.hr.v1.real-user', 'manager247.pnl_reports.v1.real-user', 'sb-auth-token', 'professional_foodcost.demo_recipes.v2'];
    keep.forEach((key) => storage.set(key, 'original'));
    await instantDemo.seedInstantDemo('en', now);
    const [hr, lifecycle, docs, reports, operations] = await Promise.all([
      loadHrData('demo'), loadHrLifecycle('demo'), loadOperationalDocuments('demo'), loadCachedPnlReports('demo'), loadOperationsControlData('demo'),
    ]);
    expect(hr.employees).toHaveLength(3);
    expect(hr.employees.every((employee) => employee.name.includes('DEMO') && employee.syncState === 'local')).toBe(true);
    expect(hr.shifts.every((shift) => shift.workDate === '2028-12-31' && hr.employees.some((employee) => employee.id === shift.employeeId))).toBe(true);
    expect(new Set(hr.shifts.map((shift) => shift.status)).size).toBeGreaterThan(1);
    expect(hr.shifts.some((shift) => shift.status === 'scheduled')).toBe(true);
    const progress = lifecycle.map(hrLifecycleProgress);
    expect(progress.some((item) => item.completed < item.total)).toBe(true);
    expect(progress.some((item) => item.completed === item.total)).toBe(true);
    expect(docs.length).toBeGreaterThanOrEqual(2);
    expect(docs.some((doc) => documentExpiryStatus(doc.expiryDate, now).tone === 'watch')).toBe(true);
    expect(docs.some((doc) => documentExpiryStatus(doc.expiryDate, now).tone === 'healthy')).toBe(true);
    expect(docs.every((doc) => doc.title.includes('DEMO') && doc.notes.includes('fictional'))).toBe(true);
    expect(reports).toHaveLength(1);
    expect(reports[0].period).toBe('2028-12');
    expect(calculatePnl(reports[0]).totalRevenue).toBeGreaterThan(0);
    expect(reports[0].notes).toContain('fictional');
    expect(operations.schedules.some((item) => item.enabled && item.nextDueDate === '2028-12-31')).toBe(true);
    expect(operations.waste.some((item) => item.eventDate === '2028-12-31' && item.value > 0)).toBe(true);
    expect(writes).toHaveBeenCalledTimes(1);
    expect(writes.mock.calls[0][0].every(([key]) => key.endsWith('.demo') && accountLocalModule(key, 'demo'))).toBe(true);
    keep.forEach((key) => expect(storage.get(key)).toBe('original'));
    expect([...storage.keys()].some((key) => /haccp_documents|haccp_autocontrol/.test(key))).toBe(false);
  });

  it('builds deterministic localized fictional data without storage or shared mutable state', () => {
    const now = new Date(2028, 1, 29, 12);
    const timestamp = now.getTime();
    const ro = instantDemo.buildInstantDemoData('ro', now);
    const en = instantDemo.buildInstantDemoData('en', now);
    expect(ro.documents[0].title).toContain('Autorizație');
    expect(en.documents[0].title).toContain('Permit');
    expect(ro.hr.employees[1].role).toBe('Bucătar');
    expect(en.hr.employees[1].role).toBe('Cook');
    expect(en).toEqual(instantDemo.buildInstantDemoData('en', now));
    en.hr.employees[0].name = 'Edited demo employee';
    expect(instantDemo.buildInstantDemoData('en', now).hr.employees[0].name).not.toBe('Edited demo employee');
    expect(now.getTime()).toBe(timestamp);
    expect(writes).not.toHaveBeenCalled();
  });

  it('rejects partial seed failures and cleans only the explicit demo seed keys', async () => {
    storage.set('manager247.hr.v1.real-user', 'preserve');
    storage.set('sb-auth-token', 'preserve-token');
    writes.mockImplementationOnce(async (pairs) => {
      storage.set(pairs[0][0], pairs[0][1]);
      throw new Error('device full');
    });
    await expect(instantDemo.seedInstantDemo('en', new Date(2028, 1, 29))).rejects.toThrow('device full');
    expect([...storage.entries()]).toEqual([['manager247.hr.v1.real-user', 'preserve'], ['sb-auth-token', 'preserve-token']]);
  });
});
