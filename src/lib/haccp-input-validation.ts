import type { HaccpFieldDefinition } from '@/constants/haccp-forms';
import type { HaccpValues } from '@/types/haccp';

/** Parse an entered decimal without silently removing invalid characters. */
export function parseHaccpNumber(raw: string): number | null {
  const value = raw.trim();
  if (!/^[+-]?(?:\d+(?:[.,]\d+)?|[.,]\d+)$/.test(value)) return null;
  const parsed = Number(value.replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}

export type HaccpValueIssue = { field: HaccpFieldDefinition; reason: 'number' | 'month' | 'year' | 'day' };

/** Empty optional measurements remain drafts; entered values must be valid. */
export function invalidHaccpValue(
  fields: readonly HaccpFieldDefinition[],
  values: HaccpValues,
  headerValues: HaccpValues = values,
): HaccpValueIssue | null {
  for (const field of fields) {
    const raw = values[field.key]?.trim();
    if (!raw || (field.type !== 'number' && field.type !== 'temperature')) continue;
    const amount = parseHaccpNumber(raw);
    if (amount === null) return { field, reason: 'number' };
    if (field.key === 'month' && (!/^\d+$/.test(raw) || amount < 1 || amount > 12)) return { field, reason: 'month' };
    if (field.key === 'year' && (!/^\d+$/.test(raw) || amount < 1 || amount > 9999)) return { field, reason: 'year' };
    if (field.key === 'day') {
      const month = parseHaccpNumber(headerValues.month ?? '');
      const year = parseHaccpNumber(headerValues.year ?? '');
      const leap = year !== null && year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
      const days = month === 2 ? (leap ? 29 : 28) : month !== null && [4, 6, 9, 11].includes(month) ? 30 : 31;
      if (!/^\d+$/.test(raw) || amount < 1 || amount > days) return { field, reason: 'day' };
    }
  }
  return null;
}
