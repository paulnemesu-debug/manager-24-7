/**
 * MANAGER 24/7™ by PARADIM — proprietary software.
 * Copyright © 2026 PARADIM Operations SRL. All rights reserved.
 * Concept author and product director: Marius Paul Nemeșu.
 * See LICENSE-PROPRIETARY.md.
 */

import { describe, expect, it } from 'vitest';

import { buildWeeklyReport, calculateWeeklyReportStats } from '@/lib/weekly-report';
import type { Recipe } from '@/types/recipe';

const recipe = (foodCost: number, target = 30): Recipe => ({
  id: String(foodCost), title: 'Test', category: 'main', servings: 10, cookingMethod: 'none',
  cookingLossPercent: 0, salePriceGross: 22.2, vatPercent: 11, targetFoodCost: target,
  isSubRecipe: false, yieldQuantity: 1, yieldUnit: 'kg', ingredients: [], manualAllergens: [],
  allergens: [], totals: { totalCost: foodCost * 0.2, portionCost: foodCost * 0.02, effectiveServings: 10,
    cookingYieldPercent: 100, salePriceNet: 20, foodCostPercent: foodCost,
    contributionMargin: 20 - foodCost * 0.02, contributionMarginPercent: 70,
    recommendedPriceNet: 10, recommendedPriceGross: 11.1 },
  createdAt: '2026-09-01', updatedAt: '2026-09-01',
});

describe('weekly manager report', () => {
  it('calculates average and recipes over target', () => {
    const stats = calculateWeeklyReportStats([recipe(25), recipe(40)]);
    expect(stats.averageFoodCost).toBe(32.5);
    expect(stats.overTarget).toBe(1);
  });

  it('builds a WhatsApp-ready Romanian report', () => {
    const text = buildWeeklyReport({
      locale: 'ro', recipes: [recipe(40)], alerts: [], dateLabel: '16.09.2026',
      money: (value) => `${value ?? 0} RON`, percent: (value) => `${value ?? 0}%`,
    });
    expect(text).toContain('Raport săptămânal');
    expect(text).toContain('Rețete peste țintă: 1');
  });
});

