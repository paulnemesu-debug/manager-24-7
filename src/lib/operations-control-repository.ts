/**
 * MANAGER 24/7™ by PARADIM — proprietary software.
 * Copyright © 2026 PARADIM Operations SRL. All rights reserved.
 * Concept author and product director: Marius Paul Nemeșu.
 * See LICENSE-PROPRIETARY.md.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

import { withStorageLock } from '@/lib/storage-lock';
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
  if (!raw) return emptyData();
  try {
    const parsed = JSON.parse(raw) as Partial<OperationsControlData>;
    return {
      policies: Array.isArray(parsed.policies) ? parsed.policies : [],
      orders: Array.isArray(parsed.orders) ? parsed.orders : [],
      waste: Array.isArray(parsed.waste) ? parsed.waste : [],
      schedules: Array.isArray(parsed.schedules) ? parsed.schedules : [],
    };
  } catch {
    return emptyData();
  }
}

async function writeCache(userId: string, data: OperationsControlData) {
  await AsyncStorage.setItem(keyFor(userId), JSON.stringify(data));
}

function mergePending<T extends { id: string; syncState: 'local' | 'pending' | 'synced' }>(remote: T[], cached: T[]) {
  const pending = cached.filter((item) => item.syncState !== 'synced');
  const pendingIds = new Set(pending.map((item) => item.id));
  return [...pending, ...remote.filter((item) => !pendingIds.has(item.id))];
}

async function loadOperationsControlDataUnlocked(userId: string): Promise<OperationsControlData> {
  const cached = await readCache(userId);
  if (!canSync(userId) || !supabase) return cached;
  await flushOperations(userId, cached);
  const [policiesResult, ordersResult, wasteResult, schedulesResult] = await Promise.all([
    supabase.from('stock_policies').select('id,location_id,catalog_id,minimum_quantity,target_quantity,storage_zone,updated_at').eq('user_id', userId),
    supabase.from('supplier_orders').select('id,location_id,supplier,order_date,status,lines,total_estimated,notes,created_at,updated_at').eq('user_id', userId).order('order_date', { ascending: false }).limit(100),
    supabase.from('waste_entries').select('id,location_id,event_date,catalog_id,item_name,quantity,unit,unit_cost,reason,notes,waste_value,created_at,updated_at').eq('user_id', userId).order('event_date', { ascending: false }).limit(300),
    supabase.from('inventory_schedules').select('id,location_id,frequency,weekday,month_day,enabled,next_due_date,updated_at').eq('user_id', userId),
  ]);
  if (policiesResult.error || ordersResult.error || wasteResult.error || schedulesResult.error) return cached;

  const policies: StockPolicy[] = (policiesResult.data ?? []).map((row) => ({
    id: String(row.id), catalogId: String(row.catalog_id), locationId: row.location_id ? String(row.location_id) : null,
    minimumQuantity: Number(row.minimum_quantity), targetQuantity: Number(row.target_quantity), storageZone: String(row.storage_zone ?? ''),
    updatedAt: String(row.updated_at), syncState: 'synced',
  }));
  const orders: SupplierOrder[] = (ordersResult.data ?? []).map((row) => ({
    id: String(row.id), locationId: row.location_id ? String(row.location_id) : null, supplier: String(row.supplier),
    orderDate: String(row.order_date), status: row.status as SupplierOrder['status'],
    lines: Array.isArray(row.lines) ? row.lines as SupplierOrder['lines'] : [], totalEstimated: Number(row.total_estimated), notes: String(row.notes ?? ''),
    createdAt: String(row.created_at), updatedAt: String(row.updated_at), syncState: 'synced',
  }));
  const waste: WasteEntry[] = (wasteResult.data ?? []).map((row) => ({
    id: String(row.id), locationId: row.location_id ? String(row.location_id) : null, eventDate: String(row.event_date),
    catalogId: row.catalog_id ? String(row.catalog_id) : null, itemName: String(row.item_name), quantity: Number(row.quantity),
    unit: row.unit as WasteEntry['unit'], unitCost: Number(row.unit_cost), reason: row.reason as WasteEntry['reason'], notes: String(row.notes ?? ''),
    value: Number(row.waste_value), createdAt: String(row.created_at), updatedAt: String(row.updated_at), syncState: 'synced',
  }));
  const schedules: InventorySchedule[] = (schedulesResult.data ?? []).map((row) => ({
    id: String(row.id), locationId: row.location_id ? String(row.location_id) : null,
    frequency: row.frequency as InventorySchedule['frequency'], weekday: row.weekday === null ? null : Number(row.weekday),
    monthDay: row.month_day === null ? null : Number(row.month_day), enabled: Boolean(row.enabled), nextDueDate: String(row.next_due_date),
    updatedAt: String(row.updated_at), syncState: 'synced',
  }));
  const resolved = {
    policies: mergePending(policies, cached.policies),
    orders: mergePending(orders, cached.orders),
    waste: mergePending(waste, cached.waste),
    schedules: mergePending(schedules, cached.schedules),
  };
  await writeCache(userId, resolved);
  return resolved;
}

async function replaceCached<T extends keyof OperationsControlData>(userId: string, key: T, value: OperationsControlData[T][number]) {
  const data = await readCache(userId);
  const list = data[key] as OperationsControlData[T][number][];
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
  if (await uploadOperation(userId, 'policies', item)) { item = { ...item, syncState: 'synced' }; await replaceCached(userId, 'policies', item); }
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
  if (await uploadOperation(userId, 'orders', item)) { item = { ...item, syncState: 'synced' }; await replaceCached(userId, 'orders', item); }
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
  if (await uploadOperation(userId, 'waste', item)) { item = { ...item, syncState: 'synced' }; await replaceCached(userId, 'waste', item); }
  return item;
}

async function saveInventoryScheduleUnlocked(userId: string, draft: InventoryScheduleDraft) {
  let item: InventorySchedule = {
    ...draft, id: draft.id ?? uuid(), updatedAt: new Date().toISOString(), syncState: canSync(userId) ? 'pending' : 'local',
  };
  await replaceCached(userId, 'schedules', item);
  if (!canSync(userId) || !supabase) return item;
  if (await uploadOperation(userId, 'schedules', item)) { item = { ...item, syncState: 'synced' }; await replaceCached(userId, 'schedules', item); }
  return item;
}

const tables = { policies: 'stock_policies', orders: 'supplier_orders', waste: 'waste_entries', schedules: 'inventory_schedules' } as const;

async function uploadOperation<K extends keyof OperationsControlData>(userId: string, key: K, value: OperationsControlData[K][number]) {
  if (!supabase) return false;
  const base = { id: value.id, user_id: userId, location_id: value.locationId, updated_at: value.updatedAt };
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
    const { error } = await supabase.from(tables[key]).upsert(payload, { onConflict: 'id' });
    return !error;
  } catch { return false; }
}

async function flushOperations(userId: string, cached: OperationsControlData) {
  for (const key of Object.keys(tables) as (keyof OperationsControlData)[]) {
    for (const item of cached[key]) {
      if (item.syncState !== 'synced' && await uploadOperation(userId, key, item)) item.syncState = 'synced';
    }
  }
  await writeCache(userId, cached);
}

export const loadOperationsControlData = (userId: string) => withStorageLock(`operations:${userId}`, () => loadOperationsControlDataUnlocked(userId));
export const saveStockPolicy = (userId: string, draft: StockPolicyDraft) => withStorageLock(`operations:${userId}`, () => saveStockPolicyUnlocked(userId, draft));
export const saveSupplierOrder = (userId: string, draft: SupplierOrderDraft) => withStorageLock(`operations:${userId}`, () => saveSupplierOrderUnlocked(userId, draft));
export const saveWasteEntry = (userId: string, draft: WasteEntryDraft) => withStorageLock(`operations:${userId}`, () => saveWasteEntryUnlocked(userId, draft));
export const saveInventorySchedule = (userId: string, draft: InventoryScheduleDraft) => withStorageLock(`operations:${userId}`, () => saveInventoryScheduleUnlocked(userId, draft));
