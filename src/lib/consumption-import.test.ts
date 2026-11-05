/**
 * MANAGER 24/7™ by PARADIM — proprietary software.
 * Copyright © 2026 PARADIM Operations SRL. All rights reserved.
 * Concept author and product director: Marius Paul Nemeșu.
 * See LICENSE-PROPRIETARY.md.
 */

import { describe, expect, it } from 'vitest';

import { buildConsumptionImportPreview, normalizeScannedConsumptionRows, parseConsumptionFile } from '@/lib/consumption-import';
import type { CatalogIngredient } from '@/types/recipe';

const catalog: CatalogIngredient[] = [{
  id: 'flour', name: 'Făină albă', purchasePrice: 5, priceUnit: 'kg', packageQuantity: null,
  packagePrice: null, defaultLossPercent: 0, supplier: 'Metro', notes: null, allergens: ['gluten'],
  active: true, updatedAt: '2026-09-16T00:00:00Z',
}];

describe('consumption voucher import', () => {
  it('parses CSV and enriches rows with the catalog price', async () => {
    const rows = await parseConsumptionFile('Ingredient;Cantitate;UM\nFăină albă;2,5;kg\n');
    const preview = buildConsumptionImportPreview(rows, catalog);
    expect(preview.totalRows).toBe(1);
    expect(preview.unresolved).toHaveLength(0);
    expect(preview.lines[0]).toMatchObject({ catalogId: 'flour', quantity: 2.5, cost: 12.5 });
  });

  it('keeps incomplete unmatched rows out of the confirmed lines', async () => {
    const rows = await parseConsumptionFile('Produs;Consum\nProdus necunoscut;3\n');
    const preview = buildConsumptionImportPreview(rows, catalog);
    expect(preview.lines).toHaveLength(0);
    expect(preview.unresolved).toHaveLength(1);
  });

  it('keeps incomplete scanned rows visible for correction', () => {
    const rows = normalizeScannedConsumptionRows({ rows: [
      { name: 'Piept de pui', quantity: '2,5', unit: 'kg', unitPrice: '31,90' },
      { name: 'Fără cantitate' },
      { name: '', quantity: 2, unit: 'kg' },
    ] });
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({
      name: 'Piept de pui', quantity: 2.5, unit: 'kg', unitPrice: 31.9, rowNumber: 1,
    });
    const preview = buildConsumptionImportPreview(rows, []);
    expect(preview.totalRows).toBe(3);
    expect(preview.lines).toHaveLength(1);
    expect(preview.unresolved).toEqual([
      expect.objectContaining({ name: 'Fără cantitate', rowNumber: 2, issues: expect.arrayContaining(['invalid_quantity']) }),
      expect.objectContaining({ name: '', rowNumber: 3, issues: expect.arrayContaining(['missing_name']) }),
    ]);
  });

  it('counts and identifies every nonempty source row in a mixed valid/invalid CSV', async () => {
    const rows = await parseConsumptionFile('Ingredient;Cantitate;UM;Pret\nQA Lapte Bistro;2;kg;9,25\nQA Negative Rice;-1;kg;8\nQA Unknown Ingredient;3;;\n');
    const preview = buildConsumptionImportPreview(rows, []);
    expect(preview.totalRows).toBe(3);
    expect(preview.lines).toEqual([expect.objectContaining({ name: 'QA Lapte Bistro', quantity: 2, cost: 18.5 })]);
    expect(preview.unresolved).toEqual([
      expect.objectContaining({ name: 'QA Negative Rice', quantity: null, rowNumber: 3, raw: expect.objectContaining({ quantity: '-1' }), issues: ['invalid_quantity'] }),
      expect.objectContaining({ name: 'QA Unknown Ingredient', rowNumber: 4, issues: ['missing_unit', 'missing_price'] }),
    ]);
  });

  it.each(['-1', 'bad', '1kg', '1.2.3', '0', 'Infinity', ''])('retains invalid quantity %s without accepting a partial numeric value', async raw => {
    const rows = await parseConsumptionFile(`Ingredient;Cantitate;UM;Pret\nFăină albă;${raw};kg;8`);
    const preview = buildConsumptionImportPreview(rows, catalog);
    expect(preview.lines).toHaveLength(0);
    expect(preview.unresolved).toEqual([expect.objectContaining({ quantity: null, raw: expect.objectContaining({ quantity: raw }), issues: expect.arrayContaining(['invalid_quantity']) })]);
  });

  it.each(['-8', 'bad', '8RON', '1.2.3', 'Infinity'])('does not replace explicitly invalid price %s with the catalog price', async raw => {
    const rows = await parseConsumptionFile(`Ingredient;Cantitate;UM;Pret\nFăină albă;2;kg;${raw}`);
    const preview = buildConsumptionImportPreview(rows, catalog);
    expect(preview.lines).toHaveLength(0);
    expect(preview.unresolved).toEqual([expect.objectContaining({ raw: expect.objectContaining({ unitPrice: raw }), issues: ['invalid_price'] })]);
  });

  it('falls back only for omitted price/unit and preserves an explicitly zero price', async () => {
    const rows = await parseConsumptionFile('Ingredient;Cantitate;UM;Pret\nFăină albă;2;;\nFăină albă;2;kg;0');
    const preview = buildConsumptionImportPreview(rows, catalog);
    expect(preview.unresolved).toHaveLength(0);
    expect(preview.lines).toEqual([
      expect.objectContaining({ quantity: 2, unit: 'kg', purchasePrice: 5, cost: 10 }),
      expect.objectContaining({ quantity: 2, unit: 'kg', purchasePrice: 0, cost: 0 }),
    ]);
  });

  it('rejects an explicit unknown unit instead of taking the catalog unit', async () => {
    const rows = await parseConsumptionFile('Ingredient;Cantitate;UM;Pret\nFăină albă;2;bags;8');
    const preview = buildConsumptionImportPreview(rows, catalog);
    expect(preview.lines).toHaveLength(0);
    expect(preview.unresolved).toEqual([expect.objectContaining({ raw: expect.objectContaining({ unit: 'bags' }), issues: ['invalid_unit'] })]);
  });

  it('rejects incompatible catalog dimensions instead of producing an accepted zero cost line', async () => {
    const rows = await parseConsumptionFile('Ingredient;Cantitate;UM;Pret\nFăină albă;2;l;8');
    const preview = buildConsumptionImportPreview(rows, catalog);
    expect(preview.lines).toHaveLength(0);
    expect(preview.unresolved).toEqual([expect.objectContaining({ issues: ['incompatible_unit'] })]);
  });

  it('keeps source row numbers across blank lines and retains rows missing a name', async () => {
    const rows = await parseConsumptionFile('Ingredient;Cantitate;UM;Pret\n\n;-1;kg;8\nFăină albă;1;kg;8');
    const preview = buildConsumptionImportPreview(rows, catalog);
    expect(preview.totalRows).toBe(2);
    expect(preview.unresolved).toEqual([expect.objectContaining({ rowNumber: 3, issues: ['missing_name', 'invalid_quantity'] })]);
    expect(rows[1].rowNumber).toBe(4);
  });
});
