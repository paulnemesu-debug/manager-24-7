/**
 * MANAGER 24/7™ by PARADIM — proprietary software.
 * Copyright © 2026 PARADIM Operations SRL. All rights reserved.
 * Concept author and product director: Marius Paul Nemeșu.
 * See LICENSE-PROPRIETARY.md.
 */

import { describe, expect, it, vi } from 'vitest';

import { findNutritionReferences, mapOpenFoodFactsProduct, openFoodFactsTextSearchUrl } from '@/lib/nutrition-reference';

const product = {
  code: '5941234567890',
  product_name_ro: 'Iaurt natural',
  brands: 'Exemplu',
  quantity: '400 g',
  nutriments: {
    'energy-kj_100g': 260,
    'energy-kcal_100g': 62,
    fat_100g: 3.5,
    'saturated-fat_100g': 2.2,
    carbohydrates_100g: 4.1,
    sugars_100g: 4.1,
    proteins_100g: 3.6,
    salt_100g: 0.12,
  },
};

describe('nutrition reference lookup', () => {
  it('maps values per 100 g without turning missing fibre into zero', () => {
    const mapped = mapOpenFoodFactsProduct(product);
    expect(mapped?.name).toBe('Iaurt natural');
    expect(mapped?.nutrition.values.energyKcal).toBe(62);
    expect(mapped?.nutrition.values.fibre).toBeNull();
    expect(mapped?.nutrition.confirmed).toBe(false);
    expect(mapped?.nutrition.sourceReference).toContain('5941234567890');
    expect(mapped?.completedRequiredFields).toBe(8);
  });

  it('uses the exact-product endpoint for a barcode', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ product }),
    } as Response);

    const results = await findNutritionReferences('5941234567890');
    expect(results).toHaveLength(1);
    expect(fetchMock.mock.calls[0]?.[0]).toContain('/api/v3/product/5941234567890.json');
    fetchMock.mockRestore();
  });

  it('uses Search-a-licious for text and returns nutrition results', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ products: [product] }),
    } as Response);

    const results = await findNutritionReferences('piept pui');
    expect(results[0]?.name).toBe('Iaurt natural');
    expect(fetchMock.mock.calls[0]?.[0]).toBe(openFoodFactsTextSearchUrl('piept pui'));
    expect(fetchMock.mock.calls[0]?.[0]).toContain('search.openfoodfacts.org/search?');
    fetchMock.mockRestore();
  });

  it('rejects products with no usable nutrition values', () => {
    expect(mapOpenFoodFactsProduct({ code: '1', product_name: 'Gol', nutriments: {} })).toBeNull();
  });

  it('does not infer the nutrition basis from bottle volume', () => {
    expect(mapOpenFoodFactsProduct({ ...product, quantity: '1 L', product_quantity_unit: 'l' })?.nutrition.basis)
      .toBe('100g');
  });

  it('preserves an explicitly declared 100 ml basis', () => {
    expect(mapOpenFoodFactsProduct({ ...product, nutrition_data_per: '100ml' })?.nutrition.basis)
      .toBe('100ml');
  });

  it('does not interpret serving values as values per 100 g', () => {
    expect(mapOpenFoodFactsProduct({ ...product, nutriments: { fat: 40, 'energy-kcal': 550 } })).toBeNull();
  });

  it('never bypasses a search rate limit using another endpoint', async () => {
    const mock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: false, status: 429 } as Response);
    await expect(findNutritionReferences('rate-limit-product-test')).rejects.toThrow('nutrition-rate-limited');
    expect(mock).toHaveBeenCalledTimes(1);
    mock.mockRestore();
  });

  it('deduplicates repeated product reads and returns independent editable copies', async () => {
    const mock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, status: 200, json: async () => ({ product }) } as Response);
    const [first, second] = await Promise.all([findNutritionReferences('5949876543210'), findNutritionReferences('5949876543210')]);
    expect(mock).toHaveBeenCalledTimes(1);
    first[0].nutrition.values.fat = 999;
    expect(second[0].nutrition.values.fat).toBe(3.5);
    expect((await findNutritionReferences('5949876543210'))[0].nutrition.values.fat).toBe(3.5);
    expect(mock).toHaveBeenCalledTimes(1);
    mock.mockRestore();
  });
});
