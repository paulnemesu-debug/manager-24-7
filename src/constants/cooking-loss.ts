/**
 * MANAGER 24/7™ by PARADIM — proprietary software.
 * Copyright © 2026 PARADIM Operations SRL. All rights reserved.
 * Concept author and product director: Marius Paul Nemeșu.
 * See LICENSE-PROPRIETARY.md.
 */

import type { TranslationKey } from '@/i18n/translations';
import type { CookingMethod } from '@/types/recipe';

export type CookingLossSuggestion = {
  value: CookingMethod;
  labelKey: TranslationKey;
  suggestedPercent: number;
  rangeLabel: string;
};

export const COOKING_LOSS_SUGGESTIONS: readonly CookingLossSuggestion[] = [
  { value: 'none', labelKey: 'cooking.none', suggestedPercent: 0, rangeLabel: '0–3%' },
  { value: 'boil_meat_veg', labelKey: 'cooking.boil_meat_veg', suggestedPercent: 12, rangeLabel: '5–20%' },
  { value: 'steam', labelKey: 'cooking.steam', suggestedPercent: 8, rangeLabel: '3–15%' },
  { value: 'oven', labelKey: 'cooking.oven', suggestedPercent: 18, rangeLabel: '10–25%' },
  { value: 'grill', labelKey: 'cooking.grill', suggestedPercent: 25, rangeLabel: '20–35%' },
  { value: 'fry', labelKey: 'cooking.fry', suggestedPercent: 20, rangeLabel: '15–30%' },
  { value: 'saute', labelKey: 'cooking.saute', suggestedPercent: 12, rangeLabel: '8–20%' },
  { value: 'reduction', labelKey: 'cooking.reduction', suggestedPercent: 20, rangeLabel: '10–35%' },
  { value: 'custom', labelKey: 'cooking.custom', suggestedPercent: 0, rangeLabel: '' },
];

export function getCookingLossSuggestion(method: CookingMethod) {
  return COOKING_LOSS_SUGGESTIONS.find((option) => option.value === method)
    ?? COOKING_LOSS_SUGGESTIONS[0];
}
