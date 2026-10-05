import { describe, expect, it } from 'vitest';

import { demoRecipes } from '@/lib/demo-data';
import { buildShoppingList } from '@/lib/operations';
import { addProductionRecipe, buildProductionRequests, parseProductionPortions, recipeMatchesQuery, removeProductionRecipe, searchProductionRecipes } from '@/lib/production-plan';
import type { Recipe } from '@/types/recipe';

const dish = demoRecipes.find((recipe) => !recipe.isSubRecipe)!;
const sauce = demoRecipes.find((recipe) => recipe.isSubRecipe)!;
const flourDish: Recipe = {
  ...dish, id: 'flour-dish', title: 'Pâine de casă', servings: 10,
  ingredients: [{
    id: 'flour-line', kind: 'product', catalogId: 'flour', subRecipeId: null,
    name: 'Făină', quantity: 1, unit: 'kg', purchasePrice: 10, priceUnit: 'kg', lossPercent: 0, allergens: [],
  }],
};

describe('search and add production planning', () => {
  it('matches Romanian names without accents and accepts words in either order', () => {
    expect(recipeMatchesQuery({ title: 'Ciorbă de pui' }, 'PUI ciorba')).toBe(true);
    expect(recipeMatchesQuery({ title: 'Ciorbă de pui' }, 'pui porc')).toBe(false);
    expect(recipeMatchesQuery({ title: 'Ciorbă de pui' }, 'supa', 'Ciorbe / Supe')).toBe(false);
    expect(recipeMatchesQuery({ title: 'Ciorbă de pui' }, 'supe', 'Ciorbe / Supe')).toBe(true);
  });

  it('does not show the entire recipe library before entering a search', () => {
    expect(searchProductionRecipes(demoRecipes, '  ', {})).toEqual([]);
  });

  it('excludes semipreparations and already selected dishes, including a cleared portion field', () => {
    const related = [{ ...dish, title: 'Sos burger' }, { ...sauce, title: 'Sos casei' }];
    expect(searchProductionRecipes(related, 'sos', {}).map((recipe) => recipe.id)).toEqual([dish.id]);
    expect(searchProductionRecipes(related, 'sos', { [dish.id]: 0 })).toEqual([]);
  });

  it('starts with the recipe batch portions and does not overwrite an existing selection', () => {
    expect(addProductionRecipe({}, dish)).toEqual({ [dish.id]: dish.servings });
    expect(addProductionRecipe({ [dish.id]: 15 }, dish)).toEqual({ [dish.id]: 15 });
    expect(addProductionRecipe({}, sauce)).toEqual({});
    expect(addProductionRecipe({}, { ...dish, servings: 0 })).toEqual({ [dish.id]: 1 });
  });

  it('accepts fractional portions and prevents negative or nonfinite quantities', () => {
    expect(parseProductionPortions(' 12,5 ')).toBe(12.5);
    for (const input of ['-5', 'Infinity', 'abc', '']) expect(parseProductionPortions(input)).toBe(0);
  });

  it('ignores recipes deleted from the library and invalid requests', () => {
    expect(buildProductionRequests([dish, sauce], {
      [dish.id]: 12.5, [sauce.id]: 10, missing: 20,
    })).toEqual([{ recipeId: dish.id, portions: 12.5 }]);
    for (const value of [0, -1, NaN, Infinity]) expect(buildProductionRequests([dish], { [dish.id]: value })).toEqual([]);
  });

  it('updates the shopping quantities and total when portions change or a dish is removed', () => {
    const recipes = [flourDish];
    const plan = addProductionRecipe({}, flourDish);
    expect(buildShoppingList(recipes, [], buildProductionRequests(recipes, plan))[0]).toMatchObject({ name: 'Făină', quantity: 1, cost: 10 });
    expect(buildShoppingList(recipes, [], buildProductionRequests(recipes, { ...plan, [flourDish.id]: 25 }))[0]).toMatchObject({ quantity: 2.5, cost: 25 });
    expect(buildShoppingList(recipes, [], buildProductionRequests(recipes, removeProductionRecipe(plan, flourDish.id)))).toEqual([]);
    expect(plan).toEqual({ [flourDish.id]: 10 });
  });

  it('expands a nested semipreparation into groceries using its batch yield and ingredient loss', () => {
    const base: Recipe = { ...flourDish, id: 'dough', title: 'Aluat', isSubRecipe: true, yieldQuantity: 2, yieldUnit: 'kg', ingredients: [{ ...flourDish.ingredients[0], lossPercent: 20 }] };
    const intermediate: Recipe = { ...base, id: 'crust', title: 'Blat', yieldQuantity: 1, ingredients: [{ ...base.ingredients[0], kind: 'sub_recipe', catalogId: null, subRecipeId: 'dough', name: 'Aluat', quantity: 500, unit: 'g', lossPercent: 0 }] };
    const pizza: Recipe = { ...flourDish, id: 'pizza', title: 'Pizza', ingredients: [{ ...intermediate.ingredients[0], subRecipeId: 'crust', name: 'Blat', quantity: 1, unit: 'kg' }] };
    const lines = buildShoppingList([pizza, intermediate, base], [], [{ recipeId: pizza.id, portions: 20 }]);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ name: 'Făină', quantity: 0.625, cost: 6.25 });
  });

  it('terminates safely when an imported semipreparation references itself', () => {
    const cyclic: Recipe = { ...flourDish, isSubRecipe: true, ingredients: [{ ...flourDish.ingredients[0], kind: 'sub_recipe', catalogId: null, subRecipeId: flourDish.id }] };
    expect(buildShoppingList([cyclic], [], [{ recipeId: cyclic.id, portions: 10 }])).toEqual([]);
  });
});
