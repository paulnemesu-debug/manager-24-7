import { gunzipSync, strFromU8 } from 'fflate';

import { createEmptyRecipe } from '@/lib/calculations';
import type { RecipeDraft } from '@/types/recipe';

export const FOODCOM_COUNT = 522517;
export const FOODCOM_VERSION = 2;
export const FOODCOM_SOURCE = 'https://www.kaggle.com/datasets/irkaal/foodcom-recipes-and-reviews';
export const FOODCOM_DOWNLOAD_BASE = 'https://github.com/paulnemesu-debug/manager-24-7/releases/download/catalogue-foodcom-v2';
// Immutable public files; this host explicitly permits cross-origin browser downloads.
export const FOODCOM_WEB_DOWNLOAD_BASE = 'https://raw.githubusercontent.com/paulnemesu-debug/manager-24-7/abe3ab14bad494131fcf2e48b95cfb406e8db597/foodcom-v2';
export type FoodcomLocale = 'ro' | 'en';
export interface FoodcomSummary { id: number; title: string; category: string | null }
export interface FoodcomRecipe extends FoodcomSummary {
  ingredients: string[];
  quantities: (string | null)[];
  servings: number | null;
  yield: string | null;
  instructions: string[];
  /** kcal, fat g, saturates g, cholesterol mg, sodium mg, carbs g, fibre g, sugars g, protein g. */
  nutrition: (number | null)[];
}
export interface FoodcomPage { items: FoodcomSummary[]; nextCursor: string | null }
export interface FoodcomSearch { query: string; cursor?: string | null; limit?: number; signal?: AbortSignal }
export interface FoodcomProgress { phase: 'downloading' | 'installing' | 'verifying'; completed: number; total: number }
export interface FoodcomState { installed: boolean; count: number; completedChunks?: number }
export interface FoodcomReader {
  getState(): Promise<FoodcomState>;
  search(input: FoodcomSearch): Promise<FoodcomPage>;
  getDetail(id: number, signal?: AbortSignal): Promise<FoodcomRecipe | null>;
  install(onProgress: (progress: FoodcomProgress) => void, signal?: AbortSignal): Promise<void>;
  remove(): Promise<void>;
}
export interface FoodcomAsset { file: string; bytes: number; sha256: string; md5: string }
export interface FoodcomManifest {
  schemaVersion: number; datasetVersion: number; count: number;
  database: FoodcomAsset; download: FoodcomAsset;
  webChunks: (FoodcomAsset & { rows: number })[];
}

export function assertFoodcomNotAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw new Error('FOODCOM_CANCELLED');
}

export async function loadFoodcomManifest(signal?: AbortSignal, base = FOODCOM_DOWNLOAD_BASE): Promise<FoodcomManifest> {
  const response = await fetch(`${base}/foodcom-v2-manifest.json`, { signal });
  if (!response.ok) throw new Error('FOODCOM_DOWNLOAD_UNAVAILABLE');
  const value = await response.json() as FoodcomManifest;
  const validAsset = (asset: FoodcomAsset) => asset && /^[a-zA-Z0-9._-]+$/.test(asset.file)
    && Number.isSafeInteger(asset.bytes) && asset.bytes > 0 && /^[a-f0-9]{64}$/.test(asset.sha256)
    && /^[a-f0-9]{32}$/.test(asset.md5);
  if (value.schemaVersion !== 1 || value.datasetVersion !== FOODCOM_VERSION || value.count !== FOODCOM_COUNT
    || !validAsset(value.database) || !validAsset(value.download) || !Array.isArray(value.webChunks)
    || !value.webChunks.length || value.webChunks.some((asset) => !validAsset(asset) || !Number.isSafeInteger(asset.rows) || asset.rows <= 0)
    || value.webChunks.reduce((sum, asset) => sum + asset.rows, 0) !== FOODCOM_COUNT) throw new Error('FOODCOM_INVALID_MANIFEST');
  return value;
}

export function normalizeFoodcomRecipe(value: unknown): FoodcomRecipe {
  if (!value || typeof value !== 'object') throw new Error('FOODCOM_INVALID_RECIPE');
  const row = value as Record<string, unknown>;
  if (!Number.isSafeInteger(row.id) || Number(row.id) <= 0 || typeof row.title !== 'string' || !row.title.trim()) throw new Error('FOODCOM_INVALID_RECIPE');
  const strings = (input: unknown) => Array.isArray(input) ? input.filter((item): item is string => typeof item === 'string' && !!item.trim()) : [];
  const nutrition = Array.isArray(row.nutrition) ? row.nutrition : [];
  return {
    id: Number(row.id), title: row.title.trim(), category: typeof row.category === 'string' ? row.category : null,
    ingredients: strings(row.ingredients),
    quantities: Array.isArray(row.quantities) ? row.quantities.map((item) => typeof item === 'string' ? item : null) : [],
    servings: typeof row.servings === 'number' && Number.isSafeInteger(row.servings) && row.servings > 0 ? row.servings : null,
    yield: typeof row.yield === 'string' ? row.yield : null,
    instructions: strings(row.instructions),
    nutrition: Array.from({ length: 9 }, (_, index) => typeof nutrition[index] === 'number' && Number.isFinite(nutrition[index]) && nutrition[index] >= 0 ? nutrition[index] : null),
  };
}

export function decodeFoodcomPayload(value: Uint8Array): FoodcomRecipe {
  if (value.byteLength > 256000) throw new Error('FOODCOM_INVALID_RECIPE');
  const bytes = gunzipSync(value);
  if (bytes.byteLength > 512000) throw new Error('FOODCOM_INVALID_RECIPE');
  return normalizeFoodcomRecipe(JSON.parse(strFromU8(bytes)));
}

export function foodcomSearchTokens(query: string): string[] {
  return foodcomIndexTerms(query.slice(0, 160));
}

export function foodcomIndexTerms(value: string): string[] {
  return [...new Set(value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [])];
}

export function foodcomQuality(recipe: FoodcomRecipe) {
  return { quantitiesUnmatched: recipe.ingredients.length !== recipe.quantities.length,
    missingServings: recipe.servings === null, missingIngredients: recipe.ingredients.length === 0,
    missingInstructions: recipe.instructions.length === 0 };
}

export function foodcomSourceUrl(recipe: FoodcomSummary) {
  const slug = recipe.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'recipe';
  return `https://www.food.com/recipe/${slug}-${recipe.id}`;
}

export const FOODCOM_NUTRIENT_LABELS = {
  ro: ['Energie', 'Grăsimi', 'Acizi grași saturați', 'Colesterol', 'Sodiu', 'Glucide', 'Fibre', 'Zaharuri', 'Proteine'],
  en: ['Energy', 'Fat', 'Saturates', 'Cholesterol', 'Sodium', 'Carbohydrates', 'Fibre', 'Sugars', 'Protein'],
};
export const FOODCOM_NUTRIENT_UNITS = ['kcal', 'g', 'g', 'mg', 'mg', 'g', 'g', 'g', 'g'];

export function foodcomReferenceNotes(recipe: FoodcomRecipe, locale: FoodcomLocale): string {
  const ro = locale === 'ro';
  const unknown = ro ? 'necunoscut' : 'unknown';
  const quality = foodcomQuality(recipe);
  return [
    `Food.com · Kaggle v2 · #${recipe.id} · ${foodcomSourceUrl(recipe)}`,
    ro ? 'REFERINȚĂ ORIGINALĂ. Valorile de mai jos nu se recalculează când modifici rețeta.' : 'ORIGINAL REFERENCE. The values below do not recalculate when you edit this recipe.',
    ro ? 'Unitățile cantităților și greutatea porției lipsesc din setul de date. Lista ingredientelor poate fi incompletă. Completează cantitățile și prețurile din surse verificate.' : 'Quantity units and serving weight are absent from the dataset. The ingredient list may be incomplete. Enter verified quantities and prices.',
    quality.quantitiesUnmatched ? (ro ? 'Numărul cantităților diferă de numărul ingredientelor; asocierea lor este necunoscută.' : 'Quantity and ingredient counts differ; their pairing is unknown.') : '',
    `${ro ? 'Porții în sursă' : 'Source servings'}: ${recipe.servings ?? unknown}`,
    `${ro ? 'Randament în sursă' : 'Source yield'}: ${recipe.yield ?? unknown}`,
    ro ? 'Nutriție per porție în sursă, neverificată; nu per 100 g:' : 'Nutrition per source serving, unverified; not per 100 g:',
    ...recipe.nutrition.map((value, index) => `${FOODCOM_NUTRIENT_LABELS[locale][index]}: ${value === null ? unknown : `${value} ${FOODCOM_NUTRIENT_UNITS[index]}`}`),
    ro ? 'Ingrediente în sursă (listă separată):' : 'Source ingredients (separate list):',
    recipe.ingredients.join(' | ') || unknown,
    ro ? 'Cantități în sursă (listă separată, fără unități; nu sunt atribuite ingredientelor):' : 'Source quantities (separate list, no units; not assigned to ingredients):',
    recipe.quantities.map((quantity) => quantity ?? unknown).join(' | ') || unknown,
    ro ? 'Instrucțiuni originale:' : 'Original instructions:',
    ...recipe.instructions.map((step, index) => `${index + 1}. ${step}`),
  ].filter(Boolean).join('\n');
}

export function draftFromFoodcom(recipe: FoodcomRecipe, defaultVatPercent: number, locale: FoodcomLocale): RecipeDraft {
  const draft = createEmptyRecipe(defaultVatPercent);
  return { ...draft, title: recipe.title, category: null, servings: recipe.servings ?? 1,
    ingredients: recipe.ingredients.map((name, index) => ({ id: `foodcom-${recipe.id}-${index}`, kind: 'product', catalogId: null, subRecipeId: null,
      name, quantity: 0, unit: 'g', purchasePrice: 0, priceUnit: 'kg', lossPercent: 0, allergens: [], allergensConfirmed: false, additives: [],
      nutrition: { basis: '100g', values: { energyKj: null, energyKcal: null, fat: null, saturates: null, carbohydrates: null, sugars: null, fibre: null, protein: null, salt: null },
        source: 'unknown', sourceReference: null, confirmed: false, automaticDisabled: true } })),
    compliance: { finalWeightGrams: null, finalWeightMeasured: false, isDefrosted: false, sourceReviewRequired: true,
      templateId: `foodcom-${recipe.id}`, sourceReference: `${FOODCOM_SOURCE} · v2 · ${foodcomSourceUrl(recipe)}`,
      nutritionNotes: foodcomReferenceNotes(recipe, locale) },
  };
}
