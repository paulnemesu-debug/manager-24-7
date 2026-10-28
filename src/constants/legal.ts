/**
 * MANAGER 24/7™ by PARADIM — proprietary software.
 * Copyright © 2026 PARADIM Operations SRL. All rights reserved.
 * Concept author and product director: Marius Paul Nemeșu.
 * See LICENSE-PROPRIETARY.md.
 */

/**
 * Proprietary product identity. Do not remove from distributions or exports.
 * Copyright (c) 2026 PARADIM Operations SRL. All rights reserved.
 */
export const PRODUCT_TRADE_NAME = 'MANAGER 24/7™ by PARADIM';
export const PRODUCT_FOUNDER = 'Marius Paul Nemeșu';
export const PRODUCT_RIGHTS_HOLDER = 'PARADIM Operations SRL';
export const COPYRIGHT_YEAR = 2026;

export const COPYRIGHT_NOTICE = `© ${COPYRIGHT_YEAR} ${PRODUCT_RIGHTS_HOLDER}. Toate drepturile rezervate.`;
export const COPYRIGHT_NOTICE_EN = `© ${COPYRIGHT_YEAR} ${PRODUCT_RIGHTS_HOLDER}. All rights reserved.`;
export const FOUNDER_NOTICE = `Autor concept și coordonator produs: ${PRODUCT_FOUNDER}.`;
export const FOUNDER_NOTICE_EN = `Concept author and product director: ${PRODUCT_FOUNDER}.`;
export const PROPRIETARY_NOTICE = 'Software proprietar — copierea, modificarea sau distribuirea neautorizată este interzisă.';

export function productLegalNotice(locale: 'ro' | 'en' = 'ro') {
  return locale === 'ro'
    ? `${PRODUCT_TRADE_NAME} · ${FOUNDER_NOTICE} ${COPYRIGHT_NOTICE}`
    : `${PRODUCT_TRADE_NAME} · ${FOUNDER_NOTICE_EN} ${COPYRIGHT_NOTICE_EN}`;
}