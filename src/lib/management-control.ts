/**
 * MANAGER 24/7™ by PARADIM — proprietary software.
 * Copyright © 2026 PARADIM Operations SRL. All rights reserved.
 * Concept author and product director: Marius Paul Nemeșu.
 * See LICENSE-PROPRIETARY.md.
 */

export type InventoryLine = {
  catalogId: string | null;
  name: string;
  openingQuantity: number;
  purchasesQuantity: number;
  closingQuantity: number;
  unitCost: number;
};

export type SalesLine = {
  recipeId: string | null;
  name: string;
  quantity: number;
  revenue: number;
  theoreticalUnitCost: number;
};

export type CostVariance = {
  theoreticalCost: number;
  actualCost: number;
  varianceValue: number;
  variancePercent: number | null;
  causes: ('price' | 'portioning' | 'waste' | 'recipe')[];
};

export type IngredientVarianceLine = {
  catalogId: string | null;
  name: string;
  theoreticalQuantity: number;
  actualQuantity: number;
  varianceQuantity: number;
  unitCost: number;
  theoreticalValue: number;
  actualValue: number;
  varianceValue: number;
  variancePercent: number | null;
};

const finite = (value: number) => Number.isFinite(value) ? value : 0;
const money = (value: number) => Math.round(value * 100) / 100;

export function inventoryConsumption(line: InventoryLine) {
  return Math.max(0, finite(line.openingQuantity) + finite(line.purchasesQuantity) - finite(line.closingQuantity));
}

export function inventoryValue(lines: InventoryLine[]) {
  return money(lines.reduce((sum, line) => sum + Math.max(0, finite(line.closingQuantity)) * Math.max(0, finite(line.unitCost)), 0));
}

export function actualConsumptionCost(lines: InventoryLine[]) {
  return money(lines.reduce((sum, line) => sum + inventoryConsumption(line) * Math.max(0, finite(line.unitCost)), 0));
}

export function theoreticalSalesCost(lines: SalesLine[]) {
  return money(lines.reduce((sum, line) => sum + Math.max(0, finite(line.quantity)) * Math.max(0, finite(line.theoreticalUnitCost)), 0));
}

export function calculateCostVariance(sales: SalesLine[], inventory: InventoryLine[]): CostVariance {
  const theoreticalCost = theoreticalSalesCost(sales);
  const actualCost = actualConsumptionCost(inventory);
  const varianceValue = money(actualCost - theoreticalCost);
  const variancePercent = theoreticalCost > 0 ? Math.round((varianceValue / theoreticalCost) * 1000) / 10 : null;
  const causes: CostVariance['causes'] = [];
  if (varianceValue > 0) causes.push('price', 'portioning', 'waste', 'recipe');
  return { theoreticalCost, actualCost, varianceValue, variancePercent, causes };
}

type VarianceRecipe = {
  id: string;
  servings: number;
  yieldQuantity: number;
  yieldUnit: 'kg' | 'l' | 'buc';
  totals: { effectiveServings: number };
  ingredients: {
    kind: 'product' | 'sub_recipe';
    catalogId?: string | null;
    subRecipeId?: string | null;
    quantity: number;
    unit: 'g' | 'kg' | 'ml' | 'l' | 'buc';
    priceUnit: 'kg' | 'l' | 'buc';
  }[];
};

function toPriceUnit(quantity: number, unit: 'g' | 'kg' | 'ml' | 'l' | 'buc', priceUnit: 'kg' | 'l' | 'buc') {
  if (unit === priceUnit) return quantity;
  if (unit === 'g' && priceUnit === 'kg') return quantity / 1000;
  if (unit === 'ml' && priceUnit === 'l') return quantity / 1000;
  return quantity;
}

/** Ingredient-level bridge between recipe consumption and physical stock counts. */
export function calculateIngredientVariances(
  sales: readonly SalesLine[],
  inventory: readonly InventoryLine[],
  recipes: readonly VarianceRecipe[],
): IngredientVarianceLine[] {
  const recipeById = new Map(recipes.map((recipe) => [recipe.id, recipe]));
  const theoretical = new Map<string, number>();

  const addRecipe = (recipe: VarianceRecipe, batches: number, trail: Set<string>) => {
    if (!Number.isFinite(batches) || batches <= 0 || trail.has(recipe.id)) return;
    const nextTrail = new Set(trail).add(recipe.id);
    recipe.ingredients.forEach((ingredient) => {
      const quantity = toPriceUnit(Math.max(0, finite(ingredient.quantity)), ingredient.unit, ingredient.priceUnit) * batches;
      if (ingredient.kind === 'product' && ingredient.catalogId) {
        theoretical.set(ingredient.catalogId, (theoretical.get(ingredient.catalogId) ?? 0) + quantity);
        return;
      }
      if (ingredient.kind === 'sub_recipe' && ingredient.subRecipeId) {
        const child = recipeById.get(ingredient.subRecipeId);
        if (!child) return;
        const output = Math.max(0.000001, toPriceUnit(child.yieldQuantity, child.yieldUnit, ingredient.priceUnit));
        addRecipe(child, quantity / output, nextTrail);
      }
    });
  };

  sales.forEach((sale) => {
    if (!sale.recipeId || sale.quantity <= 0) return;
    const recipe = recipeById.get(sale.recipeId);
    if (!recipe) return;
    const portionsPerBatch = Math.max(0.000001, finite(recipe.totals.effectiveServings) || finite(recipe.servings) || 1);
    addRecipe(recipe, sale.quantity / portionsPerBatch, new Set());
  });

  return inventory.map((line) => {
    const theoreticalQuantity = line.catalogId ? theoretical.get(line.catalogId) ?? 0 : 0;
    const actualQuantity = inventoryConsumption(line);
    const varianceQuantity = Math.round((actualQuantity - theoreticalQuantity) * 1000) / 1000;
    const theoreticalValue = money(theoreticalQuantity * Math.max(0, line.unitCost));
    const actualValue = money(actualQuantity * Math.max(0, line.unitCost));
    const varianceValue = money(actualValue - theoreticalValue);
    return {
      catalogId: line.catalogId,
      name: line.name,
      theoreticalQuantity: Math.round(theoreticalQuantity * 1000) / 1000,
      actualQuantity: Math.round(actualQuantity * 1000) / 1000,
      varianceQuantity,
      unitCost: line.unitCost,
      theoreticalValue,
      actualValue,
      varianceValue,
      variancePercent: theoreticalQuantity > 0 ? Math.round((varianceQuantity / theoreticalQuantity) * 1000) / 10 : null,
    };
  }).sort((left, right) => right.varianceValue - left.varianceValue || left.name.localeCompare(right.name, 'ro-RO'));
}

export function laborCost(hours: number, hourlyCost: number) {
  return money(Math.max(0, finite(hours)) * Math.max(0, finite(hourlyCost)));
}

export function primeCost(revenue: number, foodCost: number, payrollCost: number) {
  const safeRevenue = Math.max(0, finite(revenue));
  const total = money(Math.max(0, finite(foodCost)) + Math.max(0, finite(payrollCost)));
  return { total, percent: safeRevenue > 0 ? Math.round((total / safeRevenue) * 1000) / 10 : null };
}

export function parseSalesCsv(text: string): Record<string, string>[] {
  const rows = text.trim().split(/\r?\n/).filter(Boolean).map((row) => row.split(/[;,\t]/).map((cell) => cell.trim()));
  if (rows.length < 2) return [];
  const headers = rows[0].map((header) => header.toLocaleLowerCase('ro-RO'));
  return rows.slice(1).map((cells) => Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ''])));
}

const normalized = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

export function mapSalesRows(
  rows: Record<string, string>[],
  recipes: { id: string; title: string; portionCost: number }[],
): SalesLine[] {
  const numeric = (value: string | undefined) => Number((value ?? '').replace(/\./g, '').replace(',', '.').replace(/[^0-9.-]/g, '')) || 0;
  return rows.flatMap((row) => {
    const entries = Object.entries(row);
    const name = entries.find(([key]) => /produs|preparat|articol|item|name|denumire/.test(normalized(key)))?.[1] ?? entries[0]?.[1] ?? '';
    const quantity = numeric(entries.find(([key]) => /cantitate|bucati|qty|quantity|volum/.test(normalized(key)))?.[1]);
    const revenue = numeric(entries.find(([key]) => /valoare|incasari|revenue|total|vanzari/.test(normalized(key)))?.[1]);
    const recipe = recipes.find((item) => normalized(item.title) === normalized(name));
    if (!name || (!quantity && !revenue)) return [];
    return [{ recipeId: recipe?.id ?? null, name, quantity, revenue, theoreticalUnitCost: recipe?.portionCost ?? 0 }];
  });
}
