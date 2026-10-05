/**
 * MANAGER 24/7™ by PARADIM — proprietary software.
 * Copyright © 2026 PARADIM Operations SRL. All rights reserved.
 * Concept author and product director: Marius Paul Nemeșu.
 * See LICENSE-PROPRIETARY.md.
 */

import { describe, expect, it } from 'vitest';

import { buildAllergenMenuHtml, recipeAllergensConfirmed } from '@/lib/allergen-menu';
import type { Recipe } from '@/types/recipe';

const recipe = {
  id: '1', title: 'Paste cu lapte', category: null, servings: 1, cookingMethod: 'none', cookingLossPercent: 0,
  salePriceGross: 10, vatPercent: 11, targetFoodCost: 30, isSubRecipe: false, yieldQuantity: 1, yieldUnit: 'kg',
  ingredients: [{ id: 'i', kind: 'product', name: 'Lapte', quantity: 1, unit: 'kg', purchasePrice: 1, priceUnit: 'kg', lossPercent: 0, allergens: ['milk'], allergensConfirmed: true }],
  manualAllergens: [], allergens: ['milk'], totals: { totalCost: 1, portionCost: 1, effectiveServings: 1, cookingYieldPercent: 100, salePriceNet: 9, foodCostPercent: 10, contributionMargin: 8, contributionMarginPercent: 80, recommendedPriceNet: 4, recommendedPriceGross: 4.4 }, createdAt: '', updatedAt: '',
} as Recipe;

describe('allergen menu export', () => {
  it('exports the Annex II allergen list and dish declarations', () => {
    expect(recipeAllergensConfirmed(recipe)).toBe(true);
    const html = buildAllergenMenuHtml([recipe], 'ro', 'chef@example.com');
    expect(html).toContain('Regulamentul (UE) nr. 1169/2011');
    expect(html).toContain('Paste cu lapte');
    expect(html).toContain('<strong>Lapte</strong>');
    expect(html).toContain('Dioxid de sulf și sulfiți');
  });
});
