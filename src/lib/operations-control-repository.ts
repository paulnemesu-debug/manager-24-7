/**
 * MANAGER 24/7™ by PARADIM — proprietary software.
 * Copyright © 2026 PARADIM Operations SRL. All rights reserved.
 * Concept author and product director: Marius Paul Nemeșu.
 * See LICENSE-PROPRIETARY.md.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

import { withStorageLock } from '@/lib/storage-lock';
import { cloudRevisionTime as serverTime } from '@/lib/cloud-revision-time';
import { isDemoMode, isSupabaseConfigured, supabase } from '@/lib/supabase';
import type {
  InventorySchedule,
  InventoryScheduleDraft,
  StockPolicy,
  StockPolicyDraft,
  SupplierOrder,
  SupplierOrderDraft,
  WasteEntry,
  WasteEntryDraft,
} from '@/types/operations-control';

export type OperationsControlData = {
  policies: StockPolicy[];
  orders: SupplierOrder[];
  waste: WasteEntry[];
  schedules: InventorySchedule[];
};

const emptyData = (): OperationsControlData => ({ policies: [], orders: [], waste: [], schedules: [] });
const keyFor = (userId: string) => `manager247.operations-control.v1.${userId}`;
const uuid = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (character) => {
  const random = Math.floor(Math.random() * 16);
  return (character === 'x' ? random : (random & 3) | 8).toString(16);
});

export const createOperationsControlId = uuid;

function canSync(userId: string) {
  return userId !== 'demo' && !isDemoMode && isSupabaseConfigured && Boolean(supabase);
}

async function readCache(userId: string): Promise<OperationsControlData> {
  const raw = await AsyncStorage.getItem(keyFor(userId));
  if (raw === null) return emptyData();
  try {
    const parsed = JSON.parse(raw) as Partial<OperationsControlData>;
    if (!parsed || !['policies', 'orders', 'waste', 'schedules'].every(key => {
      const rows = parsed[key as keyof OperationsControlData];
      return Array.isArray(rows) && rows.every(item => item && typeof item === 'object'
        && typeof item.id === 'string' && item.id.length > 0
        && typeof item.updatedAt === 'string' && ['local', 'pending', 'synced'].includes(item.syncState));
    })) throw new Error('Invalid operations cache');
    return {
      policies: Array.isArray(parsed.policies) ? parsed.policies : [],
      orders: Array.isArray(parsed.orders) ? parsed.orders : [],
      waste: Array.isArray(parsed.waste) ? parsed.waste : [],
      schedules: Array.isArray(parsed.schedules) ? parsed.schedules : [],
    };
  } catch {
    throw new Error('Operations cache could not be read. Saved data has not been changed.');
  }
}

async function writeCache(userId: string, data: OperationsControlData) {
  await AsyncStorage.setItem(keyFor(userId), JSON.stringify(data));
}

async function operationAuthorization(userId: string): Promise<string | null> {
  try {
    const { data, error } = await supabase!.auth.getSession();
    return !error && data.session?.user.id === userId && data.session.access_token
      ? `Bearer ${data.session.access_token}` : null;
  } catch { return null; }
}

type CachedOperation = OperationsControlData[keyof OperationsControlData][number];
type RemoteOperation = Record<string, unknown> & { id: string; updated_at: string };
const columns = {
  policies: 'id,location_id,catalog_id,minimum_quantity,target_quantity,storage_zone,updated_at',
  orders: 'id,location_id,supplier,order_date,status,lines,total_estimated,notes,created_at,updated_at',
  waste: 'id,location_id,event_date,catalog_id,item_name,quantity,unit,unit_cost,reason,notes,waste_value,created_at,updated_at',
  schedules: 'id,location_id,frequency,weekday,month_day,enabled,next_due_date,updated_at',
} as const;

async function verifyListedRows(userId: string, key: keyof OperationsControlData, listed: RemoteOperation[], cached: CachedOperation[], authorization: string) {
  const rows = new Map(listed.map(row => [row.id, row]));
  const missing = new Set<string>();
  const ids = cached.filter(item => {
    const remote = rows.get(item.id);
    return item.syncState === 'synced' && (!remote
      || (serverTime(remote.updated_at) ?? -1n) < (serverTime(item.updatedAt) ?? -1n));
  }).map(item => item.id);
  // Orders and waste lists are bounded. Only a successful owner-scoped ID
  // lookup establishes absence; a failed lookup is never a deletion signal.
  for (let offset = 0; offset < ids.length; offset += 100) {
    const batch = ids.slice(offset, offset + 100);
    try {
      const selectedColumns: string = columns[key];
      const { data, error } = await supabase!.from(tables[key]).select(selectedColumns)
        .eq('user_id', userId).in('id', batch).setHeader('Authorization', authorization);
      const returned: unknown = data;
      if (error || !Array.isArray(returned) || !returned.every(row => row && typeof row.id === 'string' && serverTime(row.updated_at) !== null)) continue;
      const verified = new Map((returned as RemoteOperation[]).map(row => [row.id, row]));
      for (const id of batch) {
        const row = verified.get(id);
        if (row) rows.set(id, row);
        else { rows.delete(id); missing.add(id); }
      }
    } catch { /* Keep the acknowledged cache available until verification succeeds. */ }
  }
  return { rows: [...rows.values()], missing };
}

function mergeAcknowledged<T extends CachedOperation>(remote: T[], cached: T[], missing: ReadonlySet<string>) {
  const merged = new Map(remote.map(item => [item.id, item]));
  for (const item of cached) {
    if (missing.has(item.id)) continue;
    const cloud = merged.get(item.id);
    if (!cloud || item.syncState !== 'synced'
      || (serverTime(item.updatedAt) ?? -1n) > (serverTime(cloud.updatedAt) ?? -1n)) merged.set(item.id, item);
  }
  return [...merged.values()];
}

async function loadOperationsControlDataUnlocked(userId: string): Promise<OperationsControlData> {
  const cached = await readCache(userId);
  if (!canSync(userId) || !supabase) return cached;
  const authorization = await operationAuthorization(userId);
  if (!authorization) return cached;
  await flushOperations(userId, cached, authorization);
  const [policiesResult, ordersResult, wasteResult, schedulesResult] = await Promise.all([
    supabase.from('stock_policies').select(columns.policies).eq('user_id', userId).setHeader('Authorization', authorization),
    supabase.from('supplier_orders').select(columns.orders).eq('user_id', userId).order('order_date', { ascending: false }).limit(100).setHeader('Authorization', authorization),
    supabase.from('waste_entries').select(columns.waste).eq('user_id', userId).order('event_date', { ascending: false }).limit(300).setHeader('Authorization', authorization),
    supabase.from('inventory_schedules').select(columns.schedules).eq('user_id', userId).setHeader('Authorization', authorization),
  ]);
  if (policiesResult.error || ordersResult.error || wasteResult.error || schedulesResult.error) return cached;
  const [verifiedPolicies, verifiedOrders, verifiedWaste, verifiedSchedules] = await Promise.all([
    verifyListedRows(userId, 'policies', policiesResult.data as RemoteOperation[] ?? [], cached.policies, authorization),
    verifyListedRows(userId, 'orders', ordersResult.data as RemoteOperation[] ?? [], cached.orders, authorization),
    verifyListedRows(userId, 'waste', wasteResult.data as RemoteOperation[] ?? [], cached.waste, authorization),
    verifyListedRows(userId, 'schedules', schedulesResult.data as RemoteOperation[] ?? [], cached.schedules, authorization),
  ]);

  const policies: StockPolicy[] = verifiedPolicies.rows.map((row) => ({
    id: String(row.id), catalogId: String(row.catalog_id), locationId: row.location_id ? String(row.location_id) : null,
    minimumQuantity: Number(row.minimum_quantity), targetQuantity: Number(row.target_quantity), storageZone: String(row.storage_zone ?? ''),
    updatedAt: String(row.updated_at), syncState: 'synced',
  }));
  const orders: SupplierOrder[] = verifiedOrders.rows.map((row) => ({
    id: String(row.id), locationId: row.location_id ? String(row.location_id) : null, supplier: String(row.supplier),
    orderDate: String(row.order_date), status: row.status as SupplierOrder['status'],
    lines: Array.isArray(row.lines) ? row.lines as SupplierOrder['lines'] : [], totalEstimated: Number(row.total_estimated), notes: String(row.notes ?? ''),
    createdAt: String(row.created_at), updatedAt: String(row.updated_at), syncState: 'synced',
  }));
  const waste: WasteEntry[] = verifiedWaste.rows.map((row) => ({
    id: String(row.id), locationId: row.location_id ? String(row.location_id) : null, eventDate: String(row.event_date),
    catalogId: row.catalog_id ? String(row.catalog_id) : null, itemName: String(row.item_name), quantity: Number(row.quantity),
    unit: row.unit as WasteEntry['unit'], unitCost: Number(row.unit_cost), reason: row.reason as WasteEntry['reason'], notes: String(row.notes ?? ''),
    value: Number(row.waste_value), createdAt: String(row.created_at), updatedAt: String(row.updated_at), syncState: 'synced',
  }));
  const schedules: InventorySchedule[] = verifiedSchedules.rows.map((row) => ({
    id: String(row.id), locationId: row.location_id ? String(row.location_id) : null,
    frequency: row.frequency as InventorySchedule['frequency'], weekday: row.weekday === null ? null : Number(row.weekday),
    monthDay: row.month_day === null ? null : Number(row.month_day), enabled: Boolean(row.enabled), nextDueDate: String(row.next_due_date),
    updatedAt: String(row.updated_at), syncState: 'synced',
  }));
  const resolved = {
    policies: mergeAcknowledged(policies, cached.policies, verifiedPolicies.missing),
    orders: mergeAcknowledged(orders, cached.orders, verifiedOrders.missing),
    waste: mergeAcknowledged(waste, cached.waste, verifiedWaste.missing),
    schedules: mergeAcknowledged(schedules, cached.schedules, verifiedSchedules.missing),
  };
  await writeCache(userId, resolved);
  return resolved;
}

async function replaceCached<T extends keyof OperationsControlData>(userId: string, key: T, value: OperationsControlData[T][number]) {
  const data = await readCache(userId);
  const list = data[key] as OperationsControlData[T][number][];
  if (value.syncState !== 'synced') {
    const previous = list.find(item => item.id === value.id);
    value.baseServerUpdatedAt = previous
      ? previous.syncState === 'synced' ? previous.updatedAt : previous.baseServerUpdatedAt
      : null;
  }
  (data[key] as OperationsControlData[T][number][]) = [value, ...list.filter((item) => item.id !== value.id)];
  await writeCache(userId, data);
}

async function saveStockPolicyUnlocked(userId: string, draft: StockPolicyDraft) {
  let item: StockPolicy = {
    ...draft, id: draft.id ?? uuid(), minimumQuantity: Math.max(0, draft.minimumQuantity),
    targetQuantity: Math.max(draft.minimumQuantity, draft.targetQuantity), storageZone: draft.storageZone.trim(),
    updatedAt: new Date().toISOString(), syncState: canSync(userId) ? 'pending' : 'local',
  };
  await replaceCached(userId, 'policies', item);
  if (!canSync(userId) || !supabase) return item;
  const acknowledged = await uploadOperation(userId, 'policies', item);
  if (acknowledged) { item = { ...item, updatedAt: acknowledged, syncState: 'synced' }; await replaceCached(userId, 'policies', item); }
  return item;
}

async function saveSupplierOrderUnlocked(userId: string, draft: SupplierOrderDraft) {
  const now = new Date().toISOString();
  let item: SupplierOrder = {
    ...draft, id: draft.id ?? uuid(), supplier: draft.supplier.trim(), notes: draft.notes.trim(),
    totalEstimated: Math.max(0, draft.totalEstimated), createdAt: now, updatedAt: now,
    syncState: canSync(userId) ? 'pending' : 'local',
  };
  await replaceCached(userId, 'orders', item);
  if (!canSync(userId) || !supabase) return item;
  const acknowledged = await uploadOperation(userId, 'orders', item);
  if (acknowledged) { item = { ...item, updatedAt: acknowledged, syncState: 'synced' }; await replaceCached(userId, 'orders', item); }
  return item;
}

async function saveWasteEntryUnlocked(userId: string, draft: WasteEntryDraft) {
  const now = new Date().toISOString();
  let item: WasteEntry = {
    ...draft, id: draft.id ?? uuid(), itemName: draft.itemName.trim(), notes: draft.notes.trim(),
    quantity: Math.max(0, draft.quantity), unitCost: Math.max(0, draft.unitCost),
    value: Math.round(Math.max(0, draft.quantity) * Math.max(0, draft.unitCost) * 100) / 100,
    createdAt: now, updatedAt: now, syncState: canSync(userId) ? 'pending' : 'local',
  };
  await replaceCached(userId, 'waste', item);
  if (!canSync(userId) || !supabase) return item;
  const acknowledged = await uploadOperation(userId, 'waste', item);
  if (acknowledged) { item = { ...item, updatedAt: acknowledged, syncState: 'synced' }; await replaceCached(userId, 'waste', item); }
  return item;
}

async function saveInventoryScheduleUnlocked(userId: string, draft: InventoryScheduleDraft) {
  let item: InventorySchedule = {
    ...draft, id: draft.id ?? uuid(), updatedAt: new Date().toISOString(), syncState: canSync(userId) ? 'pending' : 'local',
  };
  await replaceCached(userId, 'schedules', item);
  if (!canSync(userId) || !supabase) return item;
  const acknowledged = await uploadOperation(userId, 'schedules', item);
  if (acknowledged) { item = { ...item, updatedAt: acknowledged, syncState: 'synced' }; await replaceCached(userId, 'schedules', item); }
  return item;
}

const tables = { policies: 'stock_policies', orders: 'supplier_orders', waste: 'waste_entries', schedules: 'inventory_schedules' } as const;

function canonicalPayload(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalPayload);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value)
    .filter(([, entry]) => entry !== undefined).sort(([a], [b]) => a.localeCompare(b))
    .map(([key, entry]) => [key, canonicalPayload(entry)]));
  return value;
}

function samePayload(payload: Record<string, unknown>, row: Record<string, unknown>) {
  return Object.entries(payload).filter(([, value]) => value !== undefined).every(([key, value]) =>
    key.endsWith('_at') && serverTime(value) !== null
      ? serverTime(value) === serverTime(row[key])
      : JSON.stringify(canonicalPayload(value)) === JSON.stringify(canonicalPayload(row[key])));
}

async function uploadOperation<K extends keyof OperationsControlData>(userId: string, key: K, value: OperationsControlData[K][number], capturedAuthorization?: string, replay = false): Promise<string | null> {
  if (!supabase) return null;
  const authorization = capturedAuthorization ?? await operationAuthorization(userId);
  if (!authorization) return null;
  // Let the server default/trigger establish revision time even on a device
  // with a fast clock. An unacknowledged write remains queued under its ID.
  const base = { id: value.id, user_id: userId, location_id: value.locationId };
  let payload: Record<string, unknown>;
  if (key === 'policies') {
    const item = value as StockPolicy;
    payload = { ...base, catalog_id: item.catalogId, minimum_quantity: item.minimumQuantity, target_quantity: item.targetQuantity, storage_zone: item.storageZone };
  } else if (key === 'orders') {
    const item = value as SupplierOrder;
    payload = { ...base, supplier: item.supplier, order_date: item.orderDate, status: item.status, lines: item.lines, total_estimated: item.totalEstimated, notes: item.notes, created_at: item.createdAt };
  } else if (key === 'waste') {
    const item = value as WasteEntry;
    payload = { ...base, event_date: item.eventDate, catalog_id: item.catalogId, item_name: item.itemName, quantity: item.quantity, unit: item.unit, unit_cost: item.unitCost, reason: item.reason, notes: item.notes, created_at: item.createdAt };
  } else {
    const item = value as InventorySchedule;
    payload = { ...base, frequency: item.frequency, weekday: item.weekday, month_day: item.monthDay, enabled: item.enabled, next_due_date: item.nextDueDate };
  }
  try {
    let query;
    if (replay) {
      const { data, error } = await supabase.from(tables[key]).select('*')
        .eq('user_id', userId).eq('id', value.id).setHeader('Authorization', authorization);
      if (error || !Array.isArray(data) || data.length > 1) return null;
      const row = data[0];
      if (!row) {
        // A known new ID may be inserted. Never resurrect an edited/deleted or
        // legacy unknown record, and let a concurrent INSERT fail on its key.
        if (value.baseServerUpdatedAt !== null) return null;
        query = supabase.from(tables[key]).insert(payload);
      } else {
        if (row.id !== value.id || row.user_id !== userId || serverTime(row.updated_at) === null) return null;
        if (samePayload(payload, row)) return row.updated_at;
        if (serverTime(value.baseServerUpdatedAt) === null || serverTime(value.baseServerUpdatedAt) !== serverTime(row.updated_at)) return null;
        query = supabase.from(tables[key]).update(payload).eq('user_id', userId)
          .eq('id', value.id).eq('updated_at', row.updated_at);
      }
    } else {
      query = supabase.from(tables[key]).upsert(payload, { onConflict: 'id' });
    }
    const { data, error } = await query.select('updated_at').single().setHeader('Authorization', authorization);
    return !error && serverTime(data?.updated_at) !== null ? data.updated_at : null;
  } catch { return null; }
}

async function flushOperations(userId: string, cached: OperationsControlData, authorization: string) {
  for (const key of Object.keys(tables) as (keyof OperationsControlData)[]) {
    for (const item of cached[key]) {
      if (item.syncState === 'synced') continue;
      const acknowledged = await uploadOperation(userId, key, item, authorization, true);
      if (acknowledged) {
        item.syncState = 'synced';
        item.updatedAt = acknowledged;
        await writeCache(userId, cached);
      }
    }
  }
}

export const loadOperationsControlData = (userId: string) => withStorageLock(`operations:${userId}`, () => loadOperationsControlDataUnlocked(userId));
export const saveStockPolicy = (userId: string, draft: StockPolicyDraft) => withStorageLock(`operations:${userId}`, () => saveStockPolicyUnlocked(userId, draft));
export const saveSupplierOrder = (userId: string, draft: SupplierOrderDraft) => withStorageLock(`operations:${userId}`, () => saveSupplierOrderUnlocked(userId, draft));
export const saveWasteEntry = (userId: string, draft: WasteEntryDraft) => withStorageLock(`operations:${userId}`, () => saveWasteEntryUnlocked(userId, draft));
export const saveInventorySchedule = (userId: string, draft: InventoryScheduleDraft) => withStorageLock(`operations:${userId}`, () => saveInventoryScheduleUnlocked(userId, draft));
