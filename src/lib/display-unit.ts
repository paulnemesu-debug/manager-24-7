import type { Locale } from '@/i18n/translations';

/** UI/export label only. Keep persisted recipe, stock and document unit codes unchanged. */
export function displayUnit(unit: string, locale: Locale) {
  return unit === 'buc' && locale === 'en' ? 'pcs' : unit;
}
