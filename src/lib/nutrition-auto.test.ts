import { describe, expect, it, vi } from 'vitest';
import data from '@/constants/nutrition-ciqual.json';
import { NUTRITION_ALIASES, NUTRITION_SEARCH_TERMS } from '@/constants/nutrition-aliases';
import { createEmptyIngredient, createEmptyRecipe, calculateRecipeTotals, createSubRecipeIngredient } from '@/lib/calculations';
import { findAutomaticNutrition, parseCiqualValue, searchLocalNutrition } from '@/lib/nutrition-auto';
import { calculateRecipeNutrition, createEmptyIngredientNutrition, enrichIngredientNutrition, enrichRecipeNutrition, normalizeIngredientNutrition } from '@/lib/nutrition';
import { buildNutritionRows, buildRecipeHtml, buildRecipeWorkbook } from '@/lib/recipe-sheet';
import { resolveRecipeGraph } from '@/lib/recipe-graph';
import { createFormatters } from '@/lib/format';
import { translate } from '@/i18n/translations';
import type { IngredientDraft, Recipe, RecipeDraft } from '@/types/recipe';

const ingredient = (name: string, quantity = 100, extra: Partial<IngredientDraft> = {}): IngredientDraft => ({
  ...createEmptyIngredient(), name, quantity, ...extra,
});
const recipe = (ingredients: IngredientDraft[], extra: Partial<RecipeDraft> = {}): RecipeDraft => ({
  ...createEmptyRecipe(), title: 'Preparat test', servings: 2, ingredients, ...extra,
});
const saved = (draft: RecipeDraft): Recipe => ({
  ...draft, id: 'test', allergens: [], totals: calculateRecipeTotals(draft),
  createdAt: '2026-10-04', updatedAt: '2026-10-04',
});
const context = { locale: 'ro' as const, t: (key: Parameters<typeof translate>[1], args?: Record<string, string | number>) => translate('ro', key, args), format: createFormatters('ro'), plan: 'pro' as const, userEmail: null, pricesDate: null };

describe('free offline automatic nutrition', () => {
  it('ships all 3484 official foods and valid nine-field source rows', () => {
    expect(data.foods).toHaveLength(3484);
    expect(new Set(data.foods.map((food) => food.code)).size).toBe(3484);
    expect(data.sourceMd5).toBe('0d9758ce23f3f13dd63a005bc1bb4f2c');
    const codes = new Set(data.foods.map((food) => food.code));
    for (const [code, aliases] of Object.entries(NUTRITION_ALIASES)) {
      expect(codes.has(code)).toBe(true);
      for (const alias of aliases) expect(findAutomaticNutrition(alias)?.automaticMatch?.foodCode).toBe(code);
    }
    for (const code of Object.keys(NUTRITION_SEARCH_TERMS)) expect(codes.has(code)).toBe(true);
    for (const food of data.foods) {
      expect(food.nutrients).toHaveLength(9);
      for (const raw of food.nutrients) {
        const parsed = parseCiqualValue(raw);
        expect(parsed.value === null || (Number.isFinite(parsed.value) && parsed.value >= 0)).toBe(true);
      }
    }
  });

  it('distinguishes unknown values, upper limits and traces', () => {
    expect(parseCiqualValue('-')).toEqual({ value: null });
    expect(parseCiqualValue('0')).toEqual({ value: 0 });
    expect(parseCiqualValue('3,42')).toEqual({ value: 3.42 });
    expect(parseCiqualValue('< 0,5')).toEqual({ value: 0.5, qualifier: '< 0,5' });
    expect(parseCiqualValue('traces')).toEqual({ value: 0, qualifier: 'traces' });
    expect(parseCiqualValue('not a value')).toEqual({ value: null });
  });

  it('fills Romanian aliases with diacritics and punctuation without network calls', () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'));
    const result = enrichIngredientNutrition(ingredient('  PIEPT DE PUI '));
    expect(result.nutrition?.values.energyKcal).toBe(110);
    expect(result.nutrition?.values.protein).toBe(23.4);
    expect(result.nutrition?.sourceReference).toContain('36017');
    expect(result.nutrition?.confirmed).toBe(false);
    expect(searchLocalNutrition('ȚELINĂ')[0].nutrition.values.energyKcal).toBeGreaterThan(0);
    expect(fetch).not.toHaveBeenCalled();
    fetch.mockRestore();
  });

  it('never guesses ambiguous foods, brands or a different cooking state', () => {
    expect(findAutomaticNutrition('pui')).toBeNull();
    expect(findAutomaticNutrition('piept de pui afumat')).toBeNull();
    expect(findAutomaticNutrition('lapte marca necunoscuta')).toBeNull();
    expect(findAutomaticNutrition('orez fiert')?.automaticMatch?.foodCode).toBe('9104');
    expect(findAutomaticNutrition('orez')?.automaticMatch?.foodCode).toBe('9100');
  });

  it('shows generic assumptions as estimates and still offers exact offline choices', () => {
    expect(findAutomaticNutrition('smantana lichida')).toMatchObject({ source: 'estimated', confirmed: false, automaticMatch: { foodCode: '19403' } });
    expect(searchLocalNutrition('smantana lichida').map((item) => item.code)).toContain('19417');
    expect(findAutomaticNutrition('ou melange')).toMatchObject({ source: 'estimated', confirmed: false, automaticMatch: { foodCode: '22000' } });
    expect(searchLocalNutrition('ou melange').map((item) => item.code)).toEqual(expect.arrayContaining(['22000', '22001', '22002']));
    expect(searchLocalNutrition('smantana lichida').every((item) => item.nutrition.automaticDisabled)).toBe(true);
  });

  it('replaces auto values on renaming and removes old conversions for a different food', () => {
    const carrot = enrichIngredientNutrition(ingredient('morcov'));
    const rice = enrichIngredientNutrition({ ...carrot, name: 'orez', nutrition: { ...carrot.nutrition!, gramsPerMl: 1.2 } });
    expect(rice.nutrition?.automaticMatch?.foodCode).toBe('9100');
    expect(rice.nutrition?.gramsPerMl).toBeNull();
    const unknown = enrichIngredientNutrition({ ...rice, name: 'ingrediente secrete' });
    expect(Object.values(unknown.nutrition!.values).every((value) => value === null)).toBe(true);
    expect(unknown.nutrition?.sourceReference).toBeNull();
  });

  it('preserves complete and partial manual product data without mixing databases', () => {
    const manual = { ...createEmptyIngredientNutrition(), source: 'product_label' as const,
      values: { ...createEmptyIngredientNutrition().values, energyKcal: 123 }, sourceReference: 'Actual label' };
    expect(enrichIngredientNutrition(ingredient('morcov', 100, { nutrition: manual })).nutrition?.values.energyKcal).toBe(123);
    expect(enrichIngredientNutrition(ingredient('morcov', 100, { nutrition: manual })).nutrition?.values.fat).toBeNull();
    const disabled = { ...createEmptyIngredientNutrition(), automaticDisabled: true };
    expect(enrichIngredientNutrition(ingredient('morcov', 100, { nutrition: disabled })).nutrition?.values.energyKcal).toBeNull();
  });

  it('replaces unconfirmed historical energy-only workbook rows, preserving the original draft', () => {
    const old = ingredient('morcov', 100, { nutrition: {
      ...createEmptyIngredientNutrition(), source: 'imported_workbook',
      values: { ...createEmptyIngredientNutrition().values, energyKcal: 999 },
    } });
    const enriched = enrichRecipeNutrition(recipe([old]));
    expect(enriched.ingredients[0].nutrition?.values.energyKcal).toBe(30.2);
    expect(old.nutrition?.values.energyKcal).toBe(999);
    expect(enriched.ingredients[0].nutrition?.values.protein).toBe(0.78);
  });

  it('calculates a final chicken/carrot recipe and adjusts per 100 g to measured cooked weight', () => {
    const draft = recipe([ingredient('piept de pui', 200), ingredient('morcov', 100)], {
      compliance: { finalWeightGrams: 250, finalWeightMeasured: true, isDefrosted: false, nutritionNotes: null, templateId: null, sourceReference: null },
    });
    const result = calculateRecipeNutrition(draft);
    expect(result.total.energyKcal).toBe(250.2);
    expect(result.perPortion.energyKcal).toBe(125.1);
    expect(result.per100g.energyKcal).toBe(100.08);
    expect(result.perPortion.protein).toBe(23.79);
    expect(result.coveredIngredientCount).toBe(2);
    expect(result.approximateKeys).toContain('sugars');
    expect(result.complete).toBe(false);
  });

  it('does not hide a missing ingredient by reporting a partial total as the whole recipe', () => {
    const result = calculateRecipeNutrition(recipe([ingredient('morcov'), ingredient('produs propriu fara date')]));
    expect(result.perPortion.energyKcal).toBeNull();
    expect(result.missingIngredients).toEqual(['produs propriu fara date']);
    expect(result.coveredIngredientCount).toBe(1);
  });

  it('supports g/kg and rejects unsupplied density or piece mass', () => {
    const result = calculateRecipeNutrition(recipe([ingredient('ou', 2, { unit: 'buc', priceUnit: 'buc' })]));
    expect(result.perPortion.energyKcal).toBeNull();
    expect(result.incompatibleIngredients).toEqual(['ou']);
    expect(calculateRecipeNutrition(recipe([ingredient('morcov', 1, { unit: 'kg' })])).total.energyKcal).toBe(302);
  });

  it('uses an explicitly supplied edible egg mass and oil density', () => {
    const egg = ingredient('ou', 2, { unit: 'buc', priceUnit: 'buc', nutrition: { ...createEmptyIngredientNutrition(), gramsPerUnit: 50 } });
    const oil = ingredient('ulei de floarea soarelui', 100, { unit: 'ml', priceUnit: 'l', nutrition: { ...createEmptyIngredientNutrition(), gramsPerMl: 0.92 } });
    const result = calculateRecipeNutrition(recipe([egg, oil]));
    expect(result.estimatedInputWeightGrams).toBe(192);
    expect(result.total.energyKcal).toBe(findAutomaticNutrition('ou')!.values.energyKcal! + 828);
    expect(result.incompatibleIngredientCount).toBe(0);
  });

  it('preserves mass conversions, qualifiers and provenance across JSON storage normalization', () => {
    const nutrition = { ...findAutomaticNutrition('piept pui')!, gramsPerUnit: 75 };
    expect(normalizeIngredientNutrition(JSON.parse(JSON.stringify(nutrition)))).toMatchObject(nutrition);
  });

  it('keeps tiny nutrient contributions before per 100 g scaling', () => {
    const nutrition = { ...createEmptyIngredientNutrition(), values: { ...createEmptyIngredientNutrition().values, salt: 0.1 } };
    expect(calculateRecipeNutrition(recipe([ingredient('special', 1, { nutrition })])).per100g.salt).toBe(0.1);
  });

  it('propagates sub-recipe nutrition using output pieces rather than servings', () => {
    const source = saved(recipe([ingredient('morcov', 100)], { servings: 2, yieldQuantity: 10, yieldUnit: 'buc', isSubRecipe: true }));
    const child = createSubRecipeIngredient(source);
    expect(child.nutrition?.values.energyKcal).toBe(3.02);
    expect(calculateRecipeNutrition(recipe([{ ...child, quantity: 2 }])).total.energyKcal).toBe(6.04);
    const resolved = resolveRecipeGraph([source, { ...saved(recipe([{ ...child, quantity: 2 }])), id: 'parent' }]);
    expect(resolved.recipes[1].ingredients[0].nutrition?.values.energyKcal).toBe(3.02);
  });

  it('does not trigger a cloud version change just to enrich an existing recipe on read', () => {
    const source = saved(recipe([ingredient('morcov', 100)]));
    expect(resolveRecipeGraph([source]).changedIds).toEqual([]);
    expect(calculateRecipeNutrition(source).total.energyKcal).toBe(30.2);
    expect(source.ingredients[0].nutrition?.values.energyKcal).toBeNull();
  });

  it('propagates litres by actual output volume, with density only from measured weight', () => {
    const source = saved(recipe([ingredient('morcov', 1000)], { yieldQuantity: 2, yieldUnit: 'l', isSubRecipe: true,
      compliance: { finalWeightGrams: 2100, finalWeightMeasured: true, isDefrosted: false, nutritionNotes: null, templateId: null, sourceReference: null } }));
    const child = createSubRecipeIngredient(source);
    expect(child.nutrition?.basis).toBe('100ml');
    expect(child.nutrition?.values.energyKcal).toBe(15.1);
    expect(child.nutrition?.gramsPerMl).toBe(1.05);
    expect(calculateRecipeNutrition(recipe([{ ...child, quantity: 500 }])).total.energyKcal).toBe(75.5);
  });

  it('uses identical automatic totals in the final recipe, PDF HTML and Excel export', () => {
    const final = saved(recipe([ingredient('morcov', 100), ingredient('piept pui', 200)]));
    const rows = buildNutritionRows(final, context);
    expect(rows.find((row) => row[0] === 'Proteine')?.[2]).toContain('23,79');
    const html = buildRecipeHtml(final, context);
    const excel = buildRecipeWorkbook(final, context).Sheets['Food Cost'].rows.flat().join(' ');
    for (const exportText of [html, excel]) {
      expect(exportText).toContain('23,79');
      expect(exportText).toContain('Ciqual');
      expect(exportText).toContain('36017');
      expect(exportText).toContain('≈');
      expect(exportText).toContain('CALCUL ORIENTATIV');
    }
  });
});
