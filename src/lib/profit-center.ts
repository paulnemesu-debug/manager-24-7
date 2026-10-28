/**
 * MANAGER 24/7™ by PARADIM — proprietary software.
 * Copyright © 2026 PARADIM Operations SRL. All rights reserved.
 * Concept author and product director: Marius Paul Nemeșu.
 * See LICENSE-PROPRIETARY.md.
 */

import type { Recipe } from '@/types/recipe';

export type ProfitPriority = {
  recipe: Recipe;
  gapPercent: number;
  recoverablePerPortion: number;
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function calculateProfitHealth(recipes: readonly Recipe[]): number | null {
  const measured = recipes.filter((recipe) => (
    !recipe.isSubRecipe && recipe.totals.foodCostPercent !== null
  ));
  if (!measured.length) return null;
  const result = measured.reduce((sum, recipe) => {
    const gap = (recipe.totals.foodCostPercent ?? recipe.targetFoodCost) - recipe.targetFoodCost;
    return sum + clamp(100 - Math.max(0, gap) * 4, 20, 100);
  }, 0) / measured.length;
  return Math.round(result);
}

export function calculateProfitPriorities(recipes: readonly Recipe[]): ProfitPriority[] {
  return recipes
    .filter((recipe) => !recipe.isSubRecipe && recipe.totals.foodCostPercent !== null)
    .map((recipe) => ({
      recipe,
      gapPercent: Math.max(0, (recipe.totals.foodCostPercent ?? 0) - recipe.targetFoodCost),
      recoverablePerPortion: Math.max(
        0,
        Math.round((recipe.totals.recommendedPriceNet - recipe.totals.salePriceNet) * 100) / 100,
      ),
    }))
    .filter((item) => item.gapPercent > 0)
    .sort((a, b) => (
      b.recoverablePerPortion - a.recoverablePerPortion || b.gapPercent - a.gapPercent
    ));
}

