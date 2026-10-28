import data from '@/constants/nutrition-ciqual.json';
import { NUTRITION_ALIASES, NUTRITION_SEARCH_TERMS, NUTRITION_ESTIMATED_ALIASES } from '@/constants/nutrition-aliases';
import type { IngredientNutrition, NutritionValues } from '@/types/recipe';

const KEYS = data.nutrientOrder as (keyof NutritionValues)[];
type Food = (typeof data.foods)[number];
export const CIQUAL_SOURCE = `${data.source} · ${data.releaseDate} · ${data.sourceUrl}`;
export const CIQUAL_FOOD_COUNT = data.foods.length;

export function normalizeNutritionName(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9%]+/g, ' ').trim().replace(/\s+/g, ' ');
}

/** Explicit calculation policy: upper limits remain conservative, traces approximate zero. */
export function parseCiqualValue(raw: string): { value: number | null; qualifier?: string } {
  const cleaned = raw.trim().replace(/\s+/g, ' ').replace(',', '.');
  if (cleaned === 'traces') return { value: 0, qualifier: 'traces' };
  const bound = cleaned.match(/^<\s*(\d+(?:\.\d+)?)$/);
  if (bound) return { value: Number(bound[1]), qualifier: raw };
  if (!/^\d+(?:\.\d+)?$/.test(cleaned)) return { value: null };
  const value = Number(cleaned);
  return { value: Number.isFinite(value) ? value : null };
}

let index: Map<string, Food> | undefined;
function foodIndex() {
  if (index) return index;
  index = new Map();
  for (const food of data.foods) {
    for (const name of [food.name, ...(NUTRITION_ALIASES[food.code] ?? []), ...(NUTRITION_ESTIMATED_ALIASES[food.code]?.names ?? [])]) {
      const key = normalizeNutritionName(name);
      const previous = index.get(key);
      if (previous && previous.code !== food.code) throw new Error(`Ambiguous nutrition alias: ${name}`);
      index.set(key, food);
    }
  }
  return index;
}

export function nutritionFromCiqual(food: Food): IngredientNutrition {
  const parsed = food.nutrients.map(parseCiqualValue);
  const qualifiers = Object.fromEntries(parsed.flatMap((item, i) => item.qualifier ? [[KEYS[i], item.qualifier]] : []));
  return {
    basis: '100g',
    values: Object.fromEntries(KEYS.map((key, i) => [key, parsed[i].value])) as unknown as NutritionValues,
    source: 'accepted_database',
    sourceReference: `${CIQUAL_SOURCE} · ${food.code} · ${food.name}`,
    confirmed: false,
    ...(Object.keys(qualifiers).length ? { qualifiers } : {}),
  };
}

export function findAutomaticNutrition(name: string): IngredientNutrition | null {
  const key = normalizeNutritionName(name);
  const food = foodIndex().get(key);
  if (!food) return null;
  const nutrition = nutritionFromCiqual(food);
  const generic = NUTRITION_ESTIMATED_ALIASES[food.code];
  const estimated = generic?.names.some((alias) => normalizeNutritionName(alias) === key);
  return {
    ...nutrition,
    ...(estimated ? {
      source: 'estimated' as const,
      sourceReference: `${nutrition.sourceReference} · ESTIMARE: ${generic.assumption}`,
      qualifiers: { ...Object.fromEntries(KEYS.map((nutrient) => [nutrient, 'generic_assumption'])), ...nutrition.qualifiers },
    } : {}),
    automaticMatch: { foodCode: food.code, matchedName: key },
  };
}

/** Labels and manual data take precedence. Historical energy-only library rows may be replaced. */
export function resolveAutomaticNutrition(name: string, nutrition: IngredientNutrition): IngredientNutrition {
  if (nutrition.automaticDisabled) return nutrition;
  const key = normalizeNutritionName(name);
  if (nutrition.automaticMatch?.matchedName === key) return nutrition;
  const renamedAutomatic = Boolean(nutrition.automaticMatch);
  const hasValues = KEYS.some((nutrient) => nutrition.values[nutrient] !== null);
  const legacyEnergyOnly = nutrition.source === 'imported_workbook' && !nutrition.confirmed
    && KEYS.filter((nutrient) => !nutrient.startsWith('energy')).every((nutrient) => nutrition.values[nutrient] === null);
  if (!renamedAutomatic && (nutrition.confirmed || (hasValues && !legacyEnergyOnly))) return nutrition;
  const found = findAutomaticNutrition(name);
  if (found) {
    const sameFood = !renamedAutomatic || found.automaticMatch?.foodCode === nutrition.automaticMatch?.foodCode;
    return { ...found, gramsPerMl: sameFood ? nutrition.gramsPerMl : null, gramsPerUnit: sameFood ? nutrition.gramsPerUnit : null };
  }
  if (renamedAutomatic) return {
    basis: nutrition.basis, values: Object.fromEntries(KEYS.map((nutrient) => [nutrient, null])) as unknown as NutritionValues,
    source: 'unknown', sourceReference: null, confirmed: false,
    gramsPerMl: null, gramsPerUnit: null,
  };
  return nutrition;
}

export function searchLocalNutrition(query: string, limit = 6) {
  const needle = normalizeNutritionName(query);
  if (needle.length < 2) return [];
  const exact = foodIndex().get(needle);
  const matches = data.foods.filter((food) => food !== exact
    && [food.name, ...(NUTRITION_ALIASES[food.code] ?? []), ...(NUTRITION_SEARCH_TERMS[food.code] ?? [])]
      .some((name) => normalizeNutritionName(name).includes(needle)));
  return [...(exact ? [exact] : []), ...matches].slice(0, limit).map((food) => ({
    code: food.code, name: NUTRITION_ALIASES[food.code]?.[0] ?? food.name, originalName: food.name,
    nutrition: { ...nutritionFromCiqual(food), automaticDisabled: true },
  }));
}
