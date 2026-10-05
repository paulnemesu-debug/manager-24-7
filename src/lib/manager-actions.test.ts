import { describe, expect, it } from 'vitest';

import { calculateRecipeTotals, createEmptyIngredient, createEmptyRecipe } from '@/lib/calculations';
import { buildManagerActions } from '@/lib/manager-actions';
import type { Recipe } from '@/types/recipe';

const recipe = (id: string, cost: number): Recipe => {
  const draft = { ...createEmptyRecipe(0), title: id, salePriceGross: 100, servings: 1,
    ingredients: [{ ...createEmptyIngredient(), name: 'product', unit: 'buc' as const,
      priceUnit: 'buc' as const, quantity: 1, purchasePrice: cost }] };
  return { ...draft, id, allergens: [], totals: calculateRecipeTotals(draft), createdAt: '', updatedAt: '' };
};

describe('manager actions grounded in recorded sales', () => {
  it('prioritises a popular low-gap dish over a rare high-gap dish', () => {
    const report = buildManagerActions([recipe('rare', 50), recipe('popular', 31)], { rare: 1, popular: 100 });
    expect(report.actions.map((item) => item.recipe.id)).toEqual(['popular', 'rare']);
    expect(report.actions[0].periodOpportunity).toBe(100);
    expect(report.actions[0].reductionPerPortion).toBe(1);
    expect(report.salesCoveredCount).toBe(2);
  });
  it('distinguishes missing volumes from explicitly recorded zero sales', () => {
    const report = buildManagerActions([recipe('unknown', 40), recipe('zero', 50)], { zero: 0 });
    expect(report.actions[0].recordedPortions).toBeNull();
    expect(report.actions[0].periodOpportunity).toBeNull();
    expect(report.actions[1].periodOpportunity).toBe(0);
    expect(report.salesCoveredCount).toBe(1);
  });
  it('excludes semipreparates and unmeasurable prices and reports partial coverage', () => {
    const missing = recipe('missing', 40);
    missing.totals.foodCostPercent = null;
    missing.totals.salePriceNet = 0;
    const sub = { ...recipe('sub', 40), isSubRecipe: true };
    const report = buildManagerActions([recipe('healthy', 20), missing, sub], { healthy: NaN, missing: 10 });
    expect(report.actions).toEqual([]);
    expect(report.sellableCount).toBe(2);
    expect(report.measuredCount).toBe(1);
    expect(report.salesCoveredCount).toBe(0);
  });
});
