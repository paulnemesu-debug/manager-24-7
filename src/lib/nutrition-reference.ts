/**
 * MANAGER 24/7™ by PARADIM — proprietary software.
 * Copyright © 2026 PARADIM Operations SRL. All rights reserved.
 * Concept author and product director: Marius Paul Nemeșu.
 * See LICENSE-PROPRIETARY.md.
 */

import type { IngredientNutrition, NutritionValues } from '@/types/recipe';

const SEARCH_LIMIT = 6;
const REQUEST_TIMEOUT_MS = 12_000;
const APP_USER_AGENT = 'Manager247/1.5.4 (contact@paradim.ro)';

type UnknownRecord = Record<string, unknown>;

export type NutritionReferenceProduct = {
  barcode: string;
  name: string;
  brand: string | null;
  quantityLabel: string | null;
  sourceName: 'Open Food Facts';
  sourceUrl: string;
  nutrition: IngredientNutrition;
  completedRequiredFields: number;
};

function record(value: unknown): UnknownRecord {
  return value && typeof value === 'object' ? value as UnknownRecord : {};
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function nutrient(source: UnknownRecord, ...keys: string[]): number | null {
  for (const key of keys) {
    const raw = source[key];
    if (raw === null || raw === undefined || raw === '') continue;
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed >= 0) return parsed;
  }
  return null;
}

function nutritionBasis(product: UnknownRecord): '100g' | '100ml' {
  // Bottle volume does not establish the nutrition basis (e.g. oil sold in litres).
  return product.nutrition_data_per === '100ml' ? '100ml' : '100g';
}

/** Transformă răspunsul extern într-un model strict; lipsa rămâne `null`, niciodată zero. */
export function mapOpenFoodFactsProduct(value: unknown): NutritionReferenceProduct | null {
  const product = record(value);
  const nutriments = record(product.nutriments);
  const barcode = text(product.code) ?? text(product._id) ?? '';
  const name = text(product.product_name_ro)
    ?? text(product.product_name)
    ?? text(product.generic_name_ro)
    ?? text(product.generic_name);
  if (!name || !barcode) return null;

  const values: NutritionValues = {
    energyKj: nutrient(nutriments, 'energy-kj_100g'),
    energyKcal: nutrient(nutriments, 'energy-kcal_100g'),
    fat: nutrient(nutriments, 'fat_100g'),
    saturates: nutrient(nutriments, 'saturated-fat_100g'),
    carbohydrates: nutrient(nutriments, 'carbohydrates_100g'),
    sugars: nutrient(nutriments, 'sugars_100g'),
    fibre: nutrient(nutriments, 'fiber_100g', 'fibre_100g'),
    protein: nutrient(nutriments, 'proteins_100g'),
    salt: nutrient(nutriments, 'salt_100g'),
  };
  const required = [
    values.energyKj,
    values.energyKcal,
    values.fat,
    values.saturates,
    values.carbohydrates,
    values.sugars,
    values.protein,
    values.salt,
  ];
  if (!required.some((entry) => entry !== null)) return null;

  const sourceUrl = `https://world.openfoodfacts.org/product/${encodeURIComponent(barcode)}`;
  return {
    barcode,
    name,
    brand: text(product.brands),
    quantityLabel: text(product.quantity),
    sourceName: 'Open Food Facts',
    sourceUrl,
    nutrition: {
      basis: nutritionBasis(product),
      values,
      source: 'accepted_database',
      sourceReference: `Open Food Facts · ${barcode} · ${sourceUrl}`,
      // Open Food Facts precizează că datele comunitare trebuie verificate.
      confirmed: false,
    },
    completedRequiredFields: required.filter((entry) => entry !== null).length,
  };
}

function isBarcode(value: string) {
  return /^\d{8,14}$/.test(value.replace(/[\s-]/g, ''));
}

async function requestJson(url: string): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'Accept-Language': 'ro-RO,ro;q=0.9,en;q=0.6',
        'User-Agent': APP_USER_AGENT,
        'X-User-Agent': APP_USER_AGENT,
      },
      signal: controller.signal,
    });
    if (response.status === 429) throw new Error('nutrition-rate-limited');
    if (!response.ok) throw new Error('nutrition-service-unavailable');
    return await response.json();
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('nutrition-timeout');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function productsFromPayload(value: unknown) {
  const payload = record(value);
  const candidates = Array.isArray(payload.products)
    ? payload.products
    : Array.isArray(payload.hits)
      ? payload.hits
      : Array.isArray(payload.results)
        ? payload.results
        : Array.isArray(payload.items)
          ? payload.items
          : [];
  return candidates.map((candidate) => {
    const item = record(candidate);
    return item._source ?? item.product ?? item;
  });
}

export function openFoodFactsTextSearchUrl(query: string) {
  const params = new URLSearchParams({
    q: query.trim(),
    page_size: String(SEARCH_LIMIT),
    fields: 'code,product_name,product_name_ro,generic_name,generic_name_ro,brands,quantity,product_quantity_unit,nutrition_data_per,nutriments',
  });
  return `https://search.openfoodfacts.org/search?${params}`;
}

async function fetchNutritionReferences(query: string): Promise<NutritionReferenceProduct[]> {
  const cleaned = query.trim();
  if (cleaned.length < 2) return [];

  if (isBarcode(cleaned)) {
    const barcode = cleaned.replace(/[\s-]/g, '');
    const fields = 'code,product_name,product_name_ro,generic_name,generic_name_ro,brands,quantity,product_quantity_unit,nutrition_data_per,nutriments';
    const payload = record(await requestJson(
      `https://world.openfoodfacts.org/api/v3/product/${barcode}.json?fields=${fields}`,
    ));
    const mapped = mapOpenFoodFactsProduct(payload.product ?? payload);
    return mapped ? [mapped] : [];
  }

  // Endpointul CGI folosit anterior răspunde frecvent cu 503. Pentru text
  // folosim motorul oficial Search-a-licious și păstrăm CGI doar ca rezervă.
  let payload: unknown;
  try {
    payload = await requestJson(openFoodFactsTextSearchUrl(cleaned));
  } catch (primaryError) {
    if (primaryError instanceof Error && primaryError.message === 'nutrition-rate-limited') throw primaryError;
    const fallback = new URLSearchParams({
      search_terms: cleaned,
      search_simple: '1',
      action: 'process',
      json: '1',
      page_size: String(SEARCH_LIMIT),
      fields: 'code,product_name,product_name_ro,generic_name,generic_name_ro,brands,quantity,product_quantity_unit,nutrition_data_per,nutriments',
    });
    try {
      payload = await requestJson(`https://world.openfoodfacts.org/cgi/search.pl?${fallback}`);
    } catch {
      throw primaryError;
    }
  }
  const products = productsFromPayload(payload);
  return products
    .map(mapOpenFoodFactsProduct)
    .filter((item): item is NutritionReferenceProduct => item !== null)
    .slice(0, SEARCH_LIMIT);
}

const cache = new Map<string, { expires: number; products: NutritionReferenceProduct[] }>();
const pending = new Map<string, Promise<NutritionReferenceProduct[]>>();
const copy = (products: NutritionReferenceProduct[]) => products.map((product) => ({
  ...product, nutrition: { ...product.nutrition, values: { ...product.nutrition.values } },
}));

/** Avoid duplicate reads. Selected product data are stored once in the user's ingredient. */
export async function findNutritionReferences(query: string): Promise<NutritionReferenceProduct[]> {
  const key = query.trim().toLowerCase();
  if (key.length < 2) return [];
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return copy(hit.products);
  let request = pending.get(key);
  if (!request) {
    request = fetchNutritionReferences(query).then((products) => {
      if (cache.size >= 40) cache.delete(cache.keys().next().value!);
      cache.set(key, { expires: Date.now() + 600_000, products });
      return products;
    }).finally(() => { pending.delete(key); });
    pending.set(key, request);
  }
  return copy(await request);
}
