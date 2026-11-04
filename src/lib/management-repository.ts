/**
 * MANAGER 24/7™ by PARADIM — proprietary software.
 * Copyright © 2026 PARADIM Operations SRL. All rights reserved.
 * Concept author and product director: Marius Paul Nemeșu.
 * See LICENSE-PROPRIETARY.md.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

import { isDemoMode, isSupabaseConfigured, supabase } from '@/lib/supabase';
import { withStorageLock } from '@/lib/storage-lock';
import { OperationalError } from '@/lib/operational-sync';
import type { InventoryLine, SalesLine } from '@/lib/management-control';

export type ManagementSnapshot = {
  id: string;
  date: string;
  inventory: InventoryLine[];
  sales: SalesLine[];
  labor: { employeeName: string; role: string; hours: number; hourlyCost: number }[];
  locationId: string | null;
  updatedAt: string;
  /** Server revision time for physical counts. Older caches have only the device time. */
  inventoryServerUpdatedAt?: string;
  syncState: 'local' | 'pending' | 'synced';
  kind?: 'daily' | 'inventory';
  notes?: string;
  /** IDs are written durably before the first cloud attempt. */
  syncFormat?: 2;
  laborIds?: string[];
  /** Older versions used random server IDs; replay needs explicit reconciliation. */
  syncIssue?: 'legacy_daily_requires_review';
};

const keyFor = (userId: string) => `manager247.management.v1.${userId}`;
const canSync = (userId: string) => userId !== 'demo' && !isDemoMode && isSupabaseConfigured && Boolean(supabase);
const syncedHistoryLimit = 24;
const uuid = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (character) => {
  const random = Math.floor(Math.random() * 16);
  return (character === 'x' ? random : (random & 3) | 8).toString(16);
});

export const createManagementId = uuid;

async function readCache(userId: string): Promise<ManagementSnapshot[]> {
  const raw = await AsyncStorage.getItem(keyFor(userId));
  if (raw === null) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.some((item) => !item || typeof item.id !== 'string'
      || !Array.isArray(item.inventory) || !Array.isArray(item.sales) || !Array.isArray(item.labor))) {
      throw new OperationalError('operational.sync.invalidLocal');
    }
    return parsed as ManagementSnapshot[];
  } catch {
    throw new OperationalError('operational.sync.invalidLocal');
  }
}

async function writeCache(userId: string, snapshots: ManagementSnapshot[]) {
  // Cloud inventory history cannot replace the sales and labor data in local daily snapshots.
  const syncedInventoryByLocation = new Map<string | null, number>();
  let syncedManagement = 0;
  const retained = snapshots.filter((item) => {
    if (item.syncState !== 'synced') return true;
    if (item.kind !== 'inventory') return ++syncedManagement <= syncedHistoryLimit;
    const count = (syncedInventoryByLocation.get(item.locationId) ?? 0) + 1;
    syncedInventoryByLocation.set(item.locationId, count);
    return count <= syncedHistoryLimit;
  });
  await AsyncStorage.setItem(keyFor(userId), JSON.stringify(retained));
  return retained;
}

async function cache(userId: string, snapshot: ManagementSnapshot) {
  const current = await readCache(userId);
  await writeCache(userId, [snapshot, ...current.filter((item) => item.id !== snapshot.id)]);
}

function isLegacyDaily(snapshot: ManagementSnapshot) {
  return snapshot.syncFormat !== 2 && (snapshot.sales.length > 0 || snapshot.labor.length > 0);
}

/** Every cloud mutation is an upsert by a durable ID, including partial retries. */
async function upload(userId: string, snapshot: ManagementSnapshot): Promise<boolean | string> {
  if (!canSync(userId) || !supabase || isLegacyDaily(snapshot)) return false;
  const client = supabase;
  const daily = snapshot.kind === 'daily';
  // Missing IDs in a new-format cache are also unsafe to guess after a lost ack.
  if (daily && snapshot.labor.some((row, index) => row.employeeName.trim() && !snapshot.laborIds?.[index])) {
    throw new OperationalError('operational.sync.invalidRecord');
  }
  try {
    const totalValue = snapshot.inventory.reduce((sum, line) => sum + Math.max(0, line.closingQuantity) * Math.max(0, line.unitCost), 0);
    const inventoryWrite = client.from('inventory_counts').upsert({
      id: snapshot.id, user_id: userId, location_id: snapshot.locationId, counted_at: snapshot.date,
      status: 'confirmed', lines: snapshot.inventory, total_value: Math.round(totalValue * 100) / 100,
      notes: snapshot.notes?.trim() || null,
    }, { onConflict: 'id' });
    if (!daily) {
      const { data, error } = await inventoryWrite.select('updated_at').single();
      return error ? false : data?.updated_at ?? true;
    }
    const inventory = await inventoryWrite;
    if (inventory.error) return false;

    const revenue = snapshot.sales.reduce((sum, line) => sum + Math.max(0, line.revenue), 0);
    const sales = await client.from('sales_imports').upsert({
      id: snapshot.id, user_id: userId, location_id: snapshot.locationId,
      period_start: snapshot.date, period_end: snapshot.date, source_name: 'Manager 24/7',
      column_mapping: {}, rows: snapshot.sales, total_revenue: Math.round(revenue * 100) / 100,
    }, { onConflict: 'id' });
    if (sales.error) return false;
    const laborRows = snapshot.labor.flatMap((row, index) => row.employeeName.trim() ? [{
      id: snapshot.laborIds![index], user_id: userId, location_id: snapshot.locationId,
      work_date: snapshot.date, employee_name: row.employeeName.trim(), role: row.role.trim() || null,
      hours: row.hours, hourly_cost: row.hourlyCost,
    }] : []);
    if (laborRows.length) {
      const labor = await client.from('labor_entries').upsert(laborRows, { onConflict: 'id' });
      if (labor.error) return false;
    }
    return true;
  } catch {
    return false;
  }
}

async function loadManagementSnapshotsUnlocked(userId: string, locationId?: string | null): Promise<ManagementSnapshot[]> {
  let snapshots = await readCache(userId);
  if (!canSync(userId)) return snapshots;
  for (const snapshot of snapshots.filter((item) => item.syncState !== 'synced')) {
    if (isLegacyDaily(snapshot)) {
      snapshot.syncIssue = 'legacy_daily_requires_review';
    } else {
      const acknowledgement = await upload(userId, snapshot);
      if (!acknowledgement) continue;
      snapshot.syncState = 'synced';
      if (typeof acknowledgement === 'string') {
        snapshot.updatedAt = acknowledgement;
        snapshot.inventoryServerUpdatedAt = acknowledgement;
      }
      delete snapshot.syncIssue;
    }
    // Acknowledgements never remove another pending record from the queue.
    snapshots = await writeCache(userId, snapshots);
  }
  return loadCloudInventory(userId, snapshots, locationId);
}

type InventoryCountRow = {
  id: string;
  user_id: string;
  location_id: string | null;
  counted_at: string;
  lines: unknown;
  notes: string | null;
  updated_at: string;
};

function isInventoryLine(value: unknown): value is InventoryLine {
  if (!value || typeof value !== 'object') return false;
  const line = value as Partial<InventoryLine>;
  return (line.catalogId === null || typeof line.catalogId === 'string') && typeof line.name === 'string'
    && [line.openingQuantity, line.purchasesQuantity, line.closingQuantity, line.unitCost].every(Number.isFinite);
}

function inventoryMatches(existing: ManagementSnapshot, row: InventoryCountRow, lines: InventoryLine[]) {
  return existing.date === row.counted_at && existing.locationId === row.location_id
    && (existing.notes?.trim() || null) === row.notes && existing.inventory.length === lines.length
    && existing.inventory.every((line, index) => {
      const other = lines[index];
      return isInventoryLine(line) && line.catalogId === other.catalogId && line.name === other.name
        && line.openingQuantity === other.openingQuantity && line.purchasesQuantity === other.purchasesQuantity
        && line.closingQuantity === other.closingQuantity && line.unitCost === other.unitCost;
    });
}

async function loadCloudInventory(userId: string, snapshots: ManagementSnapshot[], locationId?: string | null): Promise<ManagementSnapshot[]> {
  if (!supabase) return snapshots;
  const query = supabase.from('inventory_counts')
    .select('id,user_id,location_id,counted_at,lines,notes,updated_at')
    .eq('user_id', userId)
    .eq('status', 'confirmed');
  const scopedQuery = locationId === undefined ? query : locationId === null
    ? query.is('location_id', null) : query.eq('location_id', locationId);
  const result = await scopedQuery
    .order('counted_at', { ascending: false })
    .order('updated_at', { ascending: false })
    .limit(syncedHistoryLimit)
    .then(response => response, () => null);
  if (!result || result.error || !result.data?.length) return snapshots;

  const merged = new Map(snapshots.map(snapshot => [snapshot.id, snapshot]));
  let changed = false;
  for (const row of result.data as InventoryCountRow[]) {
    if (row.user_id !== userId || (locationId !== undefined && row.location_id !== locationId)
      || !Array.isArray(row.lines) || !row.lines.every(isInventoryLine)) continue;
    const existing = merged.get(row.id);
    // An inventory row alone cannot reconstruct a saved daily sales and labor snapshot.
    if (existing) {
      if (existing.kind !== 'inventory' || existing.syncState !== 'synced') continue;
      // Establish a server baseline for an older cache only when its saved values agree.
      const matchesLegacy = !existing.inventoryServerUpdatedAt && inventoryMatches(existing, row, row.lines);
      const currentTime = existing.inventoryServerUpdatedAt ?? existing.updatedAt;
      if (!matchesLegacy && Date.parse(row.updated_at) <= Date.parse(currentTime)) continue;
    }
    merged.set(row.id, {
      id: row.id, date: row.counted_at, locationId: row.location_id, inventory: row.lines,
      notes: row.notes ?? undefined, updatedAt: row.updated_at, inventoryServerUpdatedAt: row.updated_at,
      kind: 'inventory', syncFormat: 2, sales: [], labor: [], syncState: 'synced',
    });
    changed = true;
  }
  if (!changed) return snapshots;
  return writeCache(userId, [...merged.values()].sort((left, right) =>
    right.date.localeCompare(left.date) || Date.parse(right.updatedAt) - Date.parse(left.updatedAt)));
}

export const loadManagementSnapshots = (userId: string, options: { locationId?: string | null } = {}) =>
  withStorageLock(keyFor(userId), () => loadManagementSnapshotsUnlocked(userId, options.locationId));

export async function saveManagementSnapshot(
  userId: string,
  input: Omit<ManagementSnapshot, 'updatedAt' | 'syncState'>,
) {
  return withStorageLock(keyFor(userId), async () => {
    const previous = (await readCache(userId)).find((item) => item.id === input.id);
    if (previous && isLegacyDaily(previous)) {
      // Do not turn an ambiguous old partial upload into a new set of cloud rows.
      const unresolved = { ...previous, syncIssue: 'legacy_daily_requires_review' as const };
      await cache(userId, unresolved);
      return unresolved;
    }
    let snapshot: ManagementSnapshot = {
      ...input, kind: 'daily', syncFormat: 2,
      laborIds: input.labor.map((_, index) => previous?.laborIds?.[index] ?? uuid()),
      updatedAt: new Date().toISOString(), syncState: canSync(userId) ? 'pending' : 'local', syncIssue: undefined,
    };
    await cache(userId, snapshot);
    if (await upload(userId, snapshot)) {
      snapshot = { ...snapshot, syncState: 'synced' };
      await cache(userId, snapshot);
    }
    return snapshot;
  });
}

/** Persists a scheduled physical count without inventing empty sales or labor imports. */
export async function saveInventoryCount(
  userId: string,
  input: { id: string; date: string; inventory: InventoryLine[]; locationId: string | null; notes?: string },
) {
  return withStorageLock(keyFor(userId), async () => {
    let snapshot: ManagementSnapshot = {
      ...input, sales: [], labor: [], kind: 'inventory', syncFormat: 2,
      updatedAt: new Date().toISOString(), syncState: canSync(userId) ? 'pending' : 'local',
    };
    await cache(userId, snapshot);
    const acknowledgement = await upload(userId, snapshot);
    if (acknowledgement) {
      snapshot = { ...snapshot, syncState: 'synced', ...(typeof acknowledgement === 'string' ? {
        updatedAt: acknowledgement, inventoryServerUpdatedAt: acknowledgement,
      } : {}) };
      await cache(userId, snapshot);
    }
    return snapshot;
  });
}

export async function exportManagementData(userId: string) {
  return JSON.stringify({
    product: 'Manager 24/7',
    exportedAt: new Date().toISOString(),
    snapshots: await loadManagementSnapshots(userId),
  }, null, 2);
}
