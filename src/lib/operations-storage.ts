/**
 * MANAGER 24/7™ by PARADIM — proprietary software.
 * Copyright © 2026 PARADIM Operations SRL. All rights reserved.
 * Concept author and product director: Marius Paul Nemeșu.
 * See LICENSE-PROPRIETARY.md.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

import { isDemoMode, supabase } from '@/lib/supabase';
import { withStorageLock } from '@/lib/storage-lock';
import { OperationalError } from '@/lib/operational-sync';

export type TemperatureLog = {
  id: string;
  location: string;
  temperature: number;
  recordedAt: string;
  note: string;
};

export type CleaningLog = {
  id: string;
  task: string;
  completedAt: string;
};

const key = (kind: string, userId: string) => `professional_foodcost.${kind}.v1.${userId}`;

async function read<T>(storageKey: string, fallback: T): Promise<T> {
  const raw = await AsyncStorage.getItem(storageKey);
  if (!raw) return fallback;
  try { return JSON.parse(raw) as T; } catch { return fallback; }
}

export function currentSalesPeriod(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`;
}

type PendingSale = { portions: number; source: string; sourceReference: string | null };
const pendingSalesKey = (userId: string, period: string) => key(`sales_pending.${period}`, userId);
async function readSalesObject(storageKey: string): Promise<Record<string, unknown>> {
  const raw = await AsyncStorage.getItem(storageKey);
  if (raw === null) return {};
  try {
    const value: unknown = JSON.parse(raw);
    if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>;
  } catch { /* Preserve the unreadable bytes for recovery. */ }
  throw new OperationalError('operational.sync.invalidLocal');
}

async function readSalesRecord(storageKey: string): Promise<Record<string, number>> {
  const raw = await readSalesObject(storageKey);
  if (Object.entries(raw).some(([id, value]) => !id || typeof value !== 'number' || !Number.isFinite(value) || value < 0)) {
    throw new OperationalError('operational.sync.invalidLocal');
  }
  return raw as Record<string, number>;
}

async function readPendingSales(storageKey: string): Promise<Record<string, PendingSale>> {
  const raw = await readSalesObject(storageKey);
  for (const [id, value] of Object.entries(raw)) {
    const item = value as Partial<PendingSale> | null;
    if (!id || !item || typeof item !== 'object' || typeof item.portions !== 'number'
      || !Number.isFinite(item.portions) || item.portions < 0 || typeof item.source !== 'string'
      || (item.sourceReference !== null && typeof item.sourceReference !== 'string')) {
      throw new OperationalError('operational.sync.invalidLocal');
    }
  }
  return raw as Record<string, PendingSale>;
}

async function flushSales(userId: string, periodStart: string, pending: Record<string, PendingSale>) {
  if (isDemoMode || !supabase || userId === 'demo' || !Object.keys(pending).length) return;
  const rows = Object.entries(pending).filter(([, item]) => Number.isFinite(item.portions) && item.portions >= 0)
    .map(([recipeId, item]) => ({ user_id: userId, recipe_id: recipeId, period_start: periodStart,
      portions: item.portions, source: item.source, source_reference: item.sourceReference }));
  if (!rows.length) return;
  const { error } = await supabase.from('menu_sales').upsert(rows, { onConflict: 'user_id,recipe_id,period_start' });
  if (error) throw error;
  await AsyncStorage.setItem(pendingSalesKey(userId, periodStart), '{}');
}

export async function loadSales(
  userId: string,
  periodStart = currentSalesPeriod(),
): Promise<Record<string, number>> {
  const localKey = key(`sales.${periodStart}`, userId);
  return withStorageLock(localKey, async () => {
  const local = await readSalesRecord(localKey);
  // Validate durable intent before the network fallback catch can mask damage.
  const pending = await readPendingSales(pendingSalesKey(userId, periodStart));
  if (isDemoMode || !supabase || userId === 'demo') return local;

  try {
  const { data, error } = await supabase
    .from('menu_sales')
    .select('recipe_id, portions')
    .eq('user_id', userId)
    .eq('period_start', periodStart);
  if (error) return local;
  const cloud = Object.fromEntries((data ?? []).map((row) => [row.recipe_id as string, Number(row.portions)]));
  const merged = { ...cloud, ...Object.fromEntries(Object.entries(pending).filter(([, item]) => Number.isFinite(item.portions))
    .map(([id, item]) => [id, item.portions])) };
  await AsyncStorage.setItem(localKey, JSON.stringify(merged));
  await flushSales(userId, periodStart, pending).catch(() => undefined);
  return merged;
  } catch { return local; }
  });
}

export async function saveSales(
  userId: string,
  value: Record<string, number>,
  periodStart = currentSalesPeriod(),
  source = 'manual',
  sourceReference: string | null = null,
): Promise<void> {
  const localKey = key(`sales.${periodStart}`, userId);
  return withStorageLock(localKey, async () => {
    const local = await readSalesRecord(localKey);
    const pending = await readPendingSales(pendingSalesKey(userId, periodStart));
    const valid = Object.fromEntries(Object.entries(value).filter(([, portions]) => Number.isFinite(portions) && portions >= 0));
    for (const [id, portions] of Object.entries(valid)) {
      if (local[id] !== portions) pending[id] = { portions, source, sourceReference };
    }
    // Write intent first: if the cache write fails, a later load can recover it.
    // Writing the cache first would make an identical retry look unchanged and
    // silently omit the lost pending operation.
    const cloud = !isDemoMode && Boolean(supabase) && userId !== 'demo';
    if (cloud) await AsyncStorage.setItem(pendingSalesKey(userId, periodStart), JSON.stringify(pending));
    await AsyncStorage.setItem(localKey, JSON.stringify({ ...local, ...valid }));
    if (!cloud) return;
    await flushSales(userId, periodStart, pending);
  });
}

export const loadTemperatureLogs = (userId: string) => read<TemperatureLog[]>(key('temperatures', userId), []);
export const saveTemperatureLogs = (userId: string, value: TemperatureLog[]) => (
  AsyncStorage.setItem(key('temperatures', userId), JSON.stringify(value))
);

export const loadCleaningLogs = (userId: string) => read<CleaningLog[]>(key('cleaning', userId), []);
export const saveCleaningLogs = (userId: string, value: CleaningLog[]) => (
  AsyncStorage.setItem(key('cleaning', userId), JSON.stringify(value))
);
