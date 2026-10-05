/**
 * MANAGER 24/7™ by PARADIM — proprietary software.
 * Copyright © 2026 PARADIM Operations SRL. All rights reserved.
 * Concept author and product director: Marius Paul Nemeșu.
 * See LICENSE-PROPRIETARY.md.
 */

import type { TranslationKey } from '@/i18n/translations';

export const RECIPE_CATEGORIES = [
  'soup',
  'starter',
  'main',
  'dessert',
  'salad',
  'side',
] as const;

export type RecipeCategory = (typeof RECIPE_CATEGORIES)[number];

export const CATEGORY_LABEL_KEY: Record<RecipeCategory, TranslationKey> = {
  soup: 'category.soup',
  starter: 'category.starter',
  main: 'category.main',
  dessert: 'category.dessert',
  salad: 'category.salad',
  side: 'category.side',
};

/** Cuvinte folosite în rețetele salvate înainte de standardizarea categoriilor. */
const LEGACY_ALIASES: Record<RecipeCategory, readonly string[]> = {
  soup: ['ciorba', 'ciorbe', 'supa', 'supe', 'soup', 'soups', 'bors', 'borș'],
  starter: ['aperitiv', 'aperitive', 'starter', 'starters', 'gustare', 'gustari', 'antreu'],
  main: ['fel principal', 'principal', 'main', 'main course', 'mains', 'preparat de baza'],
  dessert: ['desert', 'deserturi', 'dessert', 'desserts', 'dulce'],
  salad: ['salata', 'salate', 'salad', 'salads'],
  side: ['garnitura', 'garnituri', 'side', 'sides', 'side dish'],
};

export function isRecipeCategory(value: unknown): value is RecipeCategory {
  return typeof value === 'string' && (RECIPE_CATEGORIES as readonly string[]).includes(value);
}

/**
 * Acceptă atât valorile standard, cât și textul liber salvat în versiunile anterioare,
 * ca rețetele vechi să nu rămână fără categorie după actualizare.
 */
export function normalizeCategory(value: unknown): RecipeCategory | null {
  if (isRecipeCategory(value)) return value;
  if (typeof value !== 'string') return null;

  const needle = value
    .trim()
    .toLocaleLowerCase('ro-RO')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  if (!needle) return null;

  for (const category of RECIPE_CATEGORIES) {
    const matched = LEGACY_ALIASES[category].some((alias) => {
      const normalizedAlias = alias.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      return needle === normalizedAlias || needle.includes(normalizedAlias);
    });
    if (matched) return category;
  }
  return null;
}
