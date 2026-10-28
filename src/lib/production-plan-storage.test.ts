import { beforeEach, describe, expect, it, vi } from 'vitest';
const storage = vi.hoisted(() => new Map<string, string>());
vi.mock('@react-native-async-storage/async-storage', () => ({ default: {
  getItem: vi.fn(async (key: string) => storage.get(key) ?? null),
  setItem: vi.fn(async (key: string, value: string) => { storage.set(key, value); }),
} }));
import { loadProductionPlan, updateProductionPlan } from './production-plan-storage';
describe('production plan persistence', () => {
  beforeEach(() => storage.clear());
  it('persists fractions and removal without exposing another account plan', async () => {
    await updateProductionPlan('alice', plan => ({ ...plan, soup: 6.5 }));
    expect(await loadProductionPlan('alice')).toEqual({ soup: 6.5 });
    expect(await loadProductionPlan('bob')).toEqual({});
    await updateProductionPlan('alice', () => ({}));
    expect(await loadProductionPlan('alice')).toEqual({});
  });
  it('serializes concurrent mutations so a recipe added in another view is retained', async () => {
    await Promise.all([
      updateProductionPlan('alice', plan => ({ ...plan, soup: 6.5 })),
      updateProductionPlan('alice', plan => ({ ...plan, salad: 2 })),
    ]);
    expect(await loadProductionPlan('alice')).toEqual({ soup: 6.5, salad: 2 });
  });
  it('preserves malformed persisted data and rejects edits until recovery', async () => {
    const key = 'manager247.production-plan.v1.alice';
    storage.set(key, 'truncated{');
    await expect(loadProductionPlan('alice')).rejects.toThrow();
    await expect(updateProductionPlan('alice', () => ({ soup: 1 }))).rejects.toThrow();
    expect(storage.get(key)).toBe('truncated{');
  });
});
