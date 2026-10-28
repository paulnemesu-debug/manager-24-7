/**
 * MANAGER 24/7™ by PARADIM — proprietary software.
 * Copyright © 2026 PARADIM Operations SRL. All rights reserved.
 * Concept author and product director: Marius Paul Nemeșu.
 * See LICENSE-PROPRIETARY.md.
 */

/**
 * Cei 14 alergeni cu declarare obligatorie în UE (Reg. 1169/2011, Anexa II).
 * Etichetele sunt ținute aici, nu în dicționarul general, ca lista să rămână
 * într-un singur loc atât pentru interfață, cât și pentru fișa exportată.
 */
export const ALLERGENS = [
  'gluten',
  'crustacea',
  'eggs',
  'fish',
  'peanuts',
  'soy',
  'milk',
  'nuts',
  'celery',
  'mustard',
  'sesame',
  'sulphites',
  'lupin',
  'molluscs',
] as const;

export type Allergen = (typeof ALLERGENS)[number];

export const ALLERGEN_LABELS: Record<'ro' | 'en', Record<Allergen, string>> = {
  ro: {
    gluten: 'Cereale cu gluten',
    crustacea: 'Crustacee',
    eggs: 'Ouă',
    fish: 'Pește',
    peanuts: 'Arahide',
    soy: 'Soia',
    milk: 'Lapte',
    nuts: 'Fructe cu coajă',
    celery: 'Țelină',
    mustard: 'Muștar',
    sesame: 'Susan',
    sulphites: 'Dioxid de sulf și sulfiți',
    lupin: 'Lupin',
    molluscs: 'Moluște',
  },
  en: {
    gluten: 'Cereals containing gluten',
    crustacea: 'Crustaceans',
    eggs: 'Eggs',
    fish: 'Fish',
    peanuts: 'Peanuts',
    soy: 'Soybeans',
    milk: 'Milk',
    nuts: 'Tree nuts',
    celery: 'Celery',
    mustard: 'Mustard',
    sesame: 'Sesame seeds',
    sulphites: 'Sulphur dioxide and sulphites',
    lupin: 'Lupin',
    molluscs: 'Molluscs',
  },
};

export function isAllergen(value: unknown): value is Allergen {
  return typeof value === 'string' && (ALLERGENS as readonly string[]).includes(value);
}

export function parseAllergens(value: unknown): Allergen[] {
  if (!Array.isArray(value)) return [];
  return ALLERGENS.filter((allergen) => value.includes(allergen));
}

/** Reunește listele de alergeni păstrând ordinea oficială și eliminând duplicatele. */
export function mergeAllergens(...lists: (readonly Allergen[] | undefined | null)[]): Allergen[] {
  const found = new Set<Allergen>();
  for (const list of lists) {
    for (const allergen of list ?? []) found.add(allergen);
  }
  return ALLERGENS.filter((allergen) => found.has(allergen));
}
