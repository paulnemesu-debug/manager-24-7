/**
 * MANAGER 24/7™ by PARADIM — proprietary software.
 * Copyright © 2026 PARADIM Operations SRL. All rights reserved.
 * Concept author and product director: Marius Paul Nemeșu.
 * See LICENSE-PROPRIETARY.md.
 */

import { describe, expect, it } from 'vitest';

import { buildRestockSuggestions, groupRestockBySupplier, nextInventoryDueDate, wasteValue } from '@/lib/operations-control';
import type { CatalogIngredient } from '@/types/recipe';

const ingredient = (id: string, name: string, supplier: string | null, price = 5): CatalogIngredient => ({
  id, name, supplier, purchasePrice: price, priceUnit: 'kg', packageQuantity: null, packagePrice: null,
  defaultLossPercent: 0, notes: null, allergens: [], active: true, updatedAt: '', offers: [],
});

describe('operations control', () => {
  it('orders only ingredients at or below the minimum stock', () => {
    const result = buildRestockSuggestions(
      [ingredient('a', 'Cartofi', 'Furnizor A'), ingredient('b', 'Ceapă', 'Furnizor A')],
      [
        { id: 'pa', catalogId: 'a', locationId: null, minimumQuantity: 5, targetQuantity: 12, storageZone: 'Depozit', updatedAt: '', syncState: 'local' },
        { id: 'pb', catalogId: 'b', locationId: null, minimumQuantity: 2, targetQuantity: 6, storageZone: 'Depozit', updatedAt: '', syncState: 'local' },
      ],
      [{ catalogId: 'a', onHand: 4 }, { catalogId: 'b', onHand: 3 }],
      null,
    );
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ catalogId: 'a', orderQuantity: 8, estimatedCost: 40 });
  });

  it('groups supplier orders and totals their estimated cost', () => {
    const suggestions = buildRestockSuggestions(
      [ingredient('a', 'A', 'F1', 2), ingredient('b', 'B', 'F1', 3)],
      [
        { id: 'pa', catalogId: 'a', locationId: null, minimumQuantity: 1, targetQuantity: 4, storageZone: '', updatedAt: '', syncState: 'local' },
        { id: 'pb', catalogId: 'b', locationId: null, minimumQuantity: 1, targetQuantity: 3, storageZone: '', updatedAt: '', syncState: 'local' },
      ],
      [],
      null,
    );
    expect(groupRestockBySupplier(suggestions)[0].totalEstimated).toBe(17);
  });

  it('calculates waste value and the next scheduled count', () => {
    expect(wasteValue(2.5, 4)).toBe(10);
    expect(nextInventoryDueDate({ from: '2026-09-19', frequency: 'weekly', weekday: 1, monthDay: null })).toBe('2026-09-21');
    expect(nextInventoryDueDate({ from: '2026-09-19', frequency: 'monthly', weekday: null, monthDay: 7 })).toBe('2026-10-07');
  });
});
