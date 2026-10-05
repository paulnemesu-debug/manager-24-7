/**
 * MANAGER 24/7™ by PARADIM — proprietary software.
 * Copyright © 2026 PARADIM Operations SRL. All rights reserved.
 * Concept author and product director: Marius Paul Nemeșu.
 * See LICENSE-PROPRIETARY.md.
 */

import { describe, expect, it } from 'vitest';

import { M1_RECIPE_TEMPLATES } from '@/constants/m1-recipe-templates';
import { RECIPE_TEMPLATES } from '@/constants/recipe-templates';
import { calculateRecipeNutrition } from '@/lib/nutrition';
import { draftFromM1Template, findM1Template } from '@/lib/recipe-templates';

describe('M1 recipe templates', () => {
  it('keeps the combined M1–M5 library strictly unique by normalized title', () => {
    const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('ro-RO').replace(/[^a-z0-9]+/g, ' ').trim();
    const titles = RECIPE_TEMPLATES.map((item) => normalize(item.title));
    expect(RECIPE_TEMPLATES).toHaveLength(479);
    expect(new Set(titles).size).toBe(titles.length);
  });
  it('contains every recipe block extracted from both workbook sheets', () => {
    expect(M1_RECIPE_TEMPLATES).toHaveLength(59);
    expect(new Set(M1_RECIPE_TEMPLATES.map((item) => item.id)).size).toBe(59);
    expect(M1_RECIPE_TEMPLATES.filter((item) => item.category === 'soup')).toHaveLength(6);
    expect(M1_RECIPE_TEMPLATES.filter((item) => item.category === 'salad')).toHaveLength(4);
    expect(M1_RECIPE_TEMPLATES.filter((item) => item.category === 'side')).toHaveLength(16);
    expect(M1_RECIPE_TEMPLATES.filter((item) => item.category === 'main')).toHaveLength(33);
  });

  it('creates a one-portion editable copy with traceable nutrition sources', () => {
    const source = findM1Template('m1-001')!;
    const first = draftFromM1Template(source, 11);
    const second = draftFromM1Template(source, 11);

    expect(first.servings).toBe(1);
    expect(first.category).toBe('soup');
    expect(first.ingredients.every((item) => item.quantity > 0 && item.unit === 'g')).toBe(true);
    expect(first.compliance?.sourceReference).toContain('M1.xlsx');
    expect(first.ingredients[0].nutrition?.source).toBe('imported_workbook');

    first.title = 'Modificat';
    first.ingredients[0].name = 'Modificat';
    expect(second.title).toBe(source.title);
    expect(second.ingredients[0].name).toBe(source.ingredients[0].name);
  });

  it('enriches an energy-only historical template from current ingredient data', () => {
    const source = findM1Template('m1-001')!;
    const draft = draftFromM1Template(source, 11);
    const result = calculateRecipeNutrition(draft);
    expect(result.autoIngredientCount).toBeGreaterThan(0);
    expect(result.perPortion.energyKcal).toBeGreaterThan(0);
    expect(result.sources.some((item) => item.includes('Ciqual'))).toBe(true);
    expect(draft.ingredients[0].nutrition?.source).toBe('imported_workbook'); // The immutable template still retains its provenance.
    expect(result.complete).toBe(false);
  });

  it('updates estimated weight when the ingredient quantities of a template change', () => {
    const draft = draftFromM1Template(findM1Template('m1-001')!, 11);
    expect(draft.compliance?.finalWeightGrams).toBeNull();
    const original = calculateRecipeNutrition(draft);
    const doubled = calculateRecipeNutrition({ ...draft,
      ingredients: draft.ingredients.map((item) => ({ ...item, quantity: item.quantity * 2 })),
    });
    expect(doubled.finalWeightGrams).toBeCloseTo(original.finalWeightGrams! * 2, 1);
    expect(doubled.per100g.energyKcal).toBe(original.per100g.energyKcal);
    expect(doubled.perPortion.energyKcal).toBeCloseTo(original.perPortion.energyKcal! * 2, 1);
  });
});
