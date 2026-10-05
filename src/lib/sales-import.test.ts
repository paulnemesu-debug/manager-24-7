/**
 * MANAGER 24/7™ by PARADIM — proprietary software.
 * Copyright © 2026 PARADIM Operations SRL. All rights reserved.
 * Concept author and product director: Marius Paul Nemeșu.
 * See LICENSE-PROPRIETARY.md.
 */

import { describe, expect, it } from 'vitest';

import { matchSalesRows, parseSalesFile, parseSalesNumber } from '@/lib/sales-import';
import { demoRecipes } from '@/lib/demo-data';

describe('sales import', () => {
  it('parses Romanian CSV and keeps a human-review row number', async () => {
    const rows = await parseSalesFile('Preparat;Cantitate vândută\nBurger PARADIM;42\n');
    expect(rows).toEqual([{ name: 'Burger PARADIM', sold: 42, rowNumber: 2 }]);
  });

  it('keeps decimal dots and distinguishes thousands separators', () => {
    expect(parseSalesNumber('12.50')).toBe(12.5);
    expect(parseSalesNumber('12,50')).toBe(12.5);
    expect(parseSalesNumber('1.250')).toBe(1250);
    expect(parseSalesNumber('1,250.50')).toBe(1250.5);
    expect(parseSalesNumber('1.250,50')).toBe(1250.5);
  });

  it('does not turn 12.50 into 1,250 during CSV import', async () => {
    const rows = await parseSalesFile('Preparat;Cantitate\nBurger PARADIM;12.50\n');
    expect(rows[0]?.sold).toBe(12.5);
  });

  it('matches a recipe by normalized name', () => {
    const recipe = { ...demoRecipes[0], title: 'Ciorbă de pui' };
    const result = matchSalesRows([{ name: 'Ciorba de pui', sold: 12, rowNumber: 2 }], [recipe]);
    expect(result.matches[0]?.recipe.id).toBe(recipe.id);
    expect(result.unmatched).toHaveLength(0);
  });
});
