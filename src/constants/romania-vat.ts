/**
 * MANAGER 24/7™ by PARADIM — proprietary software.
 * Copyright © 2026 PARADIM Operations SRL. All rights reserved.
 * Concept author and product director: Marius Paul Nemeșu.
 * See LICENSE-PROPRIETARY.md.
 */

import type { TranslationKey } from '@/i18n/translations';

export const ROMANIA_VAT_EFFECTIVE_FROM = '2025-08-01';
export const ROMANIA_VAT_LAST_VERIFIED = '2026-08-27';

export type VatOption = {
  value: number;
  labelKey: TranslationKey;
  descriptionKey: TranslationKey;
};

export const ROMANIA_VAT_OPTIONS: readonly VatOption[] = [
  {
    value: 11,
    labelKey: 'vat.option11',
    descriptionKey: 'vat.option11Description',
  },
  {
    value: 21,
    labelKey: 'vat.option21',
    descriptionKey: 'vat.option21Description',
  },
];

export const DEFAULT_ROMANIA_RESTAURANT_VAT = 11;
