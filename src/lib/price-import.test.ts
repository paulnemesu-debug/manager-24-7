/**
 * MANAGER 24/7™ by PARADIM — proprietary software.
 * Copyright © 2026 PARADIM Operations SRL. All rights reserved.
 * Concept author and product director: Marius Paul Nemeșu.
 * See LICENSE-PROPRIETARY.md.
 */

import { describe, expect, it } from 'vitest';
import writeXlsxFile from 'write-excel-file/universal';

import {
  matchPriceList,
  parsePrice,
  parsePriceList,
  parseUnit,
  similarity,
} from './price-import';
import type { CatalogIngredient } from '@/types/recipe';

function entry(overrides: Partial<CatalogIngredient> & { id: string; name: string }): CatalogIngredient {
  return {
    purchasePrice: 10,
    priceUnit: 'kg',
    packageQuantity: null,
    packagePrice: null,
    defaultLossPercent: 0,
    supplier: null,
    notes: null,
    allergens: [],
    active: true,
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

async function workbookBuffer(rows: (string | number | null)[][]): Promise<ArrayBuffer> {
  const blob = await writeXlsxFile(rows).toBlob();
  return blob.arrayBuffer();
}

describe('price parsing', () => {
  it('reads both Romanian and English decimal styles', () => {
    expect(parsePrice('12,34')).toBe(12.34);
    expect(parsePrice('1.234,56')).toBe(1234.56);
    expect(parsePrice('1,234.56')).toBe(1234.56);
    expect(parsePrice('29.90 RON')).toBe(29.9);
    expect(parsePrice(18.5)).toBe(18.5);
  });

  it('rejects values that are not usable prices', () => {
    expect(parsePrice('')).toBeNull();
    expect(parsePrice('-')).toBeNull();
    expect(parsePrice('0')).toBeNull();
    expect(parsePrice(undefined)).toBeNull();
  });

  it('recognises the units the app can cost with', () => {
    expect(parseUnit('KG')).toBe('kg');
    expect(parseUnit('Litru')).toBe('l');
    expect(parseUnit('buc.')).toBe('buc');
    expect(parseUnit('cutie')).toBeNull();
  });
});

describe('spreadsheet reading', () => {
  it('finds the header row even when the file starts with title rows', async () => {
    const buffer = await workbookBuffer([
      ['Metro Cash & Carry'],
      ['Listă de prețuri', '', ''],
      [],
      ['Denumire produs', 'UM', 'Pret unitar'],
      ['Piept de pui refrigerat', 'kg', '28,90'],
      ['Unt 82% grasime', 'kg', '45,50'],
      ['', '', ''],
    ]);

    const rows = await parsePriceList(buffer);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ name: 'Piept de pui refrigerat', price: 28.9, unit: 'kg' });
    expect(rows[1].price).toBe(45.5);
  });

  it('reads a plain CSV without a recognised header', async () => {
    const rows = await parsePriceList('Faina 000;3,40\nZahar tos;4,10\n');
    expect(rows).toHaveLength(2);
    expect(rows[1]).toMatchObject({ name: 'Zahar tos', price: 4.1 });
  });

  it('keeps delimiters and line breaks inside quoted CSV cells', async () => {
    const rows = await parsePriceList('Denumire;UM;Pret unitar;Note\n"Unt; 82%";kg;45,50;"promo\nweekend"\n');
    expect(rows[0]).toMatchObject({ name: 'Unt; 82%', price: 45.5, unit: 'kg', notes: 'promo\nweekend' });
  });
});

describe('matching against the catalog', () => {
  const catalog = [
    entry({ id: 'a', name: 'Piept de pui', purchasePrice: 29 }),
    entry({ id: 'b', name: 'Unt 82%', purchasePrice: 46 }),
    entry({ id: 'c', name: 'Smântână', purchasePrice: 17, priceUnit: 'l' }),
  ];

  it('scores names by how much of the catalog name is covered', () => {
    expect(similarity('Piept de pui', 'Piept de pui refrigerat 1kg')).toBe(1);
    expect(similarity('Piept de pui', 'Pulpe de pui')).toBeLessThan(1);
  });

  it('matches ignoring diacritics and extra words', () => {
    const result = matchPriceList(
      [
        { name: 'Piept de pui refrigerat', price: 31.5, unit: 'kg', notes: null, rowNumber: 2 },
        { name: 'Smantana pentru gatit 32%', price: 18.4, unit: 'l', notes: null, rowNumber: 3 },
      ],
      catalog,
    );

    expect(result.matches).toHaveLength(2);
    expect(result.matches[0].catalog.id).toBe('a');
    expect(result.matches[0].deltaPercent).toBe(8.6);
    expect(result.matches[1].catalog.id).toBe('c');
  });

  it('refuses a price expressed in another unit', () => {
    const result = matchPriceList(
      [{ name: 'Piept de pui', price: 3.2, unit: 'buc', notes: null, rowNumber: 2 }],
      catalog,
    );
    expect(result.matches).toHaveLength(0);
    expect(result.unmatched).toHaveLength(1);
  });

  it('never assigns the same catalog entry twice', () => {
    const result = matchPriceList(
      [
        { name: 'Piept de pui refrigerat', price: 31, unit: null, notes: null, rowNumber: 2 },
        { name: 'Piept de pui congelat', price: 25, unit: null, notes: null, rowNumber: 3 },
      ],
      catalog,
    );
    expect(result.matches).toHaveLength(1);
    expect(result.unmatched).toHaveLength(1);
  });

  it('leaves unknown products alone', () => {
    const result = matchPriceList(
      [{ name: 'Servetele de masa', price: 12, unit: null, notes: null, rowNumber: 2 }],
      catalog,
    );
    expect(result.matches).toHaveLength(0);
    expect(result.unmatched[0].name).toBe('Servetele de masa');
  });
});
