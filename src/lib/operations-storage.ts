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
import { cloudRevisionTime } from '@/lib/cloud-revision-time';

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

type PendingSale = { portions: number; source: string; sourceReference: string | null; baseUpdatedAt?: string | null; conflict?: boolean };
type AcknowledgedSale = { portions: number; source: string; sourceReference: string | null; updatedAt: string };
type SalesRow = { user_id: string; recipe_id: string; period_start: string; portions: number | string; source: string; source_reference: string | null; updated_at: string };
const pendingSalesKey = (userId: string, period: string) => key(`sales_pending.${period}`, userId);
const acknowledgedSalesKey = (userId: string, period: string) => key(`sales_acknowledged.${period}`, userId);
const salesColumns = 'user_id,recipe_id,period_start,portions,source,source_reference,updated_at';

export class SalesSyncError extends Error {
  constructor(readonly kind: 'pending' | 'conflict') { super(kind === 'conflict' ? 'Sales changed on another device. Review and retry your edit.' : 'Sales remain on this device and need synchronization.'); }
}

function assertSalesScope(userId: string, period: string) {
  if (!userId || !/^\d{4}-(0[1-9]|1[0-2])-01$/.test(period)) throw new OperationalError('operational.sync.invalidLocal');
}

async function salesAuthorization(userId: string): Promise<string | null> {
  if (isDemoMode || !supabase || userId === 'demo') return null;
  try {
    const { data, error } = await supabase.auth.getSession();
    return !error && data.session?.user.id === userId && data.session.access_token ? `Bearer ${data.session.access_token}` : null;
  } catch { return null; }
}
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
      || (item.sourceReference !== null && typeof item.sourceReference !== 'string')
      || (item.baseUpdatedAt !== undefined && item.baseUpdatedAt !== null && cloudRevisionTime(item.baseUpdatedAt) === null)
      || (item.conflict !== undefined && typeof item.conflict !== 'boolean')) {
      throw new OperationalError('operational.sync.invalidLocal');
    }
  }
  return raw as Record<string, PendingSale>;
}

async function readAcknowledgedSales(storageKey: string): Promise<Record<string, AcknowledgedSale>> {
  const raw = await readSalesObject(storageKey);
  for (const [id, value] of Object.entries(raw)) {
    const item = value as Partial<AcknowledgedSale> | null;
    if (!id || !item || typeof item !== 'object' || typeof item.portions !== 'number' || !Number.isFinite(item.portions) || item.portions < 0
      || typeof item.source !== 'string' || (item.sourceReference !== null && typeof item.sourceReference !== 'string') || cloudRevisionTime(item.updatedAt) === null) {
      throw new OperationalError('operational.sync.invalidLocal');
    }
  }
  return raw as Record<string, AcknowledgedSale>;
}

function validRows(value: unknown, userId: string, period: string, ids?: readonly string[]): SalesRow[] | null {
  if (!Array.isArray(value)) return null;
  const seen = new Set<string>();
  for (const item of value as SalesRow[]) {
    if (!item || item.user_id !== userId || item.period_start !== period || typeof item.recipe_id !== 'string' || !item.recipe_id
      || (ids && !ids.includes(item.recipe_id)) || seen.has(item.recipe_id) || item.portions === null || item.portions === ''
      || !['number', 'string'].includes(typeof item.portions) || !Number.isFinite(Number(item.portions)) || Number(item.portions) < 0
      || typeof item.source !== 'string' || (item.source_reference !== null && typeof item.source_reference !== 'string') || cloudRevisionTime(item.updated_at) === null) return null;
    seen.add(item.recipe_id);
  }
  return value as SalesRow[];
}

const acknowledged = (row: SalesRow): AcknowledgedSale => ({ portions: Number(row.portions), source: row.source, sourceReference: row.source_reference, updatedAt: row.updated_at });
const payload = (userId: string, period: string, id: string, item: PendingSale) => ({ user_id: userId, recipe_id: id, period_start: period,
  portions: item.portions, source: item.source, source_reference: item.sourceReference });
const sameSale = (row: SalesRow, item: PendingSale) => Number(row.portions) === item.portions && row.source === item.source && row.source_reference === item.sourceReference;

async function persistSales(userId: string, period: string, local: Record<string, number>, ack: Record<string, AcknowledgedSale>, pending: Record<string, PendingSale>) {
  // Durable intent is removed only after both its server receipt and numeric cache are stored.
  await AsyncStorage.setItem(acknowledgedSalesKey(userId, period), JSON.stringify(ack));
  await AsyncStorage.setItem(key(`sales.${period}`, userId), JSON.stringify(local));
  await AsyncStorage.setItem(pendingSalesKey(userId, period), JSON.stringify(pending));
}

async function replaySales(userId: string, period: string, authorization: string, local: Record<string, number>, ack: Record<string, AcknowledgedSale>, pending: Record<string, PendingSale>) {
  for (const [id, item] of Object.entries(pending)) {
    const checked = await supabase!.from('menu_sales').select(salesColumns).eq('user_id', userId).eq('period_start', period)
      .in('recipe_id', [id]).limit(2).setHeader('Authorization', authorization);
    const rows = checked.error ? null : validRows(checked.data, userId, period, [id]);
    if (!rows || rows.length > 1) continue;
    const remote = rows[0];
    let saved = remote && sameSale(remote, item) ? remote : null;
    if (!saved) {
      const safe = remote ? Boolean(item.baseUpdatedAt && cloudRevisionTime(item.baseUpdatedAt) === cloudRevisionTime(remote.updated_at)) : item.baseUpdatedAt === null;
      if (!safe) { pending[id] = { ...item, conflict: true }; continue; }
      const write = remote
        ? supabase!.from('menu_sales').update(payload(userId, period, id, item)).eq('user_id', userId).eq('period_start', period).eq('recipe_id', id).eq('updated_at', remote.updated_at)
        : supabase!.from('menu_sales').insert(payload(userId, period, id, item));
      const result = await write.select(salesColumns).setHeader('Authorization', authorization);
      const resultRows = result.error ? null : validRows(result.data, userId, period, [id]);
      if (result.error?.code === '23505' || (remote && resultRows?.length === 0)) pending[id] = { ...item, conflict: true };
      if (!resultRows || resultRows.length !== 1 || !sameSale(resultRows[0], item)) continue;
      saved = resultRows[0];
    }
    ack[id] = acknowledged(saved); local[id] = Number(saved.portions); delete pending[id];
    await persistSales(userId, period, local, ack, pending);
  }
}

export async function loadPendingSales(userId: string, periodStart = currentSalesPeriod()): Promise<Record<string, 'pending' | 'conflict'>> {
  assertSalesScope(userId, periodStart);
  return withStorageLock(key(`sales.${periodStart}`, userId), async () => Object.fromEntries(
    Object.entries(await readPendingSales(pendingSalesKey(userId, periodStart))).map(([id, item]) => [id, item.conflict ? 'conflict' : 'pending']),
  ));
}

export async function loadSales(
  userId: string,
  periodStart = currentSalesPeriod(),
): Promise<Record<string, number>> {
  assertSalesScope(userId, periodStart);
  const authorization = await salesAuthorization(userId);
  const localKey = key(`sales.${periodStart}`, userId);
  return withStorageLock(localKey, async () => {
  const local = await readSalesRecord(localKey);
  // Validate durable intent before the network fallback catch can mask damage.
  const pending = await readPendingSales(pendingSalesKey(userId, periodStart));
  const ack = await readAcknowledgedSales(acknowledgedSalesKey(userId, periodStart));
  const withPending = () => ({ ...local, ...Object.fromEntries(Object.entries(pending).map(([id, item]) => [id, item.portions])) });
  if (isDemoMode || !supabase || userId === 'demo' || !authorization) return withPending();

  try {
  const { data, error } = await supabase
    .from('menu_sales')
    .select(salesColumns)
    .eq('user_id', userId)
    .eq('period_start', periodStart).setHeader('Authorization', authorization);
  const rows = error ? null : validRows(data, userId, periodStart);
  if (!rows) return withPending();
  const listed = new Map(rows.map(row => [row.recipe_id, row]));
  const verify = Object.keys(local).filter(id => !pending[id] && (!listed.has(id)
    || (ack[id] && cloudRevisionTime(listed.get(id)!.updated_at)! < cloudRevisionTime(ack[id].updatedAt)!)));
  for (const row of rows) {
    if (pending[row.recipe_id] || verify.includes(row.recipe_id)) continue;
    local[row.recipe_id] = Number(row.portions); ack[row.recipe_id] = acknowledged(row);
  }
  for (let start = 0; start < verify.length; start += 50) {
    const ids = verify.slice(start, start + 50);
    const result = await supabase.from('menu_sales').select(salesColumns).eq('user_id', userId).eq('period_start', periodStart)
      .in('recipe_id', ids).limit(ids.length + 1).setHeader('Authorization', authorization);
    const verified = result.error ? null : validRows(result.data, userId, periodStart, ids);
    if (!verified) continue;
    for (const id of ids) {
      const row = verified.find(item => item.recipe_id === id);
      if (!row) { delete local[id]; delete ack[id]; }
      else if (!ack[id] || cloudRevisionTime(row.updated_at)! >= cloudRevisionTime(ack[id].updatedAt)!) { local[id] = Number(row.portions); ack[id] = acknowledged(row); }
    }
  }
  await replaySales(userId, periodStart, authorization, local, ack, pending);
  Object.assign(local, Object.fromEntries(Object.entries(pending).map(([id, item]) => [id, item.portions])));
  await persistSales(userId, periodStart, local, ack, pending);
  return local;
  } catch { return withPending(); }
  });
}

export async function saveSales(
  userId: string,
  value: Record<string, number>,
  periodStart = currentSalesPeriod(),
  source = 'manual',
  sourceReference: string | null = null,
): Promise<void> {
  assertSalesScope(userId, periodStart);
  if (Object.entries(value).some(([id, portions]) => !id || typeof portions !== 'number' || !Number.isFinite(portions) || portions < 0)
    || typeof source !== 'string' || (sourceReference !== null && typeof sourceReference !== 'string')) throw new OperationalError('operational.sync.invalidLocal');
  const authorization = await salesAuthorization(userId);
  const localKey = key(`sales.${periodStart}`, userId);
  return withStorageLock(localKey, async () => {
    const local = await readSalesRecord(localKey);
    const pending = await readPendingSales(pendingSalesKey(userId, periodStart));
    const ack = await readAcknowledgedSales(acknowledgedSalesKey(userId, periodStart));
    const cloud = !isDemoMode && Boolean(supabase) && userId !== 'demo';
    const changed: string[] = [];
    for (const [id, portions] of Object.entries(value)) {
      if (local[id] !== portions || pending[id]) {
        const previous = pending[id];
        pending[id] = { portions, source, sourceReference, baseUpdatedAt: ack[id]?.updatedAt
          ?? (previous && 'baseUpdatedAt' in previous ? previous.baseUpdatedAt : local[id] === undefined ? null : undefined) };
        changed.push(id);
      }
    }
    // Write intent first: if the cache write fails, a later load can recover it.
    // Writing the cache first would make an identical retry look unchanged and
    // silently omit the lost pending operation.
    if (cloud) await AsyncStorage.setItem(pendingSalesKey(userId, periodStart), JSON.stringify(pending));
    Object.assign(local, value);
    await AsyncStorage.setItem(localKey, JSON.stringify(local));
    if (!cloud) return;
    if (!authorization) throw new SalesSyncError('pending');
    if (!changed.length) return;
    const result = await supabase!.from('menu_sales').upsert(changed.map(id => payload(userId, periodStart, id, pending[id])), { onConflict: 'user_id,recipe_id,period_start' })
      .select(salesColumns).setHeader('Authorization', authorization);
    if (result.error) throw result.error;
    const saved = validRows(result.data, userId, periodStart, changed);
    if (!saved || saved.length !== changed.length || saved.some(row => !sameSale(row, pending[row.recipe_id]))) throw new SalesSyncError('pending');
    for (const row of saved) { ack[row.recipe_id] = acknowledged(row); delete pending[row.recipe_id]; }
    await persistSales(userId, periodStart, local, ack, pending);
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
