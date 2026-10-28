import type { Locale } from '@/i18n/translations';

export type MoneyInput = { valid: true; value: number | null } | { valid: false; value: null };

/** Keep the user's text in the field; parse only complete, unsigned money amounts. */
export function parseMoneyInput(raw: string, locale: Locale): MoneyInput {
  const value = raw.trim().replace(/[\u00a0\u202f]/g, ' ');
  if (!value) return { valid: true, value: null };

  let normalized: string | undefined;
  if (/^\d+$/.test(value)) normalized = value;
  // One or two decimal digits are unambiguous in either supported locale.
  else if (/^\d*[.,]\d{1,2}$/.test(value)) normalized = value.replace(',', '.');
  else if (/^[1-9]\d{0,2}(?:,\d{3})+\.\d{1,2}$/.test(value)) normalized = value.replace(/,/g, '');
  else if (/^[1-9]\d{0,2}(?:\.\d{3})+,\d{1,2}$/.test(value)) normalized = value.replace(/\./g, '').replace(',', '.');
  else if (/^[1-9]\d{0,2}(?: \d{3})+(?:[.,]\d{1,2})?$/.test(value)) normalized = value.replace(/ /g, '').replace(',', '.');
  // A lone separator followed by three digits is ambiguous: use the locale's grouping separator.
  else if (locale === 'en' && /^[1-9]\d{0,2}(?:,\d{3})+$/.test(value)) normalized = value.replace(/,/g, '');
  else if (locale === 'ro' && /^[1-9]\d{0,2}(?:\.\d{3})+$/.test(value)) normalized = value.replace(/\./g, '');

  if (normalized === undefined) return { valid: false, value: null };
  const [whole, fraction = ''] = normalized.split('.');
  const cents = Number(`${whole || '0'}${fraction.padEnd(2, '0')}`);
  return Number.isSafeInteger(cents) ? { valid: true, value: cents / 100 } : { valid: false, value: null };
}

export function moneyInputHint(locale: Locale) {
  return locale === 'ro'
    ? 'Introdu o sumă pozitivă sau zero, cu cel mult 2 zecimale (ex. 1.234,56).'
    : 'Enter a non-negative amount with at most 2 decimal places (e.g. 1,234.56).';
}
