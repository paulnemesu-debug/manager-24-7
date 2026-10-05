/**
 * MANAGER 24/7™ by PARADIM — proprietary software.
 * Copyright © 2026 PARADIM Operations SRL. All rights reserved.
 * Concept author and product director: Marius Paul Nemeșu.
 * See LICENSE-PROPRIETARY.md.
 */

import { calculateRecipeTotals } from '@/lib/calculations';
import type { CatalogIngredient, Recipe, SupplierOffer } from '@/types/recipe';

const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export type ProfitScenario = {
  salePriceGross: number;
  ingredientCostChangePercent: number;
  monthlyPortions: number;
  ingredientChanges?: readonly IngredientScenario[];
};

export type IngredientScenario = { ingredientId: string; quantity?: number; purchasePrice?: number };

export function scenarioSupplierOffers(recipe: Recipe, ingredientId: string, catalog: readonly CatalogIngredient[]): SupplierOffer[] {
  const ingredient = recipe.ingredients.find((item) => item.id === ingredientId && item.kind === 'product');
  if (!ingredient?.catalogId) return [];
  const entry = catalog.find((item) => item.id === ingredient.catalogId && item.active);
  // isActive marks the currently chosen supplier; other stored offers are alternatives.
  return (entry?.offers ?? []).filter((offer) => offer.priceUnit === ingredient.priceUnit
    && Number.isFinite(offer.unitPrice) && offer.unitPrice >= 0).sort((a, b) => a.unitPrice - b.unitPrice);
}

export type ProfitSimulation = {
  scenarioPortionCost: number;
  scenarioFoodCostPercent: number | null;
  contributionPerPortion: number;
  monthlyContribution: number;
  monthlyImpact: number;
  targetPriceGross: number;
};

/**
 * Model local, deliberat transparent: nu prezice vânzări și nu ascunde
 * ipotezele. Utilizatorul schimbă prețul, costurile și volumul, iar aplicația
 * arată impactul matematic înainte de a modifica rețeta.
 */
export function simulateProfit(recipe: Recipe, scenario: ProfitScenario): ProfitSimulation {
  const changes = new Map((scenario.ingredientChanges ?? []).map((item) => [item.ingredientId, item]));
  const ingredients = recipe.ingredients.map((ingredient) => {
    const change = changes.get(ingredient.id);
    return !change ? ingredient : { ...ingredient,
      quantity: typeof change.quantity === 'number' && Number.isFinite(change.quantity) && change.quantity >= 0 ? change.quantity : ingredient.quantity,
      purchasePrice: typeof change.purchasePrice === 'number' && Number.isFinite(change.purchasePrice) && change.purchasePrice >= 0 ? change.purchasePrice : ingredient.purchasePrice,
    };
  });
  const changed = ingredients.some((ingredient, index) => ingredient.quantity !== recipe.ingredients[index].quantity
    || ingredient.purchasePrice !== recipe.ingredients[index].purchasePrice);
  const baseCost = changed ? calculateRecipeTotals({ ...recipe, ingredients }).portionCost : recipe.totals.portionCost;
  const vatMultiplier = 1 + Math.max(0, recipe.vatPercent) / 100;
  const scenarioNetPrice = Math.max(0, Number.isFinite(scenario.salePriceGross) ? scenario.salePriceGross : 0) / vatMultiplier;
  const scenarioPortionCost = Math.max(
    0,
    baseCost * (1 + (Number.isFinite(scenario.ingredientCostChangePercent) ? scenario.ingredientCostChangePercent : 0) / 100),
  );
  const contributionPerPortion = scenarioNetPrice - scenarioPortionCost;
  const currentContribution = recipe.salePriceGross / vatMultiplier - recipe.totals.portionCost;
  const monthlyPortions = Math.max(0, Number.isFinite(scenario.monthlyPortions) ? scenario.monthlyPortions : 0);
  const target = Math.max(0.1, recipe.targetFoodCost) / 100;

  return {
    scenarioPortionCost: money(scenarioPortionCost),
    scenarioFoodCostPercent: scenarioNetPrice > 0
      ? Math.round((scenarioPortionCost / scenarioNetPrice) * 1000) / 10
      : null,
    contributionPerPortion: money(contributionPerPortion),
    monthlyContribution: money(contributionPerPortion * monthlyPortions),
    monthlyImpact: money((contributionPerPortion - currentContribution) * monthlyPortions),
    targetPriceGross: money((scenarioPortionCost / target) * vatMultiplier),
  };
}
