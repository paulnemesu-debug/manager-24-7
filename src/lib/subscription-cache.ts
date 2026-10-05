/**
 * MANAGER 24/7™ by PARADIM — proprietary software.
 * Copyright © 2026 PARADIM Operations SRL. All rights reserved.
 * Concept author and product director: Marius Paul Nemeșu.
 * See LICENSE-PROPRIETARY.md.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

import type { SubscriptionStatus } from '@/contexts/subscription-context';

export type EntitlementSnapshot = {
  status: SubscriptionStatus;
  isAdmin: boolean;
  isViewer: boolean;
  productId: string | null;
  periodEnd: string | null;
  checkedAt: string;
  /** Rezultatul ultimei validări făcute de serverul Supabase. */
  serverAllowed: boolean;
};

export const OFFLINE_ENTITLEMENT_DAYS = 7;
const keyFor = (userId: string) => `professional_foodcost.entitlement.v1.${userId}`;

export function isEntitlementLeaseValid(
  snapshot: EntitlementSnapshot,
  now = Date.now(),
): boolean {
  const checkedAt = new Date(snapshot.checkedAt).getTime();
  return Number.isFinite(checkedAt)
    && now - checkedAt <= OFFLINE_ENTITLEMENT_DAYS * 24 * 60 * 60 * 1000;
}

export function hasEntitlementAccess(
  snapshot: EntitlementSnapshot,
  now = Date.now(),
): boolean {
  return snapshot.serverAllowed === true && isEntitlementLeaseValid(snapshot, now);
}

export async function readEntitlementSnapshot(userId: string): Promise<EntitlementSnapshot | null> {
  const raw = await AsyncStorage.getItem(keyFor(userId));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as EntitlementSnapshot;
    if (!parsed.checkedAt || typeof parsed.status !== 'string' || parsed.serverAllowed !== true) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function writeEntitlementSnapshot(userId: string, snapshot: EntitlementSnapshot) {
  await AsyncStorage.setItem(keyFor(userId), JSON.stringify(snapshot));
}