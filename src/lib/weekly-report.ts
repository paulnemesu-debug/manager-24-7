/**
 * MANAGER 24/7™ by PARADIM — proprietary software.
 * Copyright © 2026 PARADIM Operations SRL. All rights reserved.
 * Concept author and product director: Marius Paul Nemeșu.
 * See LICENSE-PROPRIETARY.md.
 */

import type { Locale } from '@/i18n/translations';
import type { StoredPriceAlert } from '@/lib/price-alert-history';
import type { Recipe } from '@/types/recipe';

export type WeeklyReportStats = {
  averageFoodCost: number | null;
  measuredRecipes: number;
  overTarget: number;
  recoverablePerPortion: number;
};

export function calculateWeeklyReportStats(recipes: readonly Recipe[]): WeeklyReportStats {
  const sellable = recipes.filter((recipe) => !recipe.isSubRecipe);
  const measured = sellable.filter((recipe) => recipe.totals.foodCostPercent !== null);
  const averageFoodCost = measured.length
    ? measured.reduce((sum, recipe) => sum + (recipe.totals.foodCostPercent ?? 0), 0) / measured.length
    : null;
  const overTargetRecipes = measured.filter((recipe) => (
    (recipe.totals.foodCostPercent ?? 0) > recipe.targetFoodCost
  ));
  const recoverablePerPortion = overTargetRecipes.reduce((sum, recipe) => (
    sum + Math.max(0, recipe.totals.portionCost - recipe.totals.salePriceNet * recipe.targetFoodCost / 100)
  ), 0);
  return {
    averageFoodCost,
    measuredRecipes: measured.length,
    overTarget: overTargetRecipes.length,
    recoverablePerPortion,
  };
}

export function buildWeeklyReport({
  locale,
  recipes,
  alerts,
  money,
  percent,
  dateLabel,
}: {
  locale: Locale;
  recipes: readonly Recipe[];
  alerts: readonly StoredPriceAlert[];
  money: (value: number | null) => string;
  percent: (value: number | null) => string;
  dateLabel: string;
}): string {
  const stats = calculateWeeklyReportStats(recipes);
  const latest = alerts[0] ?? null;
  if (locale === 'en') {
    return [
      `Manager 24/7 · Weekly report · ${dateLabel}`,
      `Average recipe food cost: ${percent(stats.averageFoodCost)} (simple recipe average, not actual restaurant food cost)`,
      `Recipes measured: ${stats.measuredRecipes}`,
      `Recipes over target: ${stats.overTarget}`,
      `Recoverable margin: ${money(stats.recoverablePerPortion)} / portion mix`,
      latest
        ? `Latest price alert: ${latest.ingredientName} +${Math.round(latest.deltaPercent)}% · ${latest.affectedRecipes} recipes affected`
        : 'Latest price alert: no recorded increases',
      '',
      'Generated in Manager 24/7 by PARADIM.',
    ].join('\n');
  }
  return [
    `Manager 24/7 · Raport săptămânal · ${dateLabel}`,
    `Media Food Cost a rețetelor: ${percent(stats.averageFoodCost)} (medie simplă, nu costul real al restaurantului)`,
    `Rețete măsurate: ${stats.measuredRecipes}`,
    `Rețete peste țintă: ${stats.overTarget}`,
    `Marjă recuperabilă: ${money(stats.recoverablePerPortion)} / mix de porții`,
    latest
      ? `Ultima alertă: ${latest.ingredientName} +${Math.round(latest.deltaPercent)}% · ${latest.affectedRecipes} rețete afectate`
      : 'Ultima alertă: nicio scumpire înregistrată',
    '',
    'Generat în Manager 24/7 by PARADIM.',
  ].join('\n');
}
