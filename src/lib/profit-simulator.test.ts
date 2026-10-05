/**
 * MANAGER 24/7™ by PARADIM — proprietary software.
 * Copyright © 2026 PARADIM Operations SRL. All rights reserved.
 * Concept author and product director: Marius Paul Nemeșu.
 * See LICENSE-PROPRIETARY.md.
 */

import { describe, expect, it } from 'vitest';

import { simulateProfit, scenarioSupplierOffers } from '@/lib/profit-simulator';
import { calculateRecipeTotals } from '@/lib/calculations';
import type { Recipe } from '@/types/recipe';

const recipe = {
  id: 'r1', title: 'Burger', category: 'main', servings: 10, cookingMethod: 'none',
  cookingLossPercent: 0, salePriceGross: 44.4, vatPercent: 11, targetFoodCost: 30,
  isSubRecipe: false, yieldQuantity: 1, yieldUnit: 'kg', ingredients: [],
  manualAllergens: [], allergens: [], createdAt: '', updatedAt: '',
  totals: {
    totalCost: 150, portionCost: 15, effectiveServings: 10, cookingYieldPercent: 100,
    salePriceNet: 40, foodCostPercent: 37.5, contributionMargin: 25,
    contributionMarginPercent: 62.5, recommendedPriceNet: 50, recommendedPriceGross: 55.5,
  },
} satisfies Recipe;

describe('profit simulator', () => {
  it('shows the monthly impact of a price change', () => {
    const result = simulateProfit(recipe, {
      salePriceGross: 49.95,
      ingredientCostChangePercent: 0,
      monthlyPortions: 100,
    });
    expect(result.scenarioFoodCostPercent).toBe(33.3);
    expect(result.monthlyImpact).toBe(500);
  });

  it('recalculates the price required to keep the target after inflation', () => {
    const result = simulateProfit(recipe, {
      salePriceGross: 44.4,
      ingredientCostChangePercent: 10,
      monthlyPortions: 100,
    });
    expect(result.scenarioPortionCost).toBe(16.5);
    expect(result.targetPriceGross).toBe(61.05);
  });

  it('combines quantity, price and ingredient loss without changing a published recipe', () => {
    const source: Recipe = { ...recipe, ingredients: [{ id: 'line', kind: 'product', catalogId: 'meat',
      name: 'Carne', quantity: 1000, unit: 'g', purchasePrice: 40, priceUnit: 'kg', lossPercent: 20, allergens: [] }] };
    source.totals = calculateRecipeTotals(source);
    const before = JSON.stringify(source);
    const result = simulateProfit(source, { salePriceGross: 44.4, monthlyPortions: 100, ingredientCostChangePercent: 0,
      ingredientChanges: [{ ingredientId: 'line', quantity: 800, purchasePrice: 30 }] });
    expect(result.scenarioPortionCost).toBe(3);
    expect(result.monthlyImpact).toBe(200);
    expect(JSON.stringify(source)).toBe(before);
    expect(simulateProfit(source, { salePriceGross: 44.4, monthlyPortions: 100, ingredientCostChangePercent: 0,
      ingredientChanges: [{ ingredientId: 'line', quantity: -100, purchasePrice: NaN }] }).scenarioPortionCost).toBe(5);
  });

  it('offers alternative suppliers as well as the preferred one, without mixing price units', () => {
    const source: Recipe = { ...recipe, ingredients: [{ id: 'line', kind: 'product', catalogId: 'meat',
      name: 'Carne', quantity: 1000, unit: 'g', purchasePrice: 40, priceUnit: 'kg', lossPercent: 20, allergens: [] }] };
    const base = { supplierName: 'METRO', packageQuantity: null, packagePrice: null, source: null, sourceDate: null };
    expect(scenarioSupplierOffers(source, 'line', [{ id: 'meat', name: 'Carne', purchasePrice: 40, priceUnit: 'kg',
      packagePrice: null, packageQuantity: null, defaultLossPercent: 20, supplier: 'METRO', notes: null, allergens: [], active: true, updatedAt: '',
      offers: [{ ...base, id: 'current', isActive: true, unitPrice: 40, priceUnit: 'kg' },
        { ...base, id: 'alternative', isActive: false, unitPrice: 30, priceUnit: 'kg' },
        { ...base, id: 'wrong-unit', isActive: false, unitPrice: 1, priceUnit: 'buc' }] }]).map((offer) => offer.id))
      .toEqual(['alternative', 'current']);
  });
});
