/**
 * MANAGER 24/7™ by PARADIM — proprietary software.
 * Copyright © 2026 PARADIM Operations SRL. All rights reserved.
 * Concept author and product director: Marius Paul Nemeșu.
 * See LICENSE-PROPRIETARY.md.
 */

import { describe, expect, it } from 'vitest';

import { mergeAllergens } from '@/constants/allergens';
import { normalizeCategory } from '@/constants/categories';
import {
  calculateIngredientCost,
  calculateRecipeTotals,
  calculateSubRecipeUnitCost,
  calculateUnitPrice,
  compatibleQuantityUnits,
  createEmptyRecipe,
  getFoodCostStatus,
  resolveRecipeAllergens,
} from './calculations';
import type { IngredientDraft, RecipeDraft } from '@/types/recipe';

function ingredient(overrides: Partial<IngredientDraft> = {}): IngredientDraft {
  return {
    id: '1',
    kind: 'product',
    catalogId: null,
    subRecipeId: null,
    name: 'Ingredient',
    quantity: 1,
    unit: 'kg',
    purchasePrice: 10,
    priceUnit: 'kg',
    lossPercent: 0,
    allergens: [],
    ...overrides,
  };
}

function recipe(overrides: Partial<RecipeDraft> = {}): RecipeDraft {
  return { ...createEmptyRecipe(), title: 'Test', ingredients: [], ...overrides };
}

describe('food cost calculations', () => {
  it('sums small ingredient costs before rounding the recipe total', () => {
    const ingredients = Array.from({ length: 50 }, (_, index) => ingredient({ id: String(index), quantity: 1, unit: 'g', priceUnit: 'kg', purchasePrice: 3, lossPercent: 0 }));
    expect(calculateIngredientCost(ingredients[0])).toBe(0);
    expect(calculateRecipeTotals(recipe({ servings: 1, ingredients })).totalCost).toBe(0.15);
    expect(calculateRecipeTotals(recipe({ servings: 1, ingredients })).portionCost).toBe(0.15);
  });
  it('turns the invoice package price into a unit price', () => {
    expect(calculateUnitPrice(78.5, 24)).toBe(3.27);
    expect(calculateUnitPrice(112, 25)).toBe(4.48);
    expect(calculateUnitPrice(112, 0)).toBeNull();
  });

  it('converts grams to kilograms and includes loss', () => {
    const cost = calculateIngredientCost(ingredient({
      name: 'Piept de pui',
      quantity: 900,
      unit: 'g',
      purchasePrice: 30,
      lossPercent: 10,
    }));

    expect(cost).toBe(30);
  });

  it('calculates net sale price, food cost and VAT-inclusive recommendation', () => {
    const totals = calculateRecipeTotals(recipe({
      servings: 10,
      salePriceGross: 33.3,
      vatPercent: 11,
      targetFoodCost: 30,
      ingredients: [ingredient({ quantity: 3, purchasePrice: 30 })],
    }));

    expect(totals.totalCost).toBe(90);
    expect(totals.portionCost).toBe(9);
    expect(totals.salePriceNet).toBe(30);
    expect(totals.foodCostPercent).toBe(30);
    expect(totals.recommendedPriceGross).toBe(33.3);
  });

  it('does not apply a second, recipe-level loss on top of ingredient losses', () => {
    const totals = calculateRecipeTotals(recipe({
      servings: 10,
      cookingMethod: 'grill',
      cookingLossPercent: 20,
      salePriceGross: 55.5,
      vatPercent: 11,
      ingredients: [ingredient({ quantity: 2.4, purchasePrice: 30 })],
    }));

    expect(totals.totalCost).toBe(72);
    expect(totals.cookingYieldPercent).toBe(100);
    expect(totals.effectiveServings).toBe(10);
    expect(totals.portionCost).toBe(7.2);
    expect(totals.salePriceNet).toBe(50);
    expect(totals.foodCostPercent).toBe(14.4);
  });

  it('classifies deviations from target', () => {
    expect(getFoodCostStatus(null, 30)).toBe('incomplete');
    expect(getFoodCostStatus(29.9, 30)).toBe('healthy');
    expect(getFoodCostStatus(34, 30)).toBe('watch');
    expect(getFoodCostStatus(36, 30)).toBe('critical');
  });
});

describe('sub-recipes', () => {
  it('prices a sub-recipe per unit of yield', () => {
    const totals = calculateRecipeTotals(recipe({
      ingredients: [ingredient({ quantity: 2, purchasePrice: 30 })],
    }));

    expect(calculateSubRecipeUnitCost({ totals, yieldQuantity: 2 })).toBe(30);
  });

  it('costs a sub-recipe line like any other ingredient', () => {
    const line = ingredient({
      kind: 'sub_recipe',
      subRecipeId: 'demo-sos',
      quantity: 400,
      unit: 'g',
      purchasePrice: 30,
      priceUnit: 'kg',
    });

    expect(calculateIngredientCost(line)).toBe(12);
  });

  it('never divides by a zero yield', () => {
    const totals = calculateRecipeTotals(recipe({
      ingredients: [ingredient({ quantity: 1, purchasePrice: 10 })],
    }));

    expect(Number.isFinite(calculateSubRecipeUnitCost({ totals, yieldQuantity: 0 }))).toBe(true);
  });
});

describe('allergens', () => {
  it('merges ingredient and manual allergens without duplicates, in official order', () => {
    const allergens = resolveRecipeAllergens(
      [
        ingredient({ id: 'a', allergens: ['milk', 'gluten'] }),
        ingredient({ id: 'b', allergens: ['gluten'] }),
      ],
      ['eggs'],
    );

    expect(allergens).toEqual(['gluten', 'eggs', 'milk']);
  });

  it('ignores empty lists', () => {
    expect(mergeAllergens(undefined, null, [])).toEqual([]);
  });
});

describe('categories', () => {
  it('keeps the standard values', () => {
    expect(normalizeCategory('main')).toBe('main');
  });

  it('maps free text saved by earlier versions', () => {
    expect(normalizeCategory('Fel principal')).toBe('main');
    expect(normalizeCategory('Supe')).toBe('soup');
    expect(normalizeCategory('Salate')).toBe('salad');
    expect(normalizeCategory('Garnituri')).toBe('side');
  });

  it('returns null for anything it cannot place', () => {
    expect(normalizeCategory('Paste')).toBeNull();
    expect(normalizeCategory('')).toBeNull();
    expect(normalizeCategory(null)).toBeNull();
  });
});

describe('units', () => {
  it('offers only the quantity units matching the price unit', () => {
    expect(compatibleQuantityUnits('kg')).toEqual(['g', 'kg']);
    expect(compatibleQuantityUnits('l')).toEqual(['ml', 'l']);
    expect(compatibleQuantityUnits('buc')).toEqual(['buc']);
  });
});
