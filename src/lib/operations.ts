/**
 * MANAGER 24/7™ by PARADIM — proprietary software.
 * Copyright © 2026 PARADIM Operations SRL. All rights reserved.
 * Concept author and product director: Marius Paul Nemeșu.
 * See LICENSE-PROPRIETARY.md.
 */

import { normalizeQuantity } from '@/lib/calculations';
import type { BulkBatchTotals, OperationalLine } from '@/types/operations';
import type { CatalogIngredient, PriceUnit, Recipe } from '@/types/recipe';

const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const quantity = (value: number) => Math.round((value + Number.EPSILON) * 1000) / 1000;

export type MenuClass = 'star' | 'plowhorse' | 'puzzle' | 'dog';

export type MenuEngineeringItem = {
  recipe: Recipe;
  sold: number;
  popularityPercent: number;
  contributionPerPortion: number;
  totalContribution: number;
  classification: MenuClass;
};

export function buildMenuEngineering(
  recipes: readonly Recipe[],
  sales: Readonly<Record<string, number>>,
): MenuEngineeringItem[] {
  const candidates = recipes.filter((recipe) => !recipe.isSubRecipe && recipe.totals.contributionMargin !== null
    && Number.isFinite(recipe.totals.contributionMargin) && Number.isFinite(sales[recipe.id]) && sales[recipe.id] >= 0);
  const totalSold = candidates.reduce((sum, recipe) => sum + Math.max(0, sales[recipe.id] ?? 0), 0);
  const popularityThreshold = candidates.length ? (70 / candidates.length) : 0;
  const averageContribution = candidates.length
    ? candidates.reduce((sum, recipe) => sum + (recipe.totals.contributionMargin ?? 0), 0) / candidates.length
    : 0;

  return candidates.map((recipe) => {
    const sold = Math.max(0, sales[recipe.id] ?? 0);
    const popularityPercent = totalSold > 0 ? sold / totalSold * 100 : 0;
    const contributionPerPortion = recipe.totals.contributionMargin ?? 0;
    const popular = popularityPercent >= popularityThreshold;
    const profitable = contributionPerPortion >= averageContribution;
    const classification: MenuClass = popular
      ? profitable ? 'star' : 'plowhorse'
      : profitable ? 'puzzle' : 'dog';
    return {
      recipe,
      sold,
      popularityPercent: Math.round(popularityPercent * 10) / 10,
      contributionPerPortion,
      totalContribution: money(sold * contributionPerPortion),
      classification,
    };
  }).sort((a, b) => b.totalContribution - a.totalContribution);
}

export type ProductionRequest = { recipeId: string; portions: number };

export type ShoppingLine = {
  key: string;
  name: string;
  quantity: number;
  unit: PriceUnit;
  supplier: string | null;
  cost: number;
};

export function buildShoppingList(
  recipes: readonly Recipe[],
  catalog: readonly CatalogIngredient[],
  requests: readonly ProductionRequest[],
): ShoppingLine[] {
  const recipeById = new Map(recipes.map((recipe) => [recipe.id, recipe]));
  const catalogById = new Map(catalog.map((entry) => [entry.id, entry]));
  const grouped = new Map<string, ShoppingLine>();

  const collectIngredients = (recipe: Recipe, scale: number, ancestors: ReadonlySet<string>) => {
    if (ancestors.has(recipe.id)) return;
    const path = new Set([...ancestors, recipe.id]);
    for (const ingredient of recipe.ingredients) {
      if (ingredient.kind === 'sub_recipe') {
        const source = ingredient.subRecipeId ? recipeById.get(ingredient.subRecipeId) : undefined;
        if (!source || !Number.isFinite(source.yieldQuantity) || source.yieldQuantity <= 0) continue;
        const needed = normalizeQuantity(ingredient.quantity * scale, ingredient.unit, source.yieldUnit);
        if (needed === null) continue;
        const gross = needed / Math.max(0.01, 1 - ingredient.lossPercent / 100);
        collectIngredients(source, gross / source.yieldQuantity, path);
        continue;
      }
      const normalized = normalizeQuantity(ingredient.quantity * scale, ingredient.unit, ingredient.priceUnit);
      if (normalized === null) continue;
      const gross = normalized / Math.max(0.01, 1 - ingredient.lossPercent / 100);
      const catalogEntry = ingredient.catalogId ? catalogById.get(ingredient.catalogId) : undefined;
      const key = ingredient.catalogId ?? `${ingredient.name.toLocaleLowerCase('ro-RO')}|${ingredient.priceUnit}`;
      const current = grouped.get(key) ?? {
        key,
        name: ingredient.name,
        quantity: 0,
        unit: ingredient.priceUnit,
        supplier: catalogEntry?.supplier ?? null,
        cost: 0,
      };
      current.quantity = quantity(current.quantity + gross);
      current.cost = money(current.cost + gross * ingredient.purchasePrice);
      grouped.set(key, current);
    }
  };

  for (const request of requests) {
    const recipe = recipeById.get(request.recipeId);
    if (!recipe || !Number.isFinite(request.portions) || request.portions <= 0) continue;
    collectIngredients(recipe, request.portions / Math.max(1, recipe.servings), new Set());
  }

  return [...grouped.values()].sort((a, b) => (
    (a.supplier ?? '').localeCompare(b.supplier ?? '', 'ro-RO') || a.name.localeCompare(b.name, 'ro-RO')
  ));
}

export type BulkCostResult = {
  totalCost: number;
  portionCost: number;
  servingWeight: number;
};

export function calculateBulkCost(
  recipe: Recipe,
  issuedQuantities: Readonly<Record<string, number>>,
  portions: number,
  servingWeight: number,
): BulkCostResult {
  const totalCost = money(recipe.ingredients.reduce((sum, ingredient) => {
    const issued = Math.max(0, issuedQuantities[ingredient.id] ?? 0);
    const normalized = normalizeQuantity(issued, ingredient.unit, ingredient.priceUnit);
    return sum + (normalized ?? 0) * Math.max(0, ingredient.purchasePrice);
  }, 0));
  return {
    totalCost,
    portionCost: money(totalCost / Math.max(1, portions)),
    servingWeight: Math.max(0, servingWeight),
  };
}

export function calculateOperationalLineCost(
  quantityValue: number,
  unit: OperationalLine['unit'],
  purchasePrice: number,
  priceUnit: OperationalLine['priceUnit'],
): number {
  const normalized = normalizeQuantity(Math.max(0, quantityValue), unit, priceUnit);
  return money((normalized ?? 0) * Math.max(0, purchasePrice));
}

export function recalculateOperationalLine(line: OperationalLine): OperationalLine {
  return {
    ...line,
    quantity: Math.max(0, line.quantity),
    purchasePrice: Math.max(0, line.purchasePrice),
    lossPercent: clampLossPercent(line.lossPercent ?? 0),
    cost: calculateOperationalLineCost(line.quantity, line.unit, line.purchasePrice, line.priceUnit),
  };
}

export function clampLossPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(99, Math.max(0, value));
}

/** Cantitatea brută necesară pentru a obține cantitatea netă după procesare. */
export function calculateBulkGrossQuantity(netQuantity: number, lossPercent: number): number {
  const safeNet = Math.max(0, netQuantity);
  const yieldRate = Math.max(0.01, 1 - clampLossPercent(lossPercent) / 100);
  return quantity(safeNet / yieldRate);
}

/** Recalculează un ingredient bulk incluzând scăzământul în cost. */
export function recalculateBulkOperationalLine(line: OperationalLine): OperationalLine {
  const lossPercent = clampLossPercent(line.lossPercent ?? 0);
  const grossQuantity = calculateBulkGrossQuantity(line.quantity, lossPercent);
  return {
    ...line,
    quantity: Math.max(0, line.quantity),
    purchasePrice: Math.max(0, line.purchasePrice),
    lossPercent,
    cost: calculateOperationalLineCost(grossQuantity, line.unit, line.purchasePrice, line.priceUnit),
  };
}

export function calculateBulkBatchTotals({
  lines,
  finalWeightGrams,
  portions,
  salePriceGross,
  vatPercent,
}: {
  lines: readonly OperationalLine[];
  finalWeightGrams: number;
  portions: number;
  salePriceGross: number;
  vatPercent: number;
}): BulkBatchTotals {
  const safePortions = Math.max(1, portions);
  const totalCost = money(lines.reduce((sum, line) => (
    sum + recalculateBulkOperationalLine(line).cost
  ), 0));
  const portionCost = money(totalCost / safePortions);
  const safeWeight = Math.max(0, finalWeightGrams);
  const costPerKg = safeWeight > 0 ? money(totalCost / (safeWeight / 1000)) : null;
  const salePriceNet = Math.max(0, salePriceGross) / (1 + Math.max(0, vatPercent) / 100);
  const foodCostPercent = salePriceNet > 0
    ? Math.round((portionCost / salePriceNet * 100 + Number.EPSILON) * 10) / 10
    : null;
  return {
    totalCost,
    portionCost,
    costPerKg,
    foodCostPercent,
    servingWeightGrams: safeWeight > 0 ? quantity(safeWeight / safePortions) : null,
  };
}

export function buildShoppingListMessage({
  title,
  lines,
  totalLabel,
  totalValue,
}: {
  title: string;
  lines: readonly ShoppingLine[];
  totalLabel: string;
  totalValue: string;
}): string {
  const grouped = new Map<string, ShoppingLine[]>();
  for (const line of lines) {
    const supplier = line.supplier?.trim() || '—';
    grouped.set(supplier, [...(grouped.get(supplier) ?? []), line]);
  }
  const sections = [...grouped.entries()].map(([supplier, supplierLines]) => [
    `\n${supplier}`,
    ...supplierLines.map((line) => `• ${line.name}: ${line.quantity} ${line.unit}`),
  ].join('\n'));
  return [title, ...sections, `\n${totalLabel}: ${totalValue}`].join('\n').trim();
}
