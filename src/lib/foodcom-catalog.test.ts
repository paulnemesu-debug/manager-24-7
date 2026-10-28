import { describe, expect, it } from 'vitest';
import { gzipSync, strToU8 } from 'fflate';

import { decodeFoodcomPayload, draftFromFoodcom, normalizeFoodcomRecipe, foodcomQuality, foodcomSearchTokens, foodcomIndexTerms } from '@/lib/foodcom-catalog';
import { normalizeRecipeCompliance, calculateRecipeNutrition } from '@/lib/nutrition';
import { calculateRecipeTotals, getFoodCostStatus } from '@/lib/calculations';
import { canReviewSourceRecipe, requiresSourceReview, updateSourceRecipeIngredients } from '@/lib/recipe-source-review';

// Verified source rows from Kaggle Food.com version 2. Quantity units are absent.
const source = {
  id: 38, title: 'Low-Fat Berry Blue Frozen Dessert', category: 'Frozen Desserts',
  ingredients: ['blueberries', 'granulated sugar', 'vanilla yogurt', 'lemon juice'],
  quantities: ['4', '1⁄4', '1', '1'], servings: 4, yield: null,
  instructions: ['Toss 2 cups berries with sugar.', 'Let stand for 45 minutes, stirring occasionally.'],
  nutrition: [170.9, 2.5, 1.3, 8, 29.8, 37.1, 3.6, 30.2, 3.2],
};

describe('Food.com source import', () => {
  it('does not fabricate grams, prices or ingredient nutrition from recipe totals', () => {
    const draft = draftFromFoodcom(normalizeFoodcomRecipe(source), 11, 'en');
    expect(draft.servings).toBe(4);
    expect(draft.ingredients.map((row) => row.quantity)).toEqual([0, 0, 0, 0]);
    expect(draft.ingredients.every((row) => row.purchasePrice === 0 && row.nutrition?.automaticDisabled === true)).toBe(true);
    expect(draft.ingredients.every((row) => Object.values(row.nutrition!.values).every((value) => value === null))).toBe(true);
    expect(calculateRecipeNutrition(draft).complete).toBe(false);
    expect(draft.compliance?.finalWeightGrams).toBeNull();
  });

  it('keeps source copies financially incomplete until an explicit review is persisted', () => {
    const draft = draftFromFoodcom(normalizeFoodcomRecipe(source), 11, 'en');
    draft.salePriceGross = 25;
    expect(draft.compliance?.sourceReviewRequired).toBe(true);
    expect(getFoodCostStatus(calculateRecipeTotals(draft).foodCostPercent, 30)).toBe('incomplete');
    const pending = normalizeRecipeCompliance(JSON.parse(JSON.stringify(draft.compliance)));
    expect(pending.sourceReviewRequired).toBe(true);
    const reviewed = normalizeRecipeCompliance({ ...pending, sourceReviewRequired: false });
    expect(reviewed.sourceReviewRequired).toBe(false);
    expect(canReviewSourceRecipe(draft)).toBe(false);
    draft.ingredients = draft.ingredients.map((ingredient) => ({ ...ingredient, quantity: 100 }));
    expect(canReviewSourceRecipe(draft)).toBe(false);
    draft.ingredients = draft.ingredients.map((ingredient) => ({ ...ingredient, purchasePrice: 10 }));
    expect(canReviewSourceRecipe(draft)).toBe(true);
    expect(requiresSourceReview(draft)).toBe(true);
    // The existing cloud schema stores sourceReference but not the optional flag.
    const cloudRoundtrip = normalizeRecipeCompliance({ templateId: reviewed.templateId, sourceReference: reviewed.sourceReference });
    expect(cloudRoundtrip.sourceReviewRequired).toBe(false);
    draft.compliance = cloudRoundtrip;
    expect(requiresSourceReview(draft)).toBe(false);
    expect(calculateRecipeTotals(draft).foodCostPercent).toBeGreaterThan(0);
    expect(normalizeRecipeCompliance({ templateId: 'foodcom-38' }).sourceReviewRequired).toBe(true);
    expect(normalizeRecipeCompliance({ templateId: 'local-template' }).sourceReviewRequired).toBeUndefined();
  });

  it('persists all nine source values and instructions as separate reference notes', () => {
    const draft = draftFromFoodcom(normalizeFoodcomRecipe(source), 11, 'en');
    const saved = normalizeRecipeCompliance(JSON.parse(JSON.stringify(draft.compliance)));
    expect(saved.templateId).toBe('foodcom-38');
    expect(saved.nutritionNotes).toContain('170.9 kcal');
    expect(saved.nutritionNotes).toContain('29.8 mg');
    expect(saved.nutritionNotes).toContain('Cholesterol: 8 mg');
    expect(saved.nutritionNotes).toContain('per source serving');
    expect(saved.nutritionNotes).toContain('Toss 2 cups berries with sugar.');
    expect(saved.nutritionNotes).toContain('1⁄4');
  });

  it('invalidates review after price, quantity, unit, add or remove changes but keeps nonmaterial edits', () => {
    const original = draftFromFoodcom(normalizeFoodcomRecipe(source), 11, 'en');
    original.salePriceGross = 25;
    original.ingredients = original.ingredients.map((row) => ({ ...row, quantity: 100, purchasePrice: 10 }));
    original.compliance = normalizeRecipeCompliance({ ...original.compliance, sourceReviewRequired: false });
    expect(requiresSourceReview(original)).toBe(false);
    const changed = updateSourceRecipeIngredients(original, original.ingredients.map((row) => ({ ...row, purchasePrice: 0 })));
    expect(changed.compliance?.sourceReviewRequired).toBe(true);
    expect(requiresSourceReview(changed)).toBe(true);
    expect(getFoodCostStatus(calculateRecipeTotals(changed).foodCostPercent, 30)).toBe('incomplete');
    expect(requiresSourceReview({ ...changed, compliance: original.compliance })).toBe(true);
    for (const ingredients of [
      original.ingredients.map((row) => ({ ...row, quantity: 200 })),
      original.ingredients.map((row) => ({ ...row, unit: 'kg' as const })),
      [...original.ingredients, { ...original.ingredients[0], id: 'added' }],
      original.ingredients.slice(1),
    ]) expect(updateSourceRecipeIngredients(original, ingredients).compliance?.sourceReviewRequired).toBe(true);
    const notesOnly = updateSourceRecipeIngredients(original, original.ingredients.map((row) => ({ ...row, allergensConfirmed: true })));
    expect(notesOnly.compliance).toEqual(original.compliance);
    expect(requiresSourceReview(notesOnly)).toBe(false);
  });

  it('keeps mismatched quantity and ingredient lists separate without losing either', () => {
    const recipe = normalizeFoodcomRecipe({ ...source, id: 46, ingredients: ['rice vinegar', 'haeo'], quantities: ['1⁄2', '5', '2', '1', '1', '1'], servings: null, yield: '1 cup' });
    expect(foodcomQuality(recipe)).toMatchObject({ quantitiesUnmatched: true, missingServings: true, missingIngredients: false });
    const draft = draftFromFoodcom(recipe, 11, 'en');
    expect(draft.ingredients.map((row) => row.name)).toEqual(['rice vinegar', 'haeo']);
    expect(draft.compliance?.nutritionNotes).toContain('1⁄2 | 5 | 2 | 1 | 1 | 1');
    expect(draft.compliance?.nutritionNotes).not.toContain('5 haeo');
    expect(draft.compliance?.nutritionNotes).toContain('Source servings: unknown');
  });

  it('rejects corrupted identity and avoids converting missing nutrients to zero', () => {
    expect(() => normalizeFoodcomRecipe({ ...source, id: 38.5 })).toThrow();
    expect(() => normalizeFoodcomRecipe({ ...source, title: '' })).toThrow();
    const row = normalizeFoodcomRecipe({ ...source, nutrition: [null, -1, Number.NaN] });
    expect(row.nutrition).toEqual([null, null, null, null, null, null, null, null, null]);
  });
});

describe('offline Food.com catalogue payload', () => {
  it('decodes the real gzip format with Unicode quantities and rejects corrupt bytes', () => {
    const payload = gzipSync(strToU8(JSON.stringify(source)));
    expect(decodeFoodcomPayload(payload).quantities).toEqual(['4', '1⁄4', '1', '1']);
    expect(() => decodeFoodcomPayload(new Uint8Array([1, 2, 3]))).toThrow();
  });

  it('normalizes search accents and treats query syntax as plain words', () => {
    expect(foodcomSearchTokens(' Crème--Brûlée ')).toEqual(['creme', 'brulee']);
    expect(foodcomSearchTokens('chicken" OR "soup')).toEqual(['chicken', 'or', 'soup']);
    expect(foodcomSearchTokens('  % _ " ')).toEqual([]);
  });

  it('indexes categories after long titles while limiting user queries', () => {
    const longTitle = `${'dessert '.repeat(25)}Frozen`;
    expect(foodcomSearchTokens(longTitle)).toEqual(['dessert']);
    expect(foodcomIndexTerms(`${longTitle} Breakfast`)).toEqual(['dessert', 'frozen', 'breakfast']);
  });
});
