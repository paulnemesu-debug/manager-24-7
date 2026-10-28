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
  // The history display limit must never evict the only durable copy of an intent.
  let synced = 0;
  const retained = snapshots.filter((item) => item.syncState !== 'synced' || ++synced <= 24);
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
async function upload(userId: string, snapshot: ManagementSnapshot): Promise<boolean> {
  if (!canSync(userId) || !supabase || isLegacyDaily(snapshot)) return false;
  const client = supabase;
  const daily = snapshot.kind === 'daily';
  // Missing IDs in a new-format cache are also unsafe to guess after a lost ack.
  if (daily && snapshot.labor.some((row, index) => row.employeeName.trim() && !snapshot.laborIds?.[index])) {
    throw new OperationalError('operational.sync.invalidRecord');
  }
  try {
    const totalValue = snapshot.inventory.reduce((sum, line) => sum + Math.max(0, line.closingQuantity) * Math.max(0, line.unitCost), 0);
    const inventory = await client.from('inventory_counts').upsert({
      id: snapshot.id, user_id: userId, location_id: snapshot.locationId, counted_at: snapshot.date,
      status: 'confirmed', lines: snapshot.inventory, total_value: Math.round(totalValue * 100) / 100,
      notes: snapshot.notes?.trim() || null,
    }, { onConflict: 'id' });
    if (inventory.error) return false;
    if (!daily) return true;

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

async function loadManagementSnapshotsUnlocked(userId: string): Promise<ManagementSnapshot[]> {
  let snapshots = await readCache(userId);
  if (!canSync(userId)) return snapshots;
  for (const snapshot of snapshots.filter((item) => item.syncState !== 'synced')) {
    if (isLegacyDaily(snapshot)) {
      snapshot.syncIssue = 'legacy_daily_requires_review';
    } else if (await upload(userId, snapshot)) {
      snapshot.syncState = 'synced';
      delete snapshot.syncIssue;
    } else continue;
    // Acknowledgements never remove another pending record from the queue.
    snapshots = await writeCache(userId, snapshots);
  }
  return snapshots;
}

export const loadManagementSnapshots = (userId: string) =>
  withStorageLock(keyFor(userId), () => loadManagementSnapshotsUnlocked(userId));

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
    if (await upload(userId, snapshot)) {
      snapshot = { ...snapshot, syncState: 'synced' };
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
