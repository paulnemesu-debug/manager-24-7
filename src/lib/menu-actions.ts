import { calculateIngredientCost } from '@/lib/calculations';
import type { MenuEngineeringItem } from '@/lib/operations';

export type MenuAction = {
  item: MenuEngineeringItem;
  kind: 'recover' | 'promote' | 'review' | 'protect';
  ingredientName: string | null;
  marginGapPerPortion: number;
  marginGapAtRecordedVolume: number;
  scenarioPriceGross: number;
  gapGoal: 'foodCost' | 'menuAverage';
};

/** Uses recorded sales only. Gaps are arithmetic opportunities, never sales forecasts. */
export function buildMenuActions(items: readonly MenuEngineeringItem[], limit = 3): MenuAction[] {
  if (!items.some((item) => item.sold > 0)) return [];
  const meanMargin = items.reduce((sum, item) => sum + item.contributionPerPortion, 0) / items.length;
  const actions = items.map((item): MenuAction => {
    const { recipe } = item;
    const target = Math.max(0.01, Math.min(99.99, recipe.targetFoodCost || 30)) / 100;
    const costGap = Math.max(0, recipe.totals.portionCost - recipe.totals.salePriceNet * target);
    const marginGap = item.classification === 'plowhorse' ? Math.max(0, meanMargin - item.contributionPerPortion) : 0;
    const gap = Math.max(costGap, marginGap);
    const kind = item.sold > 0 && gap > 0 ? 'recover' : item.classification === 'puzzle' ? 'promote'
      : item.classification === 'dog' ? 'review' : 'protect';
    const ingredient = [...recipe.ingredients].sort((a, b) => calculateIngredientCost(b) - calculateIngredientCost(a))[0];
    const targetPrice = kind === 'recover' ? Math.max(recipe.totals.recommendedPriceGross,
      (recipe.totals.salePriceNet + marginGap) * (1 + recipe.vatPercent / 100)) : recipe.salePriceGross;
    return { item, kind, ingredientName: ingredient?.name ?? null,
      marginGapPerPortion: Math.round(gap * 100) / 100,
      marginGapAtRecordedVolume: Math.round(gap * item.sold * 100) / 100,
      scenarioPriceGross: Math.round(targetPrice * 100) / 100, gapGoal: costGap >= marginGap ? 'foodCost' : 'menuAverage' };
  });
  const priority = { recover: 0, promote: 1, review: 2, protect: 3 };
  return actions.sort((a, b) => priority[a.kind] - priority[b.kind]
    || b.marginGapAtRecordedVolume - a.marginGapAtRecordedVolume
    || b.item.totalContribution - a.item.totalContribution || a.item.recipe.id.localeCompare(b.item.recipe.id))
    .slice(0, Math.max(0, limit));
}
