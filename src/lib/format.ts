/**
 * MANAGER 24/7™ by PARADIM — proprietary software.
 * Copyright © 2026 PARADIM Operations SRL. All rights reserved.
 * Concept author and product director: Marius Paul Nemeșu.
 * See LICENSE-PROPRIETARY.md.
 */

import { INTL_LOCALE, type Locale } from '@/i18n/translations';

export const SUPPORTED_CURRENCIES = ['RON', 'EUR', 'GBP', 'USD', 'HUF', 'PLN', 'BGN'] as const;
export type CurrencyCode = (typeof SUPPORTED_CURRENCIES)[number];
export const DEFAULT_CURRENCY: CurrencyCode = 'RON';

export function isCurrencyCode(value: string | null | undefined): value is CurrencyCode {
  return Boolean(value && (SUPPORTED_CURRENCIES as readonly string[]).includes(value));
}

export function formatMoney(
  value: number | null | undefined,
  locale: Locale = 'ro',
  currency: CurrencyCode = DEFAULT_CURRENCY,
): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return new Intl.NumberFormat(INTL_LOCALE[locale], {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatPercent(value: number | null | undefined, locale: Locale = 'ro'): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return `${new Intl.NumberFormat(INTL_LOCALE[locale], { maximumFractionDigits: 1 }).format(value)}%`;
}

export function formatNumber(
  value: number | null | undefined,
  locale: Locale = 'ro',
  maximumFractionDigits = 2,
): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return new Intl.NumberFormat(INTL_LOCALE[locale], { maximumFractionDigits }).format(value);
}

export function formatShortDate(value: string, locale: Locale = 'ro'): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat(INTL_LOCALE[locale], {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

export type Formatters = {
  currency: CurrencyCode;
  money: (value: number | null | undefined) => string;
  percent: (value: number | null | undefined) => string;
  number: (value: number | null | undefined, maximumFractionDigits?: number) => string;
  date: (value: string) => string;
};

export function createFormatters(
  locale: Locale,
  currency: CurrencyCode = DEFAULT_CURRENCY,
): Formatters {
  return {
    currency,
    money: (value) => formatMoney(value, locale, currency),
    percent: (value) => formatPercent(value, locale),
    number: (value, maximumFractionDigits = 2) => formatNumber(value, locale, maximumFractionDigits),
    date: (value) => formatShortDate(value, locale),
  };
}
