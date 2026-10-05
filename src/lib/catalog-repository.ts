/**
 * MANAGER 24/7™ by PARADIM — proprietary software.
 * Copyright © 2026 PARADIM Operations SRL. All rights reserved.
 * Concept author and product director: Marius Paul Nemeșu.
 * See LICENSE-PROPRIETARY.md.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

import { parseAllergens } from '@/constants/allergens';
import { isDemoMode, supabase } from '@/lib/supabase';
import { enrichIngredientNutrition, normalizeIngredientNutrition } from '@/lib/nutrition';
import type {
  CatalogIngredient,
  CatalogIngredientDraft,
  CatalogPriceUpdate,
  PriceUnit,
  SupplierOffer,
} from '@/types/recipe';

const DEMO_KEY = 'professional_foodcost.demo_catalog.v1';

export function normalizeName(value: string): string {
  return value.trim().toLocaleLowerCase('ro-RO').replace(/\s+/g, ' ');
}

type DbCatalogRow = {
  id: string;
  name: string;
  purchase_price: number | string;
  price_unit: PriceUnit;
  package_quantity?: number | string | null;
  package_price?: number | string | null;
  default_loss_percent?: number | string | null;
  supplier?: string | null;
  price_source?: string | null;
  price_source_date?: string | null;
  notes?: string | null;
  allergens?: string[] | null;
  allergens_confirmed?: boolean | null;
  additives?: string[] | null;
  nutrition?: unknown;
  active: boolean;
  updated_at: string;
  ingredient_supplier_offers?: DbSupplierOffer[];
};

type DbSupplierOffer = {
  id: string;
  supplier_name: string;
  unit_price: number | string;
  price_unit: PriceUnit;
  package_quantity: number | string | null;
  package_price: number | string | null;
  source: string | null;
  source_date: string | null;
  is_active: boolean;
  updated_at: string;
};

const number = (value: number | string | null | undefined) => Number(value || 0);

function mapOffer(row: DbSupplierOffer): SupplierOffer {
  return {
    id: row.id,
    supplierName: row.supplier_name,
    unitPrice: number(row.unit_price),
    priceUnit: row.price_unit,
    packageQuantity: row.package_quantity === null ? null : number(row.package_quantity),
    packagePrice: row.package_price === null ? null : number(row.package_price),
    source: row.source,
    sourceDate: row.source_date,
    isActive: row.is_active,
    updatedAt: row.updated_at,
  };
}

function mapCatalog(row: DbCatalogRow): CatalogIngredient {
  return {
    id: row.id,
    name: row.name,
    purchasePrice: number(row.purchase_price),
    priceUnit: row.price_unit,
    packageQuantity: row.package_quantity === null || row.package_quantity === undefined
      ? null : number(row.package_quantity),
    packagePrice: row.package_price === null || row.package_price === undefined
      ? null : number(row.package_price),
    defaultLossPercent: number(row.default_loss_percent),
    supplier: row.supplier ?? null,
    priceSource: row.price_source ?? null,
    priceSourceDate: row.price_source_date ?? null,
    offers: (row.ingredient_supplier_offers ?? []).map(mapOffer)
      .sort((a, b) => a.unitPrice - b.unitPrice),
    notes: row.notes ?? null,
    allergens: parseAllergens(row.allergens),
    allergensConfirmed: Boolean(row.allergens_confirmed),
    additives: Array.isArray(row.additives) ? row.additives.filter((item) => typeof item === 'string') : [],
    nutrition: normalizeIngredientNutrition(row.nutrition),
    active: row.active,
    updatedAt: row.updated_at,
  };
}

const demoSeed: CatalogIngredient[] = [
  { id: 'cat-pui', name: 'Piept de pui', purchasePrice: 29, priceUnit: 'kg', packageQuantity: null, packagePrice: null, defaultLossPercent: 12, supplier: 'Metro', notes: null, allergens: [], active: true, updatedAt: new Date().toISOString() },
  { id: 'cat-unt', name: 'Unt 82%', purchasePrice: 46, priceUnit: 'kg', packageQuantity: null, packagePrice: null, defaultLossPercent: 0, supplier: 'Metro', notes: null, allergens: ['milk'], active: true, updatedAt: new Date().toISOString() },
  { id: 'cat-faina', name: 'Făină 000', purchasePrice: 3.4, priceUnit: 'kg', packageQuantity: 25, packagePrice: 85, defaultLossPercent: 0, supplier: 'Metro', notes: null, allergens: ['gluten'], active: true, updatedAt: new Date().toISOString() },
  { id: 'cat-smantana', name: 'Smântână 32%', purchasePrice: 17, priceUnit: 'l', packageQuantity: null, packagePrice: null, defaultLossPercent: 0, supplier: 'Metro', notes: null, allergens: ['milk'], active: true, updatedAt: new Date().toISOString() },
];

async function getDemoCatalog(): Promise<CatalogIngredient[]> {
  const value = await AsyncStorage.getItem(DEMO_KEY);
  if (value) return JSON.parse(value) as CatalogIngredient[];
  await AsyncStorage.setItem(DEMO_KEY, JSON.stringify(demoSeed));
  return demoSeed;
}

async function setDemoCatalog(entries: CatalogIngredient[]) {
  await AsyncStorage.setItem(DEMO_KEY, JSON.stringify(entries));
}

async function currentUserId() {
  if (!supabase) throw new Error('missing-client');
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw error ?? new Error('missing-session');
  return data.user.id;
}

export async function listCatalog(): Promise<CatalogIngredient[]> {
  if (isDemoMode || !supabase) return getDemoCatalog();
  const { data, error } = await supabase
    .from('ingredient_catalog')
    .select('id, name, purchase_price, price_unit, package_quantity, package_price, default_loss_percent, supplier, price_source, price_source_date, notes, allergens, allergens_confirmed, additives, nutrition, active, updated_at, ingredient_supplier_offers(*)')
    .order('name', { ascending: true });
  if (error) throw error;
  return (data as DbCatalogRow[]).map(mapCatalog);
}

export async function saveCatalogIngredient(
  draft: CatalogIngredientDraft,
): Promise<CatalogIngredient> {
  draft = enrichIngredientNutrition(draft);
  if (isDemoMode || !supabase) {
    const entries = await getDemoCatalog();
    const entry: CatalogIngredient = {
      ...draft,
      id: draft.id ?? `cat-${Date.now()}`,
      updatedAt: new Date().toISOString(),
    };
    await setDemoCatalog([entry, ...entries.filter((item) => item.id !== entry.id)]
      .sort((a, b) => a.name.localeCompare(b.name, 'ro-RO')));
    return entry;
  }

  const userId = await currentUserId();
  const payload = {
    user_id: userId,
    name: draft.name.trim(),
    normalized_name: normalizeName(draft.name),
    purchase_price: draft.purchasePrice,
    price_unit: draft.priceUnit,
    package_quantity: draft.packageQuantity,
    package_price: draft.packagePrice,
    default_loss_percent: draft.defaultLossPercent,
    supplier: draft.supplier?.trim() || null,
    price_source: draft.priceSource?.trim() || null,
    price_source_date: draft.priceSourceDate || null,
    notes: draft.notes?.trim() || null,
    allergens: draft.allergens,
    allergens_confirmed: draft.allergensConfirmed ?? false,
    additives: draft.additives ?? [],
    nutrition: normalizeIngredientNutrition(draft.nutrition),
    active: draft.active,
    updated_at: new Date().toISOString(),
  };

  const query = draft.id
    ? supabase.from('ingredient_catalog').upsert({ ...payload, id: draft.id })
    : supabase.from('ingredient_catalog').upsert(payload, { onConflict: 'user_id,normalized_name' });

  const { data, error } = await query
    .select('id, name, purchase_price, price_unit, package_quantity, package_price, default_loss_percent, supplier, price_source, price_source_date, notes, allergens, allergens_confirmed, additives, nutrition, active, updated_at')
    .single();
  if (error) throw error;
  const saved = data as DbCatalogRow;
  if (draft.offers) {
    const { error: deleteError } = await supabase
      .from('ingredient_supplier_offers')
      .delete()
      .eq('catalog_id', saved.id);
    if (deleteError) throw deleteError;
    const offers = draft.offers.filter((offer) => offer.supplierName.trim());
    if (offers.length) {
      const { error: offerError } = await supabase.from('ingredient_supplier_offers').insert(
        offers.map((offer) => ({
          id: offer.id.startsWith('offer-') ? undefined : offer.id,
          user_id: userId,
          catalog_id: saved.id,
          supplier_name: offer.supplierName.trim(),
          unit_price: offer.unitPrice,
          price_unit: offer.priceUnit,
          package_quantity: offer.packageQuantity,
          package_price: offer.packagePrice,
          source: offer.source?.trim() || null,
          source_date: offer.sourceDate || null,
          is_active: offer.isActive,
        })),
      );
      if (offerError) throw offerError;
    }
  }
  const mapped = mapCatalog(saved);
  return {
    ...mapped,
    offers: (draft.offers ?? []).map((offer) => ({
      ...offer,
      updatedAt: new Date().toISOString(),
    })),
  };
}

export async function deleteCatalogIngredient(catalogId: string): Promise<void> {
  if (isDemoMode || !supabase) {
    const entries = await getDemoCatalog();
    await setDemoCatalog(entries.filter((entry) => entry.id !== catalogId));
    return;
  }
  const { error } = await supabase.from('ingredient_catalog').delete().eq('id', catalogId);
  if (error) throw error;
}

/** Aplică prețuri noi pentru mai multe ingrediente deodată (import listă furnizor). */
export async function applyPriceUpdates(
  updates: readonly CatalogPriceUpdate[],
): Promise<void> {
  if (!updates.length) return;

  if (isDemoMode || !supabase) {
    const entries = await getDemoCatalog();
    const byId = new Map(updates.map((update) => [update.id, update.purchasePrice]));
    await setDemoCatalog(entries.map((entry) => (
      byId.has(entry.id)
        ? { ...entry, purchasePrice: byId.get(entry.id)!, updatedAt: new Date().toISOString() }
        : entry
    )));
    return;
  }

  const now = new Date().toISOString();
  for (const update of updates) {
    const { error } = await supabase
      .from('ingredient_catalog')
      .update({
        purchase_price: update.purchasePrice,
        supplier: update.supplier ?? undefined,
        price_source: update.source ?? null,
        price_source_date: update.sourceDate ?? null,
        updated_at: now,
      })
      .eq('id', update.id);
    if (error) throw error;
  }
}

export type PriceHistoryEntry = {
  id: string;
  oldPrice: number | null;
  newPrice: number;
  deltaPercent: number | null;
  recordedAt: string;
  source: string | null;
  sourceDate: string | null;
  supplier: string | null;
};

/** Ultimele schimbări de preț ale unui ingredient — populate automat de un trigger. */
export async function listPriceHistory(catalogId: string, limit = 10): Promise<PriceHistoryEntry[]> {
  if (isDemoMode || !supabase) return [];
  const { data, error } = await supabase
    .from('ingredient_price_history')
    .select('id, old_price, new_price, delta_percent, recorded_at, source, source_date, supplier')
    .eq('catalog_id', catalogId)
    .order('recorded_at', { ascending: false })
    .limit(limit);
  if (error) return [];
  return (data ?? []).map((row) => ({
    id: row.id as string,
    oldPrice: row.old_price === null ? null : Number(row.old_price),
    newPrice: Number(row.new_price),
    deltaPercent: row.delta_percent === null ? null : Number(row.delta_percent),
    recordedAt: row.recorded_at as string,
    source: row.source as string | null,
    sourceDate: row.source_date as string | null,
    supplier: row.supplier as string | null,
  }));
}

/** Creează dintr-o dată mai multe ingrediente noi în catalog, dintr-un import de listă de prețuri. */
export async function importNewCatalogItems(
  items: readonly {
    name: string;
    purchasePrice: number;
    priceUnit: PriceUnit;
    supplier?: string | null;
    notes?: string | null;
  }[],
): Promise<CatalogIngredient[]> {
  const created: CatalogIngredient[] = [];
  for (const item of items) {
    created.push(await saveCatalogIngredient({
      name: item.name,
      purchasePrice: item.purchasePrice,
      priceUnit: item.priceUnit,
      packageQuantity: null,
      packagePrice: null,
      defaultLossPercent: 0,
      supplier: item.supplier ?? null,
      priceSource: item.supplier ? 'supplier_import' : null,
      priceSourceDate: new Date().toISOString().slice(0, 10),
      offers: item.supplier ? [{
        id: `offer-${Date.now()}-${created.length}`,
        supplierName: item.supplier,
        unitPrice: item.purchasePrice,
        priceUnit: item.priceUnit,
        packageQuantity: null,
        packagePrice: null,
        source: 'supplier_import',
        sourceDate: new Date().toISOString().slice(0, 10),
        isActive: true,
      }] : [],
      notes: item.notes ?? null,
      allergens: [],
      allergensConfirmed: false,
      additives: [],
      nutrition: normalizeIngredientNutrition(null),
      active: true,
    }));
  }
  return created;
}
