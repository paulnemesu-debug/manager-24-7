/**
 * MANAGER 24/7™ by PARADIM — proprietary software.
 * Copyright © 2026 PARADIM Operations SRL. All rights reserved.
 * Concept author and product director: Marius Paul Nemeșu.
 * See LICENSE-PROPRIETARY.md.
 */

import { suggestAllergens } from '@/constants/allergen-presets';
import { RECIPE_TEMPLATES, type RecipeTemplate } from '@/constants/recipe-templates';
import { createEmptyRecipe } from '@/lib/calculations';
import type { RecipeDraft } from '@/types/recipe';

export function findM1Template(id: string | undefined): RecipeTemplate | undefined {
  return RECIPE_TEMPLATES.find((template) => template.id === id);
}

/** Copiază modelul într-un draft normal; modificările utilizatorului nu ating biblioteca. */
export function draftFromM1Template(
  template: RecipeTemplate,
  defaultVatPercent: number,
): RecipeDraft {
  const draft = createEmptyRecipe(defaultVatPercent);
  const sourceSheet = template.id.startsWith('m1-') ? `M1.xlsx · ${template.sourceSheet}` : template.sourceSheet;
  const sourceReference = `Biblioteca rețete · sursă ${sourceSheet} · rând ${template.sourceHeaderRow}`;
  const ingredients = template.ingredients.map((ingredient, index) => {
    const kcal = ingredient.energyKcalPer100g;
    return {
      id: `template-${template.id}-${index}`,
      kind: 'product' as const,
      catalogId: null,
      subRecipeId: null,
      name: ingredient.name,
      quantity: ingredient.quantityGrams,
      unit: 'g' as const,
      purchasePrice: ingredient.purchasePricePerKg,
      priceUnit: 'kg' as const,
      packageQuantity: null,
      packagePrice: null,
      lossPercent: 0,
      allergens: suggestAllergens(ingredient.name),
      allergensConfirmed: false,
      additives: [],
      nutrition: {
        basis: '100g' as const,
        values: {
          energyKj: kcal === null ? null : Math.round(kcal * 4.184 * 10) / 10,
          energyKcal: kcal,
          fat: null,
          saturates: null,
          carbohydrates: null,
          sugars: null,
          fibre: null,
          protein: null,
          salt: null,
        },
        source: 'imported_workbook' as const,
        sourceReference: ingredient.nutritionSourceRow
          ? `Biblioteca rețete · sursă ${sourceSheet} · Calorii Ingrediente · rând ${ingredient.nutritionSourceRow}`
          : sourceReference,
        confirmed: false,
      },
    };
  });
  return {
    ...draft,
    title: template.title,
    category: template.category,
    servings: 1,
    ingredients,
    compliance: {
      // Leave estimates dynamic: editing quantities must update the per-100g denominator.
      finalWeightGrams: null,
      finalWeightMeasured: false,
      isDefrosted: false,
      nutritionNotes: null,
      templateId: template.id,
      sourceReference,
    },
  };
}
