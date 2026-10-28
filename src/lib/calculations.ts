/**
 * MANAGER 24/7™ by PARADIM — proprietary software.
 * Copyright © 2026 PARADIM Operations SRL. All rights reserved.
 * Concept author and product director: Marius Paul Nemeșu.
 * See LICENSE-PROPRIETARY.md.
 */

import { type Allergen, mergeAllergens } from '@/constants/allergens';
import { requiresSourceReview } from '@/lib/recipe-source-review';
import type {
  FoodCostStatus,
  IngredientDraft,
  PriceUnit,
  QuantityUnit,
  Recipe,
  RecipeDraft,
  RecipeTotals,
} from '@/types/recipe';
import { DEFAULT_ROMANIA_RESTAURANT_VAT } from '@/constants/romania-vat';
import {
  nutritionFromSubRecipe,
  createEmptyIngredientNutrition,
  createEmptyRecipeCompliance,
} from '@/lib/nutrition';

const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const roundQuantity = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export function normalizeQuantity(
  quantity: number,
  unit: QuantityUnit,
  priceUnit: PriceUnit,
): number | null {
  if (unit === 'g' && priceUnit === 'kg') return quantity / 1000;
  if (unit === 'kg' && priceUnit === 'kg') return quantity;
  if (unit === 'ml' && priceUnit === 'l') return quantity / 1000;
  if (unit === 'l' && priceUnit === 'l') return quantity;
  if (unit === 'buc' && priceUnit === 'buc') return quantity;
  return null;
}

/** Unitățile de cantitate compatibile cu unitatea în care este exprimat prețul. */
export function compatibleQuantityUnits(priceUnit: PriceUnit): QuantityUnit[] {
  if (priceUnit === 'kg') return ['g', 'kg'];
  if (priceUnit === 'l') return ['ml', 'l'];
  return ['buc'];
}

function exactIngredientCost(ingredient: IngredientDraft): number {
  const normalized = normalizeQuantity(
    Math.max(0, ingredient.quantity || 0),
    ingredient.unit,
    ingredient.priceUnit,
  );
  if (normalized === null) return 0;

  const usableYield = Math.max(0.01, 1 - Math.min(99, Math.max(0, ingredient.lossPercent)) / 100);
  return (normalized / usableYield) * Math.max(0, ingredient.purchasePrice || 0);
}

export function calculateIngredientCost(ingredient: IngredientDraft): number {
  return roundMoney(exactIngredientCost(ingredient));
}

/** Transformă prețul unui bax/sac/cutie în preț pe kg, litru sau bucată. */
export function calculateUnitPrice(
  packagePrice: number | null | undefined,
  packageQuantity: number | null | undefined,
): number | null {
  const price = Number(packagePrice);
  const quantity = Number(packageQuantity);
  if (!Number.isFinite(price) || !Number.isFinite(quantity) || price < 0 || quantity <= 0) return null;
  return roundMoney(price / quantity);
}

export function calculateRecipeTotals(recipe: RecipeDraft): RecipeTotals {
  const exactTotal = recipe.ingredients.reduce(
    (sum, ingredient) => sum + exactIngredientCost(ingredient),
    0,
  );
  const totalCost = roundMoney(exactTotal);
  const plannedServings = Math.max(1, recipe.servings || 1);
  // Scăzământul este calculat exclusiv pe ingredient. Câmpurile de rețetă
  // rămân în tipuri pentru compatibilitatea datelor existente, fără să dubleze pierderea.
  const cookingYieldPercent = 100;
  const effectiveServings = roundQuantity(plannedServings);
  const portionCost = roundMoney(exactTotal / effectiveServings);
  const vatMultiplier = 1 + Math.max(0, recipe.vatPercent || 0) / 100;
  const salePriceGross = Math.max(0, recipe.salePriceGross || 0);
  const salePriceNet = roundMoney(salePriceGross / vatMultiplier);
  const foodCostPercent = !requiresSourceReview(recipe) && salePriceNet > 0
    ? Math.round((portionCost / salePriceNet) * 1000) / 10
    : null;
  const contributionMargin = !requiresSourceReview(recipe) && salePriceNet > 0
    ? roundMoney(salePriceNet - portionCost)
    : null;
  const contributionMarginPercent = salePriceNet > 0 && contributionMargin !== null
    ? Math.round((contributionMargin / salePriceNet) * 1000) / 10
    : null;
  const target = Math.max(0.01, Math.min(99.99, recipe.targetFoodCost || 30)) / 100;
  const recommendedPriceNet = roundMoney(portionCost / target);
  const recommendedPriceGross = roundMoney(recommendedPriceNet * vatMultiplier);

  return {
    totalCost,
    portionCost,
    effectiveServings,
    cookingYieldPercent,
    salePriceNet,
    foodCostPercent,
    contributionMargin,
    contributionMarginPercent,
    recommendedPriceNet,
    recommendedPriceGross,
  };
}

/**
 * Costul unei unități de semipreparat (pe kg, l sau buc).
 * Este prețul cu care semipreparatul intră ca ingredient în altă rețetă.
 */
export function calculateSubRecipeUnitCost(recipe: Pick<Recipe, 'totals' | 'yieldQuantity'>): number {
  const yieldQuantity = Math.max(0.001, recipe.yieldQuantity || 0);
  return roundMoney(recipe.totals.totalCost / yieldQuantity);
}

/** Alergenii unei rețete: cei moșteniți din ingrediente plus cei adăugați manual. */
export function resolveRecipeAllergens(
  ingredients: readonly IngredientDraft[],
  manualAllergens: readonly Allergen[] = [],
): Allergen[] {
  return mergeAllergens(
    ...ingredients.map((ingredient) => ingredient.allergens),
    manualAllergens,
  );
}

export function getFoodCostStatus(
  foodCostPercent: number | null,
  targetFoodCost: number,
): FoodCostStatus {
  if (foodCostPercent === null) return 'incomplete';
  if (foodCostPercent <= targetFoodCost) return 'healthy';
  if (foodCostPercent <= targetFoodCost + 5) return 'watch';
  return 'critical';
}

export function createEmptyIngredient(index = 0): IngredientDraft {
  return {
    id: `ingredient-${Date.now()}-${index}`,
    kind: 'product',
    catalogId: null,
    subRecipeId: null,
    name: '',
    quantity: 0,
    unit: 'g',
    purchasePrice: 0,
    priceUnit: 'kg',
    packageQuantity: null,
    packagePrice: null,
    lossPercent: 0,
    allergens: [],
    allergensConfirmed: false,
    additives: [],
    nutrition: createEmptyIngredientNutrition(),
  };
}

/** Construiește rândul de ingredient care aduce un semipreparat într-o altă rețetă. */
export function createSubRecipeIngredient(recipe: Recipe, index = 0): IngredientDraft {
  const unit: QuantityUnit = recipe.yieldUnit === 'kg'
    ? 'g'
    : recipe.yieldUnit === 'l' ? 'ml' : 'buc';
  return {
    id: `sub-${recipe.id}-${Date.now()}-${index}`,
    kind: 'sub_recipe',
    catalogId: null,
    subRecipeId: recipe.id,
    name: recipe.title,
    quantity: 0,
    unit,
    purchasePrice: calculateSubRecipeUnitCost(recipe),
    priceUnit: recipe.yieldUnit,
    packageQuantity: null,
    packagePrice: null,
    lossPercent: 0,
    allergens: recipe.allergens,
    allergensConfirmed: recipe.ingredients.every((ingredient) => ingredient.allergensConfirmed),
    additives: [...new Set(recipe.ingredients.flatMap((ingredient) => ingredient.additives ?? []))],
    nutrition: nutritionFromSubRecipe(recipe),
  };
}

export function createEmptyRecipe(defaultVatPercent = DEFAULT_ROMANIA_RESTAURANT_VAT): RecipeDraft {
  return {
    title: '',
    category: null,
    servings: 10,
    cookingMethod: 'none',
    cookingLossPercent: 0,
    salePriceGross: 0,
    vatPercent: Math.min(100, Math.max(0, defaultVatPercent)),
    targetFoodCost: 30,
    isSubRecipe: false,
    yieldQuantity: 1,
    yieldUnit: 'kg',
    ingredients: [createEmptyIngredient(0), createEmptyIngredient(1)],
    manualAllergens: [],
    compliance: createEmptyRecipeCompliance(),
  };
}
