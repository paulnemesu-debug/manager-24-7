/**
 * MANAGER 24/7™ by PARADIM — proprietary software.
 * Copyright © 2026 PARADIM Operations SRL. All rights reserved.
 */

import { describe, expect, it } from 'vitest';

import { RECIPE_TEMPLATES } from '@/constants/recipe-templates';
import {
  assessNutritionReadiness,
  getTemplateNutritionReadiness,
} from '@/lib/nutrition-readiness';
import type { NutritionValues } from '@/types/recipe';

const values = (entries: Partial<NutritionValues>): NutritionValues => ({
  energyKj: null,
  energyKcal: null,
  fat: null,
  saturates: null,
  carbohydrates: null,
  sugars: null,
  fibre: null,
  protein: null,
  salt: null,
  ...entries,
});

describe('nutrition readiness', () => {
  it('reports complete only when all nine declared values exist', () => {
    const readiness = assessNutritionReadiness(values({
      energyKj: 100,
      energyKcal: 24,
      fat: 1,
      saturates: 0,
      carbohydrates: 3,
      sugars: 0,
      fibre: 2,
      protein: 4,
      salt: 0,
    }));
    expect(readiness).toEqual({ status: 'complete', available: 9, total: 9 });
  });

  it('treats zero as known data rather than as a missing value', () => {
    expect(assessNutritionReadiness(values({ energyKj: 0, energyKcal: 0 }))).toEqual({
      status: 'partial', available: 2, total: 9,
    });
  });

  it('distinguishes partial data from an entirely empty declaration', () => {
    expect(assessNutritionReadiness(values({ energyKcal: 125 })).status).toBe('partial');
    expect(assessNutritionReadiness(values({}))).toEqual({ status: 'empty', available: 0, total: 9 });
  });

  it('audits the current 479-template catalogue without fabricating missing nutrients', () => {
    const statuses = RECIPE_TEMPLATES.map((template) => getTemplateNutritionReadiness(template).status);
    expect(statuses.filter((status) => status === 'complete')).toHaveLength(160);
    expect(statuses.filter((status) => status === 'partial')).toHaveLength(303);
    expect(statuses.filter((status) => status === 'empty')).toHaveLength(16);
  });

  it('keeps every catalogue template in one explicit readiness state', () => {
    const statuses = RECIPE_TEMPLATES.map((template) => getTemplateNutritionReadiness(template).status);
    expect(statuses).toHaveLength(479);
    expect(statuses.every((status) => ['complete', 'partial', 'empty'].includes(status))).toBe(true);
  });
});
