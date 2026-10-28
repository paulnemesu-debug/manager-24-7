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

  it('normalizes scanned rows and rejects incomplete AI output', () => {
    const rows = normalizeScannedConsumptionRows({ rows: [
      { name: 'Piept de pui', quantity: '2,5', unit: 'kg', unitPrice: '31,90' },
      { name: 'Fără cantitate' },
      { name: '', quantity: 2, unit: 'kg' },
    ] });
    expect(rows).toEqual([{
      name: 'Piept de pui', quantity: 2.5, unit: 'kg', unitPrice: 31.9, rowNumber: 1,
    }]);
  });
});
