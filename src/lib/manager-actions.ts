import type { Recipe } from '@/types/recipe';

export type ManagerAction = {
  recipe: Recipe;
  reductionPerPortion: number;
  recordedPortions: number | null;
  periodOpportunity: number | null;
};

const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

/** Cost reduction needed at the current selling price; estimates are not realised savings. */
export function buildManagerActions(recipes: readonly Recipe[], sales: Record<string, number>) {
  const sellable = recipes.filter((recipe) => !recipe.isSubRecipe);
  const measured = sellable.filter((recipe) => Number.isFinite(recipe.totals.foodCostPercent)
    && recipe.totals.salePriceNet > 0 && Number.isFinite(recipe.totals.portionCost)
    && recipe.targetFoodCost > 0 && recipe.targetFoodCost < 100);
  const hasSales = (recipe: Recipe) => Object.prototype.hasOwnProperty.call(sales, recipe.id)
    && Number.isFinite(sales[recipe.id]) && sales[recipe.id] >= 0;
  const actions: ManagerAction[] = measured.map((recipe) => {
    const reductionPerPortion = money(Math.max(0,
      recipe.totals.portionCost - recipe.totals.salePriceNet * recipe.targetFoodCost / 100));
    const recordedPortions = hasSales(recipe) ? sales[recipe.id] : null;
    return { recipe, reductionPerPortion, recordedPortions,
      periodOpportunity: recordedPortions === null ? null : money(reductionPerPortion * recordedPortions) };
  }).filter((item) => item.reductionPerPortion > 0);
  actions.sort((a, b) => {
    // Known positive volume precedes unmeasured dishes; an explicit zero is not an opportunity.
    const rank = (item: ManagerAction) => item.recordedPortions === null ? 1 : item.recordedPortions > 0 ? 2 : 0;
    return rank(b) - rank(a) || (b.periodOpportunity ?? 0) - (a.periodOpportunity ?? 0)
      || b.reductionPerPortion - a.reductionPerPortion || a.recipe.title.localeCompare(b.recipe.title);
  });
  return {
    actions: actions.slice(0, 3),
    totalActions: actions.length,
    sellableCount: sellable.length,
    measuredCount: measured.length,
    salesCoveredCount: measured.filter(hasSales).length,
    recordedPortions: measured.reduce((sum, recipe) => sum + (hasSales(recipe) ? sales[recipe.id] : 0), 0),
  };
}
