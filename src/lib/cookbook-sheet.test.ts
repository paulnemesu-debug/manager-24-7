/**
 * MANAGER 24/7™ by PARADIM — proprietary software.
 * Copyright © 2026 PARADIM Operations SRL. All rights reserved.
 * Concept author and product director: Marius Paul Nemeșu.
 * See LICENSE-PROPRIETARY.md.
 */

import { describe, expect, it } from 'vitest';

import { translate } from '@/i18n/translations';
import { buildCookbookHtml, buildCookbookWorkbook } from '@/lib/cookbook-sheet';
import { createFormatters } from '@/lib/format';
import type { ExportContext } from '@/lib/recipe-sheet';
import type { Recipe } from '@/types/recipe';

const context: ExportContext = {
  t: (key, params) => translate('ro', key, params),
  format: createFormatters('ro', 'RON'), locale: 'ro', userEmail: null,
  pricesDate: null, plan: 'pro',
};

function recipe(id: string, title: string, category: Recipe['category']): Recipe {
  return {
    id, title, category, servings: 10, cookingMethod: 'none', cookingLossPercent: 0,
    salePriceGross: 33.3, vatPercent: 11, targetFoodCost: 30, isSubRecipe: false,
    yieldQuantity: 1, yieldUnit: 'kg', ingredients: [], manualAllergens: [], allergens: [],
    totals: { totalCost: 10, portionCost: 1, effectiveServings: 10, cookingYieldPercent: 100,
      salePriceNet: 30, foodCostPercent: 3.3, contributionMargin: 29,
      contributionMarginPercent: 96.7, recommendedPriceNet: 3.33, recommendedPriceGross: 3.7 },
    createdAt: '', updatedAt: '',
  };
}

describe('full cookbook export', () => {
  const recipes = [recipe('a', 'Supă cremă', 'soup'), recipe('b', 'Burger', 'main')];

  it('creates a PDF-ready document with contents and every recipe', () => {
    const html = buildCookbookHtml(recipes, context);
    expect(html).toContain('Cuprins');
    expect(html).toContain('Supă cremă');
    expect(html).toContain('Burger');
    expect(html).toContain('@page{size:A4 portrait;margin:7mm 8mm 7mm}');
    expect(html).toContain('table-layout:fixed');
    expect(html).toContain('page-break-inside:avoid');
  });

  it('creates an index and one workbook tab per category', () => {
    expect(buildCookbookWorkbook(recipes, context).SheetNames).toEqual(['Cuprins', 'Ciorbe Supe', 'Fel principal']);
  });
});
