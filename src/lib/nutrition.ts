/**
 * MANAGER 24/7™ by PARADIM — proprietary software.
 * Copyright © 2026 PARADIM Operations SRL. All rights reserved.
 * Concept author and product director: Marius Paul Nemeșu.
 * See LICENSE-PROPRIETARY.md.
 */

import type {
  IngredientDraft,
  IngredientNutrition,
  NutritionBasis,
  NutritionSource,
  NutritionValues,
  RecipeComplianceDraft,
  RecipeDraft,
  Recipe,
} from '@/types/recipe';
import { resolveAutomaticNutrition } from '@/lib/nutrition-auto';

export const DECLARED_NUTRIENT_KEYS = [
  'energyKj',
  'energyKcal',
  'fat',
  'saturates',
  'carbohydrates',
  'sugars',
  'fibre',
  'protein',
  'salt',
] as const;

/** Fibrele sunt voluntare, restul câmpurilor formează declarația completă UE. */
export const REQUIRED_NUTRIENT_KEYS = [
  'energyKj',
  'energyKcal',
  'fat',
  'saturates',
  'carbohydrates',
  'sugars',
  'protein',
  'salt',
] as const;

export type NutrientKey = (typeof DECLARED_NUTRIENT_KEYS)[number];

export type RecipeNutritionResult = {
  total: NutritionValues;
  perPortion: NutritionValues;
  per100g: NutritionValues;
  finalWeightGrams: number | null;
  finalWeightMeasured: boolean;
  estimatedInputWeightGrams: number | null;
  missingRequired: NutrientKey[];
  unconfirmedIngredientCount: number;
  incompatibleIngredientCount: number;
  precisionScore: number;
  complete: boolean;
  approximateKeys: NutrientKey[];
  autoIngredientCount: number;
  coveredIngredientCount: number;
  ingredientCount: number;
  missingIngredients: string[];
  incompatibleIngredients: string[];
  sources: string[];
};

const EMPTY_VALUES: NutritionValues = {
  energyKj: null,
  energyKcal: null,
  fat: null,
  saturates: null,
  carbohydrates: null,
  sugars: null,
  fibre: null,
  protein: null,
  salt: null,
};

export function emptyNutritionValues(): NutritionValues {
  return { ...EMPTY_VALUES };
}

export function createEmptyIngredientNutrition(
  basis: NutritionBasis = '100g',
): IngredientNutrition {
  return {
    basis,
    values: emptyNutritionValues(),
    source: 'unknown',
    sourceReference: null,
    confirmed: false,
  };
}

export function createEmptyRecipeCompliance(): RecipeComplianceDraft {
  return {
    finalWeightGrams: null,
    finalWeightMeasured: false,
    isDefrosted: false,
    nutritionNotes: null,
    templateId: null,
    sourceReference: null,
  };
}

function nullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export function normalizeNutritionValues(value: unknown): NutritionValues {
  const input = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  return Object.fromEntries(
    DECLARED_NUTRIENT_KEYS.map((key) => [key, nullableNumber(input[key])]),
  ) as unknown as NutritionValues;
}

export function normalizeIngredientNutrition(value: unknown): IngredientNutrition {
  const input = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const basis: NutritionBasis = input.basis === '100ml' || input.basis === 'unit'
    ? input.basis
    : '100g';
  const allowedSources: NutritionSource[] = [
    'product_label', 'laboratory', 'supplier', 'accepted_database',
    'imported_workbook', 'estimated', 'unknown',
  ];
  const source = typeof input.source === 'string' && allowedSources.includes(input.source as NutritionSource)
    ? input.source as NutritionSource
    : 'unknown';
  return {
    basis,
    values: normalizeNutritionValues(input.values),
    source,
    sourceReference: typeof input.sourceReference === 'string' && input.sourceReference.trim()
      ? input.sourceReference.trim()
      : null,
    confirmed: input.confirmed === true,
    ...(input.automaticMatch && typeof input.automaticMatch === 'object'
      && typeof (input.automaticMatch as Record<string, unknown>).foodCode === 'string'
      && typeof (input.automaticMatch as Record<string, unknown>).matchedName === 'string'
      ? { automaticMatch: input.automaticMatch as IngredientNutrition['automaticMatch'] } : {}),
    ...(input.automaticDisabled === true ? { automaticDisabled: true } : {}),
    ...(input.qualifiers && typeof input.qualifiers === 'object' ? {
      qualifiers: Object.fromEntries(DECLARED_NUTRIENT_KEYS.flatMap((key) => {
        const qualifier = (input.qualifiers as Record<string, unknown>)[key];
        return typeof qualifier === 'string' && qualifier.trim() ? [[key, qualifier]] : [];
      })),
    } : {}),
    gramsPerMl: positive(input.gramsPerMl),
    gramsPerUnit: positive(input.gramsPerUnit),
  };
}

function positive(value: unknown): number | null {
  const parsed = nullableNumber(value);
  return parsed !== null && parsed > 0 ? parsed : null;
}

export function enrichIngredientNutrition<T extends { name: string; nutrition?: IngredientNutrition; kind?: string }>(ingredient: T): T {
  const current = normalizeIngredientNutrition(ingredient.nutrition);
  const nutrition = ingredient.kind === 'sub_recipe' ? current : resolveAutomaticNutrition(ingredient.name, current);
  return { ...ingredient, nutrition };
}

export function enrichRecipeNutrition<T extends RecipeDraft>(recipe: T): T {
  return { ...recipe, ingredients: recipe.ingredients.map(enrichIngredientNutrition) };
}

export function normalizeRecipeCompliance(value: unknown): RecipeComplianceDraft {
  const input = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const text = (key: string) => typeof input[key] === 'string' && input[key]
    ? String(input[key]).trim() || null
    : null;
  const finalWeight = nullableNumber(input.finalWeightGrams);
  return {
    finalWeightGrams: finalWeight && finalWeight > 0 ? finalWeight : null,
    finalWeightMeasured: input.finalWeightMeasured === true,
    isDefrosted: input.isDefrosted === true,
    nutritionNotes: text('nutritionNotes'),
    templateId: text('templateId'),
    sourceReference: text('sourceReference'),
  };
}

/**
 * Factorii de conversie energetici din anexa XIV la Regulamentul (UE) 1169/2011.
 * Câmpurile rare sunt opționale, dar sunt incluse pentru a nu folosi formula
 * simplificată 4/4/9 în produse cu polioli, alcool sau acizi organici.
 */
export function calculateEnergyWithEuFactors(values: {
  carbohydrates?: number;
  polyols?: number;
  protein?: number;
  fat?: number;
  salatrim?: number;
  alcohol?: number;
  organicAcids?: number;
  fibre?: number;
  erythritol?: number;
}): { energyKj: number; energyKcal: number } {
  const safe = (value: number | undefined) => Math.max(0, Number(value) || 0);
  return {
    energyKj: roundNutrition(
      safe(values.carbohydrates) * 17
      + safe(values.polyols) * 10
      + safe(values.protein) * 17
      + safe(values.fat) * 37
      + safe(values.salatrim) * 25
      + safe(values.alcohol) * 29
      + safe(values.organicAcids) * 13
      + safe(values.fibre) * 8,
    ),
    energyKcal: roundNutrition(
      safe(values.carbohydrates) * 4
      + safe(values.polyols) * 2.4
      + safe(values.protein) * 4
      + safe(values.fat) * 9
      + safe(values.salatrim) * 6
      + safe(values.alcohol) * 7
      + safe(values.organicAcids) * 3
      + safe(values.fibre) * 2,
    ),
  };
}

function roundNutrition(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function factorForIngredient(ingredient: IngredientDraft, nutrition: IngredientNutrition): number | null {
  const basis = nutrition.basis;
  const quantity = Math.max(0, Number(ingredient.quantity) || 0);
  if (!Number.isFinite(quantity)) return null;
  if (basis === '100g') {
    if (ingredient.unit === 'g') return quantity / 100;
    if (ingredient.unit === 'kg') return quantity * 10;
    const grams = ingredientMassGrams(ingredient, nutrition);
    return grams === null ? null : grams / 100;
  }
  if (basis === '100ml') {
    if (ingredient.unit === 'ml') return quantity / 100;
    if (ingredient.unit === 'l') return quantity * 10;
    const grams = ingredientMassGrams(ingredient, nutrition);
    return grams !== null && nutrition.gramsPerMl ? grams / nutrition.gramsPerMl / 100 : null;
  }
  if (ingredient.unit === 'buc') return quantity;
  const grams = ingredientMassGrams(ingredient, nutrition);
  return grams !== null && nutrition.gramsPerUnit ? grams / nutrition.gramsPerUnit : null;
}

function ingredientMassGrams(ingredient: IngredientDraft, nutrition: IngredientNutrition): number | null {
  const quantity = Number(ingredient.quantity);
  if (!Number.isFinite(quantity) || quantity < 0) return null;
  if (ingredient.unit === 'g') return quantity;
  if (ingredient.unit === 'kg') return quantity * 1000;
  if (ingredient.unit === 'ml' && nutrition.gramsPerMl) return quantity * nutrition.gramsPerMl;
  if (ingredient.unit === 'l' && nutrition.gramsPerMl) return quantity * 1000 * nutrition.gramsPerMl;
  if (ingredient.unit === 'buc' && nutrition.gramsPerUnit) return quantity * nutrition.gramsPerUnit;
  return null;
}

/** Suma maselor introduse; volumele și bucățile nu sunt convertite fără densitate/gramaj. */
export function estimateInputWeightGrams(ingredients: readonly IngredientDraft[]): number | null {
  let total = 0;
  let found = false;
  for (const ingredient of ingredients) {
    if (!ingredient.name.trim() || ingredient.quantity <= 0) continue;
    const grams = ingredientMassGrams(ingredient, normalizeIngredientNutrition(ingredient.nutrition));
    if (grams === null) return null;
    total += grams;
    found = true;
  }
  return found ? roundNutrition(total) : null;
}

function divideValues(values: NutritionValues, denominator: number): NutritionValues {
  return Object.fromEntries(DECLARED_NUTRIENT_KEYS.map((key) => [
    key,
    values[key] === null ? null : roundNutrition(values[key]! / denominator),
  ])) as unknown as NutritionValues;
}

export function calculateRecipeNutrition(recipe: RecipeDraft): RecipeNutritionResult {
  const active = enrichRecipeNutrition(recipe).ingredients.filter((ingredient) => (
    ingredient.name.trim() && Number(ingredient.quantity) > 0
  ));
  const totals = emptyNutritionValues();
  let incompatibleIngredientCount = 0;
  let unconfirmedIngredientCount = 0;
  const approximate = new Set<NutrientKey>();
  const missingIngredients: string[] = [];
  const incompatibleIngredients: string[] = [];
  const sources = new Set<string>();
  let autoIngredientCount = 0;
  let coveredIngredientCount = 0;

  const states = new Map<NutrientKey, { total: number; missing: boolean }>(
    DECLARED_NUTRIENT_KEYS.map((key) => [key, { total: 0, missing: active.length === 0 }]),
  );

  for (const ingredient of active) {
    const nutrition = normalizeIngredientNutrition(ingredient.nutrition);
    const factor = factorForIngredient(ingredient, nutrition);
    if (factor === null) incompatibleIngredientCount += 1;
    if (factor === null) incompatibleIngredients.push(ingredient.name);
    if (REQUIRED_NUTRIENT_KEYS.some((key) => nutrition.values[key] === null)) missingIngredients.push(ingredient.name);
    else if (factor !== null) coveredIngredientCount += 1;
    if (nutrition.automaticMatch) autoIngredientCount += 1;
    if (nutrition.sourceReference) sources.add(nutrition.sourceReference);
    for (const key of DECLARED_NUTRIENT_KEYS) if (nutrition.qualifiers?.[key]) approximate.add(key);
    if (!nutrition.confirmed || ingredient.allergensConfirmed !== true) {
      unconfirmedIngredientCount += 1;
    }

    for (const key of DECLARED_NUTRIENT_KEYS) {
      const state = states.get(key)!;
      const value = nutrition.values[key];
      if (factor === null || value === null) state.missing = true;
      else state.total += value * factor;
    }
  }

  for (const key of DECLARED_NUTRIENT_KEYS) {
    const state = states.get(key)!;
    totals[key] = state.missing ? null : state.total;
  }

  const servings = Math.max(1, Number(recipe.servings) || 1);
  const compliance = normalizeRecipeCompliance(recipe.compliance);
  const estimatedInputWeightGrams = estimateInputWeightGrams(active);
  const finalWeightGrams = compliance.finalWeightGrams ?? estimatedInputWeightGrams;
  const perPortion = divideValues(totals, servings);
  const per100g = finalWeightGrams && finalWeightGrams > 0
    ? divideValues(totals, finalWeightGrams / 100)
    : emptyNutritionValues();
  const missingRequired = REQUIRED_NUTRIENT_KEYS.filter((key) => per100g[key] === null);
  const completenessShare = (REQUIRED_NUTRIENT_KEYS.length - missingRequired.length) / REQUIRED_NUTRIENT_KEYS.length;
  const confirmedShare = active.length ? (active.length - unconfirmedIngredientCount) / active.length : 0;
  const compatibleShare = active.length ? (active.length - incompatibleIngredientCount) / active.length : 0;
  const precisionScore = Math.max(0, Math.min(100, Math.round(
    completenessShare * 40
    + confirmedShare * 25
    + compatibleShare * 10
    + (compliance.finalWeightGrams && compliance.finalWeightMeasured ? 25 : 0),
  )));

  return {
    total: Object.fromEntries(DECLARED_NUTRIENT_KEYS.map((key) => [key, totals[key] === null ? null : roundNutrition(totals[key]!)])) as unknown as NutritionValues,
    perPortion,
    per100g,
    finalWeightGrams,
    finalWeightMeasured: Boolean(compliance.finalWeightGrams && compliance.finalWeightMeasured),
    estimatedInputWeightGrams,
    missingRequired,
    unconfirmedIngredientCount,
    incompatibleIngredientCount,
    precisionScore,
    complete: missingRequired.length === 0
      && Boolean(compliance.finalWeightGrams && compliance.finalWeightMeasured)
      && unconfirmedIngredientCount === 0
      && incompatibleIngredientCount === 0
      && approximate.size === 0,
    approximateKeys: [...approximate],
    autoIngredientCount,
    coveredIngredientCount,
    ingredientCount: active.length,
    missingIngredients,
    incompatibleIngredients,
    sources: [...sources],
  };
}

/** Output litres/pieces are distinct from servings and from cooked mass. */
export function nutritionFromSubRecipe(source: Recipe): IngredientNutrition {
  const result = calculateRecipeNutrition(source);
  const output = Number(source.yieldQuantity);
  const validOutput = Number.isFinite(output) && output > 0;
  const basis = source.yieldUnit === 'l' ? '100ml' : source.yieldUnit === 'buc' ? 'unit' : '100g';
  const values = basis === '100g' ? result.per100g
    : validOutput ? divideValues(result.total, basis === '100ml' ? output * 10 : output) : emptyNutritionValues();
  return {
    basis, values, source: 'estimated', sourceReference: source.title, confirmed: result.complete,
    ...(result.approximateKeys.length ? { qualifiers: Object.fromEntries(result.approximateKeys.map((key) => [key, 'estimated'])) } : {}),
    gramsPerMl: basis === '100ml' && validOutput && result.finalWeightMeasured && result.finalWeightGrams
      ? result.finalWeightGrams / (output * 1000) : null,
    gramsPerUnit: basis === 'unit' && validOutput && result.finalWeightMeasured && result.finalWeightGrams
      ? result.finalWeightGrams / output : null,
  };
}

export function aggregateRecipeAdditives(recipe: RecipeDraft): string[] {
  const found = new Set<string>();
  for (const ingredient of recipe.ingredients) {
    for (const additive of ingredient.additives ?? []) {
      const cleaned = additive.trim();
      if (cleaned) found.add(cleaned);
    }
  }
  return [...found];
}
