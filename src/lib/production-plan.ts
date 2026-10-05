import type { Recipe } from '@/types/recipe';
import type { ProductionRequest } from '@/lib/operations';

export type ProductionPlan = Readonly<Record<string, number>>;

export function parseProductionPortions(raw: string): number {
  const value = Number(raw.trim().replace(',', '.'));
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

export function normalizeRecipeQuery(value: string): string {
  return value.trim().toLocaleLowerCase('ro-RO').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

export function recipeMatchesQuery(recipe: Pick<Recipe, 'title'>, query: string, categoryLabel = ''): boolean {
  const haystack = normalizeRecipeQuery(`${recipe.title} ${categoryLabel}`);
  return normalizeRecipeQuery(query).split(/\s+/).filter(Boolean).every((word) => haystack.includes(word));
}

export function searchProductionRecipes(
  recipes: readonly Recipe[],
  query: string,
  plan: ProductionPlan,
  categoryLabel: (recipe: Recipe) => string = () => '',
): Recipe[] {
  if (!normalizeRecipeQuery(query)) return [];
  return recipes.filter((recipe) => !recipe.isSubRecipe
    && !Object.hasOwn(plan, recipe.id)
    && recipeMatchesQuery(recipe, query, categoryLabel(recipe)))
    .sort((a, b) => a.title.localeCompare(b.title, 'ro-RO'));
}

export function addProductionRecipe(plan: ProductionPlan, recipe: Recipe): ProductionPlan {
  if (recipe.isSubRecipe || Object.hasOwn(plan, recipe.id)) return plan;
  const servings = recipe.servings;
  return { ...plan, [recipe.id]: Number.isFinite(servings) && servings > 0 ? servings : 1 };
}

export function removeProductionRecipe(plan: ProductionPlan, recipeId: string): ProductionPlan {
  const next = { ...plan };
  delete next[recipeId];
  return next;
}

export function buildProductionRequests(recipes: readonly Recipe[], plan: ProductionPlan): ProductionRequest[] {
  const sellableIds = new Set(recipes.filter((recipe) => !recipe.isSubRecipe).map((recipe) => recipe.id));
  return Object.entries(plan)
    .filter(([recipeId, portions]) => sellableIds.has(recipeId) && Number.isFinite(portions) && portions > 0)
    .map(([recipeId, portions]) => ({ recipeId, portions }));
}
