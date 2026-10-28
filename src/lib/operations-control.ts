/**
 * MANAGER 24/7™ by PARADIM — proprietary software.
 * Copyright © 2026 PARADIM Operations SRL. All rights reserved.
 * Concept author and product director: Marius Paul Nemeșu.
 * See LICENSE-PROPRIETARY.md.
 */

import type { CatalogIngredient } from '@/types/recipe';
import type {
  InventoryFrequency,
  RestockSuggestion,
  StockObservation,
  StockPolicy,
  SupplierOrderLine,
  WasteEntry,
} from '@/types/operations-control';

const round = (value: number, decimals = 2) => {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
};

export function buildRestockSuggestions(
  catalog: readonly CatalogIngredient[],
  policies: readonly StockPolicy[],
  observations: readonly StockObservation[],
  locationId: string | null,
): RestockSuggestion[] {
  const policyByCatalog = new Map(
    policies
      .filter((policy) => policy.locationId === locationId)
      .map((policy) => [policy.catalogId, policy]),
  );
  const observationByCatalog = new Map(observations.map((item) => [item.catalogId, Math.max(0, item.onHand)]));

  return catalog.flatMap((ingredient) => {
    const policy = policyByCatalog.get(ingredient.id);
    if (!ingredient.active || !policy || policy.targetQuantity <= 0) return [];
    const onHand = observationByCatalog.get(ingredient.id) ?? 0;
    if (onHand > policy.minimumQuantity) return [];
    const orderQuantity = round(Math.max(0, policy.targetQuantity - onHand), 3);
    if (orderQuantity <= 0) return [];
    return [{
      catalogId: ingredient.id,
      name: ingredient.name,
      supplier: ingredient.supplier?.trim() || 'Furnizor nealocat',
      unit: ingredient.priceUnit,
      onHand,
      minimumQuantity: policy.minimumQuantity,
      targetQuantity: policy.targetQuantity,
      orderQuantity,
      unitCost: Math.max(0, ingredient.purchasePrice),
      estimatedCost: round(orderQuantity * Math.max(0, ingredient.purchasePrice)),
      storageZone: policy.storageZone.trim(),
    }];
  }).sort((left, right) => (
    left.supplier.localeCompare(right.supplier, 'ro-RO') || left.name.localeCompare(right.name, 'ro-RO')
  ));
}

export function groupRestockBySupplier(suggestions: readonly RestockSuggestion[]) {
  const grouped = new Map<string, { lines: SupplierOrderLine[]; totalEstimated: number }>();
  suggestions.forEach((item) => {
    const current = grouped.get(item.supplier) ?? { lines: [], totalEstimated: 0 };
    current.lines.push({
      catalogId: item.catalogId,
      name: item.name,
      unit: item.unit,
      orderQuantity: item.orderQuantity,
      unitCost: item.unitCost,
      estimatedCost: item.estimatedCost,
      storageZone: item.storageZone,
    });
    current.totalEstimated = round(current.totalEstimated + item.estimatedCost);
    grouped.set(item.supplier, current);
  });
  return [...grouped.entries()].map(([supplier, value]) => ({ supplier, ...value }));
}

export function wasteValue(quantity: number, unitCost: number) {
  return round(Math.max(0, quantity) * Math.max(0, unitCost));
}

export function totalWasteValue(entries: readonly Pick<WasteEntry, 'value'>[]) {
  return round(entries.reduce((sum, entry) => sum + Math.max(0, entry.value), 0));
}

function localDate(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, Math.max(0, month - 1), day || 1, 12, 0, 0, 0);
}

function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function nextInventoryDueDate({
  from,
  frequency,
  weekday,
  monthDay,
}: {
  from: string;
  frequency: InventoryFrequency;
  weekday: number | null;
  monthDay: number | null;
}) {
  const date = localDate(from);
  if (frequency === 'weekly') {
    const target = Math.min(6, Math.max(0, weekday ?? 1));
    let add = (target - date.getDay() + 7) % 7;
    if (add === 0) add = 7;
    date.setDate(date.getDate() + add);
    return dateKey(date);
  }
  const targetDay = Math.min(28, Math.max(1, monthDay ?? 1));
  date.setMonth(date.getMonth() + 1, targetDay);
  return dateKey(date);
}
