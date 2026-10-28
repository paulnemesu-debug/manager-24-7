/**
 * MANAGER 24/7™ by PARADIM — proprietary software.
 * Copyright © 2026 PARADIM Operations SRL. All rights reserved.
 */

import type { RecipeTemplate } from '@/constants/recipe-templates';
import { DECLARED_NUTRIENT_KEYS, calculateRecipeNutrition } from '@/lib/nutrition';
import { draftFromM1Template } from '@/lib/recipe-templates';
import type { NutritionValues } from '@/types/recipe';

export type NutritionReadinessStatus = 'complete' | 'partial' | 'empty';

export type NutritionReadiness = {
  status: NutritionReadinessStatus;
  available: number;
  total: number;
};

const templateReadiness = new WeakMap<RecipeTemplate, NutritionReadiness>();

/** Unknown means null; numeric zero is a real declared value. */
export function assessNutritionReadiness(values: NutritionValues): NutritionReadiness {
  const available = DECLARED_NUTRIENT_KEYS.filter((key) => values[key] !== null).length;
  return {
    status: available === DECLARED_NUTRIENT_KEYS.length ? 'complete' : available > 0 ? 'partial' : 'empty',
    available,
    total: DECLARED_NUTRIENT_KEYS.length,
  };
}

/**
 * Reports what the copied template can actually calculate today. It never
 * replaces a missing nutrient with zero and does not claim human verification.
 */
export function getTemplateNutritionReadiness(template: RecipeTemplate): NutritionReadiness {
  const cached = templateReadiness.get(template);
  if (cached) return cached;
  const calculated = calculateRecipeNutrition(draftFromM1Template(template, 11));
  const readiness = assessNutritionReadiness(calculated.perPortion);
  templateReadiness.set(template, readiness);
  return readiness;
}
