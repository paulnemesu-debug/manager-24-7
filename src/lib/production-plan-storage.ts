import AsyncStorage from '@react-native-async-storage/async-storage';

import type { ProductionPlan } from '@/lib/production-plan';
import { withStorageLock } from '@/lib/storage-lock';

const keyFor = (userId: string) => `manager247.production-plan.v1.${userId}`;

export async function loadProductionPlan(userId: string): Promise<ProductionPlan> {
  const raw = await AsyncStorage.getItem(keyFor(userId));
  if (!raw) return {};
  const plan: unknown = JSON.parse(raw);
  if (!plan || Array.isArray(plan) || typeof plan !== 'object'
    || Object.values(plan).some(value => typeof value !== 'number' || !Number.isFinite(value) || value < 0)) {
    throw new Error('PRODUCTION_PLAN_RECOVERY_REQUIRED');
  }
  return plan as ProductionPlan;
}

/** Merge each user action into the latest stored plan, including across web tabs. */
export function updateProductionPlan(userId: string, update: (plan: ProductionPlan) => ProductionPlan): Promise<ProductionPlan> {
  return withStorageLock(keyFor(userId), async () => {
    const next = update(await loadProductionPlan(userId));
    await AsyncStorage.setItem(keyFor(userId), JSON.stringify(next));
    return next;
  });
}
