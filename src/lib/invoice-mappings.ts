/**
 * MANAGER 24/7™ by PARADIM — proprietary software.
 * Copyright © 2026 PARADIM Operations SRL. All rights reserved.
 * Concept author and product director: Marius Paul Nemeșu.
 * See LICENSE-PROPRIETARY.md.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

import { invoiceMappingKey, normalizeInvoiceSupplier, type InvoiceProductMapping } from '@/lib/invoice-import';
import { normalizeText } from '@/lib/price-import';
import { isDemoMode, supabase } from '@/lib/supabase';
import { withStorageLock } from '@/lib/storage-lock';

const keyFor = (userId: string) => `manager247.invoice_product_mappings.v1.${userId}`;

type StoredMapping = InvoiceProductMapping & { pending?: boolean; confirmedAt?: string };

async function readLocal(userId: string): Promise<StoredMapping[]> {
  try {
    const raw = await AsyncStorage.getItem(keyFor(userId));
    const parsed = raw ? JSON.parse(raw) as unknown : [];
    return Array.isArray(parsed) ? parsed.filter((item): item is StoredMapping => item && typeof item === 'object'
      && typeof item.supplier === 'string' && typeof item.sourceName === 'string'
      && typeof item.catalogId === 'string' && item.catalogId.length > 0) : [];
  } catch {
    return [];
  }
}

async function writeLocal(userId: string, mappings: readonly StoredMapping[]) {
  await AsyncStorage.setItem(keyFor(userId), JSON.stringify(mappings));
}

async function syncPending(userId: string, mappings: StoredMapping[]): Promise<StoredMapping[]> {
  const pending = mappings.filter((item) => item.pending);
  if (!pending.length || isDemoMode || !supabase || userId === 'demo') return mappings;
  try {
    const { error } = await supabase.from('supplier_product_mappings').upsert(pending.map((item) => ({
      user_id: userId, supplier: normalizeInvoiceSupplier(item.supplier), source_name: item.sourceName,
      normalized_name: normalizeText(item.sourceName), catalog_id: item.catalogId,
      last_confirmed_at: item.confirmedAt ?? new Date().toISOString(),
    })), { onConflict: 'user_id,supplier,normalized_name' });
    if (error) return mappings;
    const synced = mappings.map((item) => ({ ...item, pending: false }));
    await writeLocal(userId, synced);
    return synced;
  } catch { return mappings; }
}

export async function loadInvoiceProductMappings(userId: string): Promise<InvoiceProductMapping[]> {
  return withStorageLock(keyFor(userId), async () => {
  const local = await readLocal(userId);
  if (isDemoMode || !supabase || userId === 'demo') return local;
  try {
  const { data, error } = await supabase
    .from('supplier_product_mappings')
    .select('supplier, source_name, normalized_name, catalog_id, last_confirmed_at')
    .eq('user_id', userId)
    .order('last_confirmed_at', { ascending: true });
  if (error) return local;
  const remote = (data ?? []).map((row) => ({
    supplier: String(row.supplier),
    sourceName: String(row.source_name),
    normalizedName: String(row.normalized_name),
    catalogId: String(row.catalog_id),
    confirmedAt: String(row.last_confirmed_at),
  }));
  const merged = new Map<string, StoredMapping>(remote.map((item) => [invoiceMappingKey(item.supplier, item.sourceName), item]));
  local.filter((item) => item.pending).forEach((item) => merged.set(invoiceMappingKey(item.supplier, item.sourceName), item));
  const next = [...merged.values()];
  await writeLocal(userId, next);
  return syncPending(userId, next);
  } catch { return local; }
  });
}

export async function rememberInvoiceProductMappings(
  userId: string,
  mappings: readonly InvoiceProductMapping[],
): Promise<void> {
  if (!mappings.length) return;
  return withStorageLock(keyFor(userId), async () => {
  const current = await readLocal(userId);
  const merged = new Map(current.map((item) => [invoiceMappingKey(item.supplier, item.sourceName), item]));
  mappings.forEach((item) => merged.set(invoiceMappingKey(item.supplier, item.sourceName), {
    ...item, normalizedName: normalizeText(item.sourceName), pending: true, confirmedAt: new Date().toISOString(),
  }));
  const next = [...merged.values()];
  await writeLocal(userId, next);
  await syncPending(userId, next);
  });
}
