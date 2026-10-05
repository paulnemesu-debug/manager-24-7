/**
 * MANAGER 24/7™ by PARADIM — proprietary software.
 * Copyright © 2026 PARADIM Operations SRL. All rights reserved.
 * Concept author and product director: Marius Paul Nemeșu.
 * See LICENSE-PROPRIETARY.md.
 */

import { resolveRecipeGraph, recipesUsingCatalogIngredient } from '@/lib/recipe-graph';
import type { Recipe } from '@/types/recipe';

export type PriceIncrease = {
  catalogId: string;
  name: string;
  oldPrice: number;
  newPrice: number;
};

export type PriceAlertSummary = {
  ingredientName: string;
  deltaPercent: number;
  affectedRecipes: number;
  crossedTargets: number;
  averagePortionLoss: number;
  monthlyMarginLoss: number;
  recipeChanges?: { recipeId: string; title: string; beforeFoodCost: number | null; afterFoodCost: number | null; target: number; portionLoss: number; crossed: boolean }[];
};

export function calculatePriceAlert(
  increases: readonly PriceIncrease[],
  recipes: readonly Recipe[],
  monthlySales: Readonly<Record<string, number>> = {},
): PriceAlertSummary | null {
  const valid = increases.filter((item) => Number.isFinite(item.oldPrice) && Number.isFinite(item.newPrice) && item.oldPrice >= 0 && item.newPrice >= 0);
  const positive = valid.filter((item) => item.newPrice > item.oldPrice && item.oldPrice > 0);
  if (!positive.length) return null;
  const biggest = [...positive].sort((left, right) => (
    (right.newPrice - right.oldPrice) / right.oldPrice - (left.newPrice - left.oldPrice) / left.oldPrice
  ))[0];

  let affectedRecipes = 0;
  let crossedTargets = 0;
  let totalPortionLoss = 0;
  let monthlyMarginLoss = 0;
  const affected = new Set(valid.flatMap((increase) => recipesUsingCatalogIngredient(recipes, increase.catalogId).map((recipe) => recipe.id)));
  const byCatalog = new Map(valid.map((increase) => [increase.catalogId, increase]));
  const withPrices = (field: 'oldPrice' | 'newPrice') => resolveRecipeGraph(recipes.map((recipe) => ({ ...recipe,
    ingredients: recipe.ingredients.map((ingredient) => {
      const change = ingredient.kind === 'product' && ingredient.catalogId ? byCatalog.get(ingredient.catalogId) : null;
      return change ? { ...ingredient, purchasePrice: change[field] } : ingredient;
    }),
  }))).recipes;
  const before = new Map(withPrices('oldPrice').map((recipe) => [recipe.id, recipe]));
  const after = new Map(withPrices('newPrice').map((recipe) => [recipe.id, recipe]));
  const recipeChanges: NonNullable<PriceAlertSummary['recipeChanges']> = [];

  for (const recipe of recipes.filter((item) => !item.isSubRecipe)) {
    if (!affected.has(recipe.id)) continue;
    const old = before.get(recipe.id)!;
    const next = after.get(recipe.id)!;
    const portionDelta = next.totals.portionCost - old.totals.portionCost;
    if (portionDelta <= 0) continue;
    affectedRecipes += 1;
    totalPortionLoss += portionDelta;
    const sold = monthlySales[recipe.id] ?? 0;
    monthlyMarginLoss += portionDelta * (Number.isFinite(sold) ? Math.max(0, sold) : 0);
    const crossed = old.totals.foodCostPercent !== null && next.totals.foodCostPercent !== null
      && old.totals.foodCostPercent <= recipe.targetFoodCost && next.totals.foodCostPercent > recipe.targetFoodCost;
    if (crossed) crossedTargets += 1;
    recipeChanges.push({ recipeId: recipe.id, title: recipe.title, beforeFoodCost: old.totals.foodCostPercent,
      afterFoodCost: next.totals.foodCostPercent, target: recipe.targetFoodCost, portionLoss: portionDelta, crossed });
  }
  if (!affectedRecipes) return null;

  return {
    ingredientName: biggest.name,
    deltaPercent: ((biggest.newPrice - biggest.oldPrice) / biggest.oldPrice) * 100,
    affectedRecipes,
    crossedTargets,
    averagePortionLoss: affectedRecipes ? totalPortionLoss / affectedRecipes : 0,
    monthlyMarginLoss,
    recipeChanges,
  };
}
