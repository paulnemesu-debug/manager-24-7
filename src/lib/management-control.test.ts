/**
 * MANAGER 24/7™ by PARADIM — proprietary software.
 * Copyright © 2026 PARADIM Operations SRL. All rights reserved.
 * Concept author and product director: Marius Paul Nemeșu.
 * See LICENSE-PROPRIETARY.md.
 */

import { describe, expect, it } from 'vitest';

import {
  calculateIngredientVariances,
  calculateCostVariance,
  inventoryConsumption,
  inventoryValue,
  laborCost,
  parseSalesCsv,
  mapSalesRows,
  primeCost,
} from '@/lib/management-control';

describe('management control', () => {
  const inventory = [{ catalogId: null, name: 'Cartofi', openingQuantity: 10, purchasesQuantity: 5, closingQuantity: 4, unitCost: 3 }];

  it('calculates actual inventory consumption and value', () => {
    expect(inventoryConsumption(inventory[0])).toBe(11);
    expect(inventoryValue(inventory)).toBe(12);
  });

  it('shows theoretical versus real consumption for each ingredient', () => {
    const result = calculateIngredientVariances(
      [{ recipeId: 'recipe', name: 'Supă', quantity: 10, revenue: 200, theoreticalUnitCost: 2 }],
      [{ catalogId: 'carrot', name: 'Morcov', openingQuantity: 5, purchasesQuantity: 0, closingQuantity: 3.5, unitCost: 4 }],
      [{
        id: 'recipe', servings: 10, yieldQuantity: 1, yieldUnit: 'kg', totals: { effectiveServings: 10 },
        ingredients: [{ kind: 'product', catalogId: 'carrot', quantity: 1, unit: 'kg', priceUnit: 'kg' }],
      }],
    );
    expect(result[0]).toMatchObject({ theoreticalQuantity: 1, actualQuantity: 1.5, varianceQuantity: 0.5, varianceValue: 2, variancePercent: 50 });
  });

  it('compares theoretical and actual cost', () => {
    const result = calculateCostVariance([{ recipeId: null, name: 'Porție', quantity: 10, revenue: 300, theoreticalUnitCost: 3 }], inventory);
    expect(result.theoreticalCost).toBe(30);
    expect(result.actualCost).toBe(33);
    expect(result.variancePercent).toBe(10);
  });

  it('calculates labor and prime cost', () => {
    expect(laborCost(8, 35)).toBe(280);
    expect(primeCost(1000, 300, 280)).toEqual({ total: 580, percent: 58 });
  });

  it('parses common POS csv separators', () => {
    expect(parseSalesCsv('Produs;Cantitate;Valoare\nBurger;2;80')).toEqual([
      { produs: 'Burger', cantitate: '2', valoare: '80' },
    ]);
  });

  it('maps POS rows to recipes', () => {
    expect(mapSalesRows([{ produs: 'Burger', cantitate: '2', valoare: '80' }], [{ id: 'r1', title: 'Burger', portionCost: 12 }])[0]).toEqual({
      recipeId: 'r1', name: 'Burger', quantity: 2, revenue: 80, theoreticalUnitCost: 12,
    });
  });
});
