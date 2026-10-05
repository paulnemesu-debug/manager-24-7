/**
 * MANAGER 24/7™ by PARADIM — proprietary software.
 * Copyright © 2026 PARADIM Operations SRL. All rights reserved.
 * Concept author and product director: Marius Paul Nemeșu.
 * See LICENSE-PROPRIETARY.md.
 */

import { describe, expect, it } from 'vitest';

import { calculatePriceAlert } from '@/lib/price-alerts';
import { calculateRecipeTotals } from '@/lib/calculations';
import type { Recipe } from '@/types/recipe';

const recipe: Recipe = {
  id: 'recipe-1', title: 'Pui', category: 'main', servings: 10,
  cookingMethod: 'none', cookingLossPercent: 0, salePriceGross: 44.4,
  vatPercent: 11, targetFoodCost: 30, isSubRecipe: false, yieldQuantity: 1, yieldUnit: 'kg',
  ingredients: [{
    id: 'line-1', kind: 'product', catalogId: 'chicken', subRecipeId: null,
    name: 'Pui', quantity: 1, unit: 'kg', purchasePrice: 20, priceUnit: 'kg',
    lossPercent: 0, allergens: [],
  }],
  manualAllergens: [], allergens: [],
  totals: {
    totalCost: 20, portionCost: 2, effectiveServings: 10, cookingYieldPercent: 100,
    salePriceNet: 40, foodCostPercent: 5, contributionMargin: 38,
    contributionMarginPercent: 95, recommendedPriceNet: 6.67, recommendedPriceGross: 7.4,
  },
  createdAt: '2026-09-01T00:00:00Z', updatedAt: '2026-09-01T00:00:00Z',
};

describe('price alerts', () => {
  it('calculates affected recipes and monthly margin loss from real sales', () => {
    const result = calculatePriceAlert([
      { catalogId: 'chicken', name: 'Pui', oldPrice: 20, newPrice: 30 },
    ], [recipe], { 'recipe-1': 100 });
    expect(result).toMatchObject({ affectedRecipes: 1, deltaPercent: 50, monthlyMarginLoss: 100 });
  });

  it('ignores price decreases', () => {
    expect(calculatePriceAlert([
      { catalogId: 'chicken', name: 'Pui', oldPrice: 30, newPrice: 20 },
    ], [recipe])).toBeNull();
  });

  it('propagates an increase through a sub-recipe and shows the exact target crossing', () => {
    const sub = { ...recipe, id: 'sub', isSubRecipe: true, yieldQuantity: 2 };
    const parent: Recipe = { ...recipe, id: 'parent', salePriceGross: 11.1, ingredients: [{ ...recipe.ingredients[0],
      id: 'sub-line', kind: 'sub_recipe', catalogId: null, subRecipeId: 'sub', quantity: 2, purchasePrice: 10 }] };
    parent.totals = calculateRecipeTotals(parent);
    const before = JSON.stringify([sub, parent]);
    const summary = calculatePriceAlert([{ catalogId: 'chicken', name: 'Pui', oldPrice: 20, newPrice: 40 }], [sub, parent], { parent: 100 });
    expect(summary).toMatchObject({ affectedRecipes: 1, crossedTargets: 1, averagePortionLoss: 2, monthlyMarginLoss: 200 });
    expect(summary?.recipeChanges?.[0]).toMatchObject({ recipeId: 'parent', beforeFoodCost: 20, afterFoodCost: 40, crossed: true });
    expect(JSON.stringify([sub, parent])).toBe(before);
  });
  it('includes simultaneous price decreases when computing the net loss', () => {
    const source = { ...recipe, ingredients: [recipe.ingredients[0], { ...recipe.ingredients[0], id: 'second', catalogId: 'other' }] };
    expect(calculatePriceAlert([{ catalogId: 'chicken', name: 'Pui', oldPrice: 20, newPrice: 25 },
      { catalogId: 'other', name: 'Other', oldPrice: 20, newPrice: 10 }], [source])).toBeNull();
  });
});
