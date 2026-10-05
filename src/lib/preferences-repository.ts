/**
 * MANAGER 24/7™ by PARADIM — proprietary software.
 * Copyright © 2026 PARADIM Operations SRL. All rights reserved.
 * Concept author and product director: Marius Paul Nemeșu.
 * See LICENSE-PROPRIETARY.md.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  DEFAULT_CURRENCY,
  isCurrencyCode,
  type CurrencyCode,
} from '@/lib/format';
import { isDemoMode, supabase } from '@/lib/supabase';

export type AccountPreferences = {
  currency: CurrencyCode;
  defaultVatPercent: number;
};

type CachedPreferences = {
  preferences: AccountPreferences;
  pending: boolean;
};

export const DEFAULT_ACCOUNT_PREFERENCES: AccountPreferences = {
  currency: DEFAULT_CURRENCY,
  defaultVatPercent: 11,
};

const keyFor = (userId: string) => `professional_foodcost.preferences.v1.${userId}`;

export function normalizePreferences(value: Partial<AccountPreferences> | null | undefined): AccountPreferences {
  return {
    currency: isCurrencyCode(value?.currency) ? value.currency : DEFAULT_CURRENCY,
    defaultVatPercent: Math.min(100, Math.max(0, Number(value?.defaultVatPercent ?? 11))),
  };
}

export async function loadCachedPreferences(userId: string): Promise<CachedPreferences | null> {
  const raw = await AsyncStorage.getItem(keyFor(userId));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<CachedPreferences>;
    return {
      preferences: normalizePreferences(parsed.preferences),
      pending: Boolean(parsed.pending),
    };
  } catch {
    return null;
  }
}

async function writeCache(userId: string, preferences: AccountPreferences, pending: boolean) {
  await AsyncStorage.setItem(keyFor(userId), JSON.stringify({ preferences, pending }));
}

export async function fetchPreferences(userId: string): Promise<AccountPreferences> {
  if (isDemoMode || !supabase) {
    return (await loadCachedPreferences(userId))?.preferences ?? DEFAULT_ACCOUNT_PREFERENCES;
  }

  const { data, error } = await supabase
    .from('user_preferences')
    .select('currency, default_vat_percent')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;

  const preferences = normalizePreferences(data ? {
    currency: data.currency as CurrencyCode,
    defaultVatPercent: Number(data.default_vat_percent),
  } : DEFAULT_ACCOUNT_PREFERENCES);
  await writeCache(userId, preferences, false);
  return preferences;
}

export async function savePreferences(
  userId: string,
  next: AccountPreferences,
): Promise<AccountPreferences> {
  const preferences = normalizePreferences(next);
  await writeCache(userId, preferences, true);
  if (isDemoMode || !supabase) {
    await writeCache(userId, preferences, false);
    return preferences;
  }

  const { error } = await supabase.from('user_preferences').upsert({
    user_id: userId,
    currency: preferences.currency,
    default_vat_percent: preferences.defaultVatPercent,
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
  await writeCache(userId, preferences, false);
  return preferences;
}

