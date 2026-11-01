import { beforeEach, expect, it, vi } from 'vitest';
const storage = vi.hoisted(() => new Map<string, string>());
const writes = vi.hoisted(() => vi.fn(async (pairs: readonly (readonly [string, string])[]) => { pairs.forEach(([key, value]) => storage.set(key, value)); }));
vi.mock('@react-native-async-storage/async-storage', () => ({ default: {
  getItem: async (key: string) => storage.get(key) ?? null,
  multiGet: async (keys: string[]) => keys.map((key) => [key, storage.get(key) ?? null]),
  multiSet: writes,
  multiRemove: async (keys: string[]) => { keys.forEach((key) => storage.delete(key)); },
} }));
import { seedIndividualTrial } from './trial-seed';
beforeEach(() => { storage.clear(); writes.mockClear(); });
const active = () => true;
const now = new Date('2026-11-01T12:00:00Z');
it('seeds useful fictional examples only into the registered caller keys, once, with distinct identifiers', async () => {
  storage.set('manager247.hr.v1.other', 'original');
  storage.set('manager247.hr.v1.demo', 'instant');
  await Promise.all([seedIndividualTrial('account-a', 'ro', active, now), seedIndividualTrial('account-a', 'ro', active, now)]);
  const hr = JSON.parse(storage.get('manager247.hr.v1.account-a')!);
  expect(hr.employees).toHaveLength(3);
  expect(hr.employees.every((item: { name: string }) => item.name.includes('DEMO'))).toBe(true);
  expect(storage.get('manager247.hr.v1.other')).toBe('original');
  expect(storage.get('manager247.hr.v1.demo')).toBe('instant');
  expect(writes).toHaveBeenCalledTimes(1);
  await seedIndividualTrial('account-b', 'en', active, now);
  const otherHr = JSON.parse(storage.get('manager247.hr.v1.account-b')!);
  expect(otherHr.employees[0].id).not.toBe(hr.employees[0].id);
  expect(hr.shifts[0].employeeId).toBe(hr.employees[0].id);
});
it('never fills or replaces existing user modules when any account data exists', async () => {
  storage.set('manager247.pnl_reports.v1.account-a', 'business data');
  await seedIndividualTrial('account-a', 'ro', active, now);
  expect(storage.get('manager247.pnl_reports.v1.account-a')).toBe('business data');
  expect(storage.has('manager247.hr.v1.account-a')).toBe(false);
});
it('does not write if account generation changed during storage reads', async () => {
  await seedIndividualTrial('account-a', 'ro', () => false, now);
  expect(storage.size).toBe(0);
});
it('rolls back only its newly created keys after a partial storage failure and can retry', async () => {
  storage.set('manager247.hr.v1.other', 'keep');
  writes.mockImplementationOnce(async (pairs) => { storage.set(pairs[0][0], pairs[0][1]); throw new Error('disk full'); });
  await expect(seedIndividualTrial('account-a', 'ro', active, now)).rejects.toThrow('disk full');
  expect([...storage.entries()]).toEqual([['manager247.hr.v1.other', 'keep']]);
  await seedIndividualTrial('account-a', 'ro', active, now);
  expect(JSON.parse(storage.get('manager247.hr.v1.account-a')!).employees).toHaveLength(3);
});
