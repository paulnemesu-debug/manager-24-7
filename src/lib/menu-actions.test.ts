import { describe, expect, it } from 'vitest';
import { calculateRecipeTotals } from '@/lib/calculations';
import { buildMenuEngineering } from '@/lib/operations';
import { buildMenuActions } from '@/lib/menu-actions';
import type { Recipe } from '@/types/recipe';

function dish(id: string, gross: number, cost: number): Recipe {
  const recipe = { id, title: id, category: 'main', servings: 10, cookingMethod: 'none', cookingLossPercent: 0,
    salePriceGross: gross, vatPercent: 11, targetFoodCost: 30, isSubRecipe: false, yieldQuantity: 1, yieldUnit: 'kg',
    ingredients: [{ id: `${id}-ingredient`, kind: 'product', catalogId: null, name: 'Ingredient principal',
      quantity: 1, unit: 'kg', purchasePrice: cost * 10, priceUnit: 'kg', lossPercent: 0, allergens: [] }],
    manualAllergens: [], allergens: [], createdAt: '', updatedAt: '',
  } as Omit<Recipe, 'totals'>;
  return { ...recipe, totals: calculateRecipeTotals(recipe) };
}
describe('menu engineering priorities', () => {
  it('excludes missing sales, invalid values and stale recipe IDs instead of treating them as zero sales', () => {
    const recipes = [dish('recorded', 33.3, 2), dish('unknown', 22.2, 1), dish('invalid', 22.2, 1)];
    expect(buildMenuEngineering(recipes, { recorded: 10, deleted: 99, invalid: NaN }).map((item) => item.recipe.id)).toEqual(['recorded']);
    expect(buildMenuActions(buildMenuEngineering(recipes, { recorded: 0 }))).toEqual([]);
  });
  it('ranks actual margin gaps first and limits actions to three without changing any recipe', () => {
    const recipes = [dish('over-target', 11.1, 5), dish('high-margin', 44.4, 2), dish('star', 33.3, 3), dish('low', 11.1, 2)];
    const snapshot = JSON.stringify(recipes);
    const items = buildMenuEngineering(recipes, { 'over-target': 90, 'high-margin': 5, star: 100, low: 5 });
    const actions = buildMenuActions(items);
    expect(actions).toHaveLength(3);
    expect(actions[0]).toMatchObject({ kind: 'recover', item: { recipe: { id: 'over-target' }, sold: 90 }, ingredientName: 'Ingredient principal' });
    expect(actions[0].marginGapAtRecordedVolume).toBeCloseTo(actions[0].marginGapPerPortion * 90, 0);
    expect(actions.some((action) => action.kind === 'promote')).toBe(true);
    expect(JSON.stringify(recipes)).toBe(snapshot);
  });
});
