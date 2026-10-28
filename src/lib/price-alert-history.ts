/**
 * MANAGER 24/7™ by PARADIM — proprietary software.
 * Copyright © 2026 PARADIM Operations SRL. All rights reserved.
 * Concept author and product director: Marius Paul Nemeșu.
 * See LICENSE-PROPRIETARY.md.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

import type { PriceAlertSummary } from '@/lib/price-alerts';
import { withStorageLock } from '@/lib/storage-lock';

export type StoredPriceAlert = PriceAlertSummary & { capturedAt: string };

const keyFor = (userId: string) => `manager247.price_alert_history.v1.${userId}`;

export async function loadPriceAlertHistory(userId: string): Promise<StoredPriceAlert[]> {
  try {
    const raw = await AsyncStorage.getItem(keyFor(userId));
    const parsed = raw ? JSON.parse(raw) as unknown : [];
    return Array.isArray(parsed) ? parsed as StoredPriceAlert[] : [];
  } catch {
    return [];
  }
}

export async function recordPriceAlert(userId: string, summary: PriceAlertSummary): Promise<void> {
  return withStorageLock(keyFor(userId), async () => {
  const current = await loadPriceAlertHistory(userId);
  const next = [{ ...summary, capturedAt: new Date().toISOString() }, ...current].slice(0, 20);
  await AsyncStorage.setItem(keyFor(userId), JSON.stringify(next));
  });
}
