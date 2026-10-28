/**
 * MANAGER 24/7™ by PARADIM — proprietary software.
 * Copyright © 2026 PARADIM Operations SRL. All rights reserved.
 * Concept author and product director: Marius Paul Nemeșu.
 * See LICENSE-PROPRIETARY.md.
 */

import {
  calculateRecipeTotals,
  calculateSubRecipeUnitCost,
  resolveRecipeAllergens,
} from '@/lib/calculations';
import { nutritionFromSubRecipe } from '@/lib/nutrition';
import type { CatalogIngredient, IngredientDraft, Recipe } from '@/types/recipe';

/** Adâncimea maximă de imbricare a semipreparatelor luată în calcul la recalcul. */
const MAX_PASSES = 8;

function sameIngredient(a: IngredientDraft, b: IngredientDraft) {
  return a.purchasePrice === b.purchasePrice
    && a.priceUnit === b.priceUnit
    && a.allergens.length === b.allergens.length
    && a.allergens.every((allergen, index) => allergen === b.allergens[index])
    && a.allergensConfirmed === b.allergensConfirmed
    && JSON.stringify(a.additives ?? []) === JSON.stringify(b.additives ?? [])
    && JSON.stringify(a.nutrition ?? null) === JSON.stringify(b.nutrition ?? null);
}

/** Aplică prețul curent din catalog rândurilor care trimit către acel ingredient. */
function applyCatalog(
  ingredient: IngredientDraft,
  catalog: Map<string, CatalogIngredient>,
): IngredientDraft {
  if (ingredient.kind !== 'product' || !ingredient.catalogId) return ingredient;
  const entry = catalog.get(ingredient.catalogId);
  if (!entry || !entry.active) return ingredient;
  return {
    ...ingredient,
    name: entry.name,
    purchasePrice: entry.purchasePrice,
    priceUnit: entry.priceUnit,
    allergens: entry.allergens,
    allergensConfirmed: entry.allergensConfirmed,
    additives: entry.additives,
    nutrition: entry.nutrition,
  };
}

/** Aplică costul curent al semipreparatului rândului care îl folosește. */
function applySubRecipe(
  ingredient: IngredientDraft,
  recipes: Map<string, Recipe>,
): IngredientDraft {
  if (ingredient.kind !== 'sub_recipe' || !ingredient.subRecipeId) return ingredient;
  const source = recipes.get(ingredient.subRecipeId);
  if (!source) return ingredient;
  return {
    ...ingredient,
    name: source.title,
    purchasePrice: calculateSubRecipeUnitCost(source),
    priceUnit: source.yieldUnit,
    allergens: source.allergens,
    allergensConfirmed: source.ingredients.every((item) => item.allergensConfirmed === true),
    additives: [...new Set(source.ingredients.flatMap((item) => item.additives ?? []))],
    nutrition: nutritionFromSubRecipe(source),
  };
}

function recalculateRecipe(
  recipe: Recipe,
  catalog: Map<string, CatalogIngredient>,
  recipes: Map<string, Recipe>,
): { recipe: Recipe; changed: boolean } {
  let changed = false;
  const ingredients = recipe.ingredients.map((ingredient) => {
    const next = applySubRecipe(applyCatalog(ingredient, catalog), recipes);
    if (!sameIngredient(ingredient, next) || ingredient.name !== next.name) changed = true;
    return next;
  });

  const allergens = resolveRecipeAllergens(ingredients, recipe.manualAllergens);
  const totals = calculateRecipeTotals({ ...recipe, ingredients });

  if (!changed && totals.totalCost === recipe.totals.totalCost) {
    return { recipe, changed: false };
  }
  return { recipe: { ...recipe, ingredients, allergens, totals }, changed: true };
}

/**
 * Recalculează întreaga listă de rețete: prețurile din catalog coboară în rânduri,
 * costul semipreparatelor urcă în rețetele care le folosesc, iar alergenii se
 * propagă odată cu ele. Se repetă până când nimic nu se mai schimbă, deci
 * un semipreparat folosit într-un semipreparat este acoperit.
 */
export function resolveRecipeGraph(
  input: readonly Recipe[],
  catalogEntries: readonly CatalogIngredient[] = [],
): { recipes: Recipe[]; changedIds: string[] } {
  const catalog = new Map(catalogEntries.map((entry) => [entry.id, entry]));
  let current = new Map(input.map((recipe) => [recipe.id, recipe]));
  const changedIds = new Set<string>();

  for (let pass = 0; pass < MAX_PASSES; pass += 1) {
    let anyChange = false;
    const next = new Map(current);

    for (const recipe of current.values()) {
      const result = recalculateRecipe(recipe, catalog, current);
      if (result.changed) {
        next.set(recipe.id, result.recipe);
        changedIds.add(recipe.id);
        anyChange = true;
      }
    }

    current = next;
    if (!anyChange) break;
  }

  return {
    recipes: input.map((recipe) => current.get(recipe.id) ?? recipe),
    changedIds: [...changedIds],
  };
}

/** Rețetele care folosesc, direct sau prin alt semipreparat, ingredientul dat. */
export function recipesUsingCatalogIngredient(
  recipes: readonly Recipe[],
  catalogId: string,
): Recipe[] {
  const direct = new Set(
    recipes
      .filter((recipe) => recipe.ingredients.some((ingredient) => ingredient.catalogId === catalogId))
      .map((recipe) => recipe.id),
  );

  let grew = true;
  while (grew) {
    grew = false;
    for (const recipe of recipes) {
      if (direct.has(recipe.id)) continue;
      const usesAffectedSubRecipe = recipe.ingredients.some((ingredient) => (
        ingredient.subRecipeId && direct.has(ingredient.subRecipeId)
      ));
      if (usesAffectedSubRecipe) {
        direct.add(recipe.id);
        grew = true;
      }
    }
  }

  return recipes.filter((recipe) => direct.has(recipe.id));
}

/** Rețetele care folosesc semipreparatul dat, direct sau imbricat. */
export function recipesUsingSubRecipe(
  recipes: readonly Recipe[],
  subRecipeId: string,
): Recipe[] {
  const affected = new Set<string>([subRecipeId]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const recipe of recipes) {
      if (affected.has(recipe.id)) continue;
      const uses = recipe.ingredients.some((ingredient) => (
        ingredient.subRecipeId && affected.has(ingredient.subRecipeId)
      ));
      if (uses) {
        affected.add(recipe.id);
        grew = true;
      }
    }
  }
  affected.delete(subRecipeId);
  return recipes.filter((recipe) => affected.has(recipe.id));
}

/**
 * Data la care au fost actualizate ultima oară prețurile folosite de o rețetă.
 * Se uită la ingredientele legate de catalog, inclusiv la cele care intră prin
 * semipreparate, ca fișa tipărită să spună cât de proaspete sunt cifrele.
 */
export function pricesUpdatedAt(
  recipe: Recipe,
  recipes: readonly Recipe[],
  catalog: readonly CatalogIngredient[],
): string | null {
  const byId = new Map(recipes.map((item) => [item.id, item]));
  const catalogById = new Map(catalog.map((entry) => [entry.id, entry]));

  const visited = new Set<string>();
  const catalogIds = new Set<string>();

  const walk = (current: Recipe) => {
    if (visited.has(current.id)) return;
    visited.add(current.id);
    for (const ingredient of current.ingredients) {
      if (ingredient.catalogId) catalogIds.add(ingredient.catalogId);
      if (ingredient.subRecipeId) {
        const source = byId.get(ingredient.subRecipeId);
        if (source) walk(source);
      }
    }
  };
  walk(recipe);

  let latest: string | null = null;
  for (const id of catalogIds) {
    const entry = catalogById.get(id);
    if (!entry) continue;
    if (!latest || new Date(entry.updatedAt).getTime() > new Date(latest).getTime()) {
      latest = entry.updatedAt;
    }
  }
  return latest;
}
