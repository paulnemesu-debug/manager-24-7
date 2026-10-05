/**
 * MANAGER 24/7™ by PARADIM — proprietary software.
 * Copyright © 2026 PARADIM Operations SRL. All rights reserved.
 * Concept author and product director: Marius Paul Nemeșu.
 * See LICENSE-PROPRIETARY.md.
 */

import type { Locale } from '@/i18n/translations';
import type { PriceAlertSummary } from '@/lib/price-alerts';

export function priceAlertMessage(
  summary: PriceAlertSummary,
  locale: Locale,
  money: (value: number) => string,
) {
  const title = `${summary.ingredientName} +${Math.round(summary.deltaPercent)}%`;
  return {
    title,
    body: locale === 'ro'
      ? `${summary.affectedRecipes} rețete afectate · impact ${money(summary.averagePortionLoss)}/porție.`
      : `${summary.affectedRecipes} recipes affected · impact ${money(summary.averagePortionLoss)}/portion.`,
  };
}

export async function notifyPriceAlert(
  _summary: PriceAlertSummary,
  _locale: Locale,
  _money: (value: number) => string,
) {
  return false;
}
