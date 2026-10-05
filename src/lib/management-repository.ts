/**
 * MANAGER 24/7™ by PARADIM — proprietary software.
 * Copyright © 2026 PARADIM Operations SRL. All rights reserved.
 * Concept author and product director: Marius Paul Nemeșu.
 * See LICENSE-PROPRIETARY.md.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

import { isDemoMode, isSupabaseConfigured, supabase } from '@/lib/supabase';
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
};

const keyFor = (userId: string) => `manager247.management.v1.${userId}`;
const uuid = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (character) => {
  const random = Math.floor(Math.random() * 16);
  return (character === 'x' ? random : (random & 3) | 8).toString(16);
});

export const createManagementId = uuid;

export async function loadManagementSnapshots(userId: string): Promise<ManagementSnapshot[]> {
  const raw = await AsyncStorage.getItem(keyFor(userId));
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function cache(userId: string, snapshot: ManagementSnapshot) {
  const current = await loadManagementSnapshots(userId);
  const next = [snapshot, ...current.filter((item) => item.id !== snapshot.id)].slice(0, 24);
  await AsyncStorage.setItem(keyFor(userId), JSON.stringify(next));
}

export async function saveManagementSnapshot(
  userId: string,
  input: Omit<ManagementSnapshot, 'updatedAt' | 'syncState'>,
) {
  const canSync = userId !== 'demo' && !isDemoMode && isSupabaseConfigured && Boolean(supabase);
  let snapshot: ManagementSnapshot = {
    ...input,
    updatedAt: new Date().toISOString(),
    syncState: canSync ? 'pending' : 'local',
  };
  await cache(userId, snapshot);
  if (!canSync || !supabase) return snapshot;

  const inventoryValue = input.inventory.reduce((sum, line) => sum + Math.max(0, line.closingQuantity) * Math.max(0, line.unitCost), 0);
  const revenue = input.sales.reduce((sum, line) => sum + Math.max(0, line.revenue), 0);
  const { error: inventoryError } = await supabase.from('inventory_counts').upsert({
    id: input.id,
    user_id: userId,
    location_id: input.locationId,
    counted_at: input.date,
    status: 'confirmed',
    lines: input.inventory,
    total_value: Math.round(inventoryValue * 100) / 100,
  }, { onConflict: 'id' });
  const { error: salesError } = await supabase.from('sales_imports').insert({
    user_id: userId,
    location_id: input.locationId,
    period_start: input.date,
    period_end: input.date,
    source_name: 'Manager 24/7',
    column_mapping: {},
    rows: input.sales,
    total_revenue: Math.round(revenue * 100) / 100,
  });
  const laborRows = input.labor.filter((row) => row.employeeName.trim()).map((row) => ({
    user_id: userId,
    location_id: input.locationId,
    work_date: input.date,
    employee_name: row.employeeName.trim(),
    role: row.role.trim() || null,
    hours: row.hours,
    hourly_cost: row.hourlyCost,
  }));
  const laborResult = laborRows.length ? await supabase.from('labor_entries').insert(laborRows) : { error: null };
  if (inventoryError || salesError || laborResult.error) return snapshot;
  snapshot = { ...snapshot, syncState: 'synced' };
  await cache(userId, snapshot);
  return snapshot;
}

/** Persists a scheduled physical count without inventing empty sales or labor imports. */
export async function saveInventoryCount(
  userId: string,
  input: { id: string; date: string; inventory: InventoryLine[]; locationId: string | null; notes?: string },
) {
  const canSync = userId !== 'demo' && !isDemoMode && isSupabaseConfigured && Boolean(supabase);
  let snapshot: ManagementSnapshot = {
    id: input.id,
    date: input.date,
    inventory: input.inventory,
    sales: [],
    labor: [],
    locationId: input.locationId,
    updatedAt: new Date().toISOString(),
    syncState: canSync ? 'pending' : 'local',
  };
  await cache(userId, snapshot);
  if (!canSync || !supabase) return snapshot;
  const totalValue = input.inventory.reduce(
    (sum, line) => sum + Math.max(0, line.closingQuantity) * Math.max(0, line.unitCost),
    0,
  );
  const { error } = await supabase.from('inventory_counts').upsert({
    id: input.id,
    user_id: userId,
    location_id: input.locationId,
    counted_at: input.date,
    status: 'confirmed',
    lines: input.inventory,
    total_value: Math.round(totalValue * 100) / 100,
    notes: input.notes?.trim() || null,
  }, { onConflict: 'id' });
  if (!error) {
    snapshot = { ...snapshot, syncState: 'synced' };
    await cache(userId, snapshot);
  }
  return snapshot;
}

export async function exportManagementData(userId: string) {
  return JSON.stringify({
    product: 'Manager 24/7',
    exportedAt: new Date().toISOString(),
    snapshots: await loadManagementSnapshots(userId),
  }, null, 2);
}
