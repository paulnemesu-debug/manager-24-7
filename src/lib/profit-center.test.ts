/**
 * MANAGER 24/7™ by PARADIM — proprietary software.
 * Copyright © 2026 PARADIM Operations SRL. All rights reserved.
 * Concept author and product director: Marius Paul Nemeșu.
 * See LICENSE-PROPRIETARY.md.
 */

import { describe, expect, it } from 'vitest';

import { calculateProfitHealth, calculateProfitPriorities } from '@/lib/profit-center';
import type { Recipe } from '@/types/recipe';

function recipe(id: string, foodCost: number | null, target = 30): Recipe {
  return {
    id,
    title: id,
    category: 'main',
    servings: 10,
    cookingMethod: 'none',
    cookingLossPercent: 0,
    salePriceGross: 44.4,
    vatPercent: 11,
    targetFoodCost: target,
    isSubRecipe: false,
    yieldQuantity: 1,
    yieldUnit: 'kg',
    ingredients: [],
    manualAllergens: [],
    allergens: [],
    totals: {
      totalCost: 150,
      portionCost: 15,
      effectiveServings: 10,
      cookingYieldPercent: 100,
      salePriceNet: 40,
      foodCostPercent: foodCost,
      contributionMargin: 25,
      contributionMarginPercent: 62.5,
      recommendedPriceNet: 50,
      recommendedPriceGross: 55.5,
    },
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
  };
}

describe('profit center', () => {
  it('keeps healthy recipes at 100 and penalises target gaps', () => {
    expect(calculateProfitHealth([recipe('healthy', 28)])).toBe(100);
    expect(calculateProfitHealth([recipe('over', 35)])).toBe(80);
  });

  it('ignores recipes without a measurable selling price', () => {
    expect(calculateProfitHealth([recipe('incomplete', null)])).toBeNull();
  });

  it('sorts actionable margin recovery first', () => {
    const result = calculateProfitPriorities([recipe('a', 32), recipe('b', 38)]);
    expect(result).toHaveLength(2);
    expect(result[0].recoverablePerPortion).toBe(10);
  });
});

