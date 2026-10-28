/**
 * MANAGER 24/7™ by PARADIM — proprietary software.
 * Copyright © 2026 PARADIM Operations SRL. All rights reserved.
 * Concept author and product director: Marius Paul Nemeșu.
 * See LICENSE-PROPRIETARY.md.
 */

import { describe, expect, it } from 'vitest';

import {
  buildMenuEngineering,
  buildShoppingList,
  buildShoppingListMessage,
  calculateBulkBatchTotals,
  calculateBulkGrossQuantity,
  calculateBulkCost,
  recalculateBulkOperationalLine,
} from '@/lib/operations';
import type { Recipe } from '@/types/recipe';

function recipe(id: string, contribution = 10): Recipe {
  return {
    id,
    title: id,
    category: 'main',
    servings: 10,
    cookingMethod: 'none',
    cookingLossPercent: 0,
    salePriceGross: 33.3,
    vatPercent: 11,
    targetFoodCost: 30,
    isSubRecipe: false,
    yieldQuantity: 1,
    yieldUnit: 'kg',
    ingredients: [{
      id: `${id}-ingredient`,
      kind: 'product',
      catalogId: 'flour',
      subRecipeId: null,
      name: 'Făină',
      quantity: 1,
      unit: 'kg',
      purchasePrice: 10,
      priceUnit: 'kg',
      lossPercent: 0,
      allergens: ['gluten'],
    }],
    manualAllergens: [],
    allergens: ['gluten'],
    totals: {
      totalCost: 10,
      portionCost: 1,
      effectiveServings: 10,
      cookingYieldPercent: 100,
      salePriceNet: 30,
      foodCostPercent: 3.3,
      contributionMargin: contribution,
      contributionMarginPercent: 50,
      recommendedPriceNet: 3.33,
      recommendedPriceGross: 3.7,
    },
    createdAt: '2026-09-01T00:00:00Z',
    updatedAt: '2026-09-01T00:00:00Z',
  };
}

describe('operational tools', () => {
  it('classifies popular/high-margin dishes as stars', () => {
    const result = buildMenuEngineering([recipe('star', 20), recipe('dog', 5)], { star: 90, dog: 10 });
    expect(result.find((item) => item.recipe.id === 'star')?.classification).toBe('star');
    expect(result.find((item) => item.recipe.id === 'dog')?.classification).toBe('dog');
  });

  it('scales and combines ingredients into a shopping list', () => {
    const line = buildShoppingList([recipe('a'), recipe('b')], [{
      id: 'flour', name: 'Făină', purchasePrice: 10, priceUnit: 'kg', packageQuantity: null,
      packagePrice: null, defaultLossPercent: 0, supplier: 'Metro', notes: null, allergens: [],
      active: true, updatedAt: '2026-09-01T00:00:00Z',
    }], [{ recipeId: 'a', portions: 20 }, { recipeId: 'b', portions: 10 }])[0];
    expect(line.quantity).toBe(3);
    expect(line.cost).toBe(30);
    expect(line.supplier).toBe('Metro');
  });

  it('uses quantities issued from stock for real batch cost', () => {
    const source = recipe('bulk');
    const result = calculateBulkCost(source, { 'bulk-ingredient': 2.5 }, 25, 320);
    expect(result.totalCost).toBe(25);
    expect(result.portionCost).toBe(1);
  });

  it('calculates a bulk batch from actual issued quantities and final weight', () => {
    const result = calculateBulkBatchTotals({
      lines: [{
        id: 'line-1', catalogId: 'flour', name: 'Făină', quantity: 2.5, unit: 'kg',
        purchasePrice: 10, priceUnit: 'kg', cost: 0,
      }],
      finalWeightGrams: 5000,
      portions: 20,
      salePriceGross: 11.1,
      vatPercent: 11,
    });
    expect(result.totalCost).toBe(25);
    expect(result.portionCost).toBe(1.25);
    expect(result.costPerKg).toBe(5);
    expect(result.servingWeightGrams).toBe(250);
    expect(result.foodCostPercent).toBe(12.5);
  });

  it('includes ingredient loss in a bulk line and batch cost', () => {
    const line = recalculateBulkOperationalLine({
      id: 'loss-line', catalogId: 'flour', name: 'Făină', quantity: 1, unit: 'kg',
      purchasePrice: 10, priceUnit: 'kg', lossPercent: 20, cost: 0,
    });
    expect(calculateBulkGrossQuantity(1, 20)).toBe(1.25);
    expect(line.cost).toBe(12.5);
    expect(calculateBulkBatchTotals({
      lines: [line], finalWeightGrams: 1000, portions: 4, salePriceGross: 0, vatPercent: 11,
    }).portionCost).toBe(3.13);
  });

  it('builds a supplier-grouped shopping message', () => {
    const message = buildShoppingListMessage({
      title: 'Lista de cumpărături',
      lines: [{ key: '1', name: 'Făină', quantity: 3, unit: 'kg', supplier: 'Metro', cost: 30 }],
      totalLabel: 'Total estimat',
      totalValue: '30,00 RON',
    });
    expect(message).toContain('Metro');
    expect(message).toContain('• Făină: 3 kg');
    expect(message).toContain('Total estimat: 30,00 RON');
  });

  it('localizes displayed piece units without rewriting shopping-list data', () => {
    const line = Object.freeze({ key: 'eggs', name: 'Ouă', quantity: 20, unit: 'buc' as const, supplier: 'Furnizor local', cost: 30 });
    const input = { title: 'Shopping list', lines: [line], totalLabel: 'Total', totalValue: '30 RON' };
    expect(buildShoppingListMessage({ ...input, locale: 'en' })).toContain('• Ouă: 20 pcs');
    expect(buildShoppingListMessage({ ...input, locale: 'ro' })).toContain('• Ouă: 20 buc');
    expect(line.unit).toBe('buc');
    expect(line.name).toBe('Ouă');
  });
});
