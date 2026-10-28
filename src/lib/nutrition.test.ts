/**
 * MANAGER 24/7™ by PARADIM — proprietary software.
 * Copyright © 2026 PARADIM Operations SRL. All rights reserved.
 * Concept author and product director: Marius Paul Nemeșu.
 * See LICENSE-PROPRIETARY.md.
 */

import { describe, expect, it } from 'vitest';

import { createEmptyIngredient, createEmptyRecipe } from '@/lib/calculations';
import {
  calculateEnergyWithEuFactors,
  calculateRecipeNutrition,
  createEmptyIngredientNutrition,
} from '@/lib/nutrition';
import type { IngredientDraft, NutritionValues } from '@/types/recipe';

const completeValues: NutritionValues = {
  energyKj: 100,
  energyKcal: 24,
  fat: 2,
  saturates: 0.5,
  carbohydrates: 3,
  sugars: 1,
  fibre: 0.8,
  protein: 4,
  salt: 0.2,
};

function ingredient(overrides: Partial<IngredientDraft> = {}): IngredientDraft {
  return {
    ...createEmptyIngredient(0),
    name: 'Ingredient verificat',
    quantity: 100,
    allergensConfirmed: true,
    nutrition: {
      ...createEmptyIngredientNutrition('100g'),
      values: completeValues,
      source: 'product_label',
      sourceReference: 'Etichetă lot 1',
      confirmed: true,
    },
    ...overrides,
  };
}

describe('nutrition calculations', () => {
  it('uses every conversion factor relevant to ordinary recipes from EU Annex XIV', () => {
    expect(calculateEnergyWithEuFactors({
      carbohydrates: 10,
      protein: 5,
      fat: 3,
      fibre: 2,
    })).toEqual({ energyKj: 382, energyKcal: 91 });
  });

  it('calculates totals, per portion and per 100 g from net ingredient quantities', () => {
    const recipe = {
      ...createEmptyRecipe(),
      servings: 2,
      ingredients: [
        ingredient(),
        ingredient({
          id: 'second',
          quantity: 50,
          nutrition: {
            ...createEmptyIngredientNutrition('100g'),
            values: { ...completeValues, energyKj: 200, energyKcal: 48 },
            source: 'laboratory',
            sourceReference: 'Raport 2',
            confirmed: true,
          },
        }),
      ],
      compliance: {
        finalWeightGrams: 150,
        finalWeightMeasured: true,
        isDefrosted: false,
        nutritionNotes: null,
        templateId: null,
        sourceReference: null,
      },
    };
    const result = calculateRecipeNutrition(recipe);

    expect(result.total.energyKcal).toBe(48);
    expect(result.perPortion.energyKcal).toBe(24);
    expect(result.per100g.energyKcal).toBe(32);
    expect(result.complete).toBe(true);
  });

  it('keeps an unknown nutrient unknown instead of silently treating it as zero', () => {
    const incomplete = ingredient({
      nutrition: {
        ...createEmptyIngredientNutrition('100g'),
        values: { ...completeValues, salt: null },
        source: 'imported_workbook',
        sourceReference: 'M1.xlsx',
        confirmed: false,
      },
    });
    const result = calculateRecipeNutrition({
      ...createEmptyRecipe(),
      servings: 1,
      ingredients: [incomplete],
      compliance: {
        finalWeightGrams: 100,
        finalWeightMeasured: true,
        isDefrosted: false,
        nutritionNotes: null,
        templateId: 'm1-001',
        sourceReference: 'M1.xlsx',
      },
    });

    expect(result.per100g.salt).toBeNull();
    expect(result.missingRequired).toContain('salt');
    expect(result.complete).toBe(false);
  });

  it('labels input-weight fallback as an estimate', () => {
    const result = calculateRecipeNutrition({
      ...createEmptyRecipe(),
      servings: 1,
      ingredients: [ingredient({ quantity: 250 })],
    });
    expect(result.finalWeightGrams).toBe(250);
    expect(result.finalWeightMeasured).toBe(false);
    expect(result.complete).toBe(false);
  });
});
