/**
 * MANAGER 24/7™ by PARADIM — proprietary software.
 * Copyright © 2026 PARADIM Operations SRL. All rights reserved.
 * Concept author and product director: Marius Paul Nemeșu.
 * See LICENSE-PROPRIETARY.md.
 */

import type { Allergen } from '@/constants/allergens';

/**
 * Alergenii propuși automat după denumirea ingredientului, ca bucătarul să nu
 * bifeze aceleași căsuțe la fiecare produs. Este o sugestie, nu o decizie:
 * lista rămâne editabilă, iar rețeta fără sare de bucătărie nu devine
 * niciodată o declarație pe care nu a confirmat-o cineva.
 *
 * Cuvintele sunt scrise fără diacritice, pentru că denumirea introdusă este
 * normalizată înainte de comparație.
 */
type Preset = { keywords: readonly string[]; allergens: readonly Allergen[] };

const PRESETS: readonly Preset[] = [
  // Lapte și derivate
  { keywords: ['lapte', 'smantana', 'frisca', 'iaurt', 'unt', 'branza', 'cascaval', 'telemea', 'mozzarella', 'parmezan', 'cheddar', 'gorgonzola', 'ricotta', 'mascarpone', 'urda', 'sana', 'kefir', 'ghee', 'cream', 'milk', 'butter', 'cheese', 'yogurt'], allergens: ['milk'] },

  // Cereale cu gluten
  { keywords: ['faina', 'gris', 'paste', 'spaghete', 'penne', 'tagliatele', 'lasagna', 'cuscus', 'bulgur', 'orz', 'secara', 'grau', 'malai de grau', 'paine', 'chifla', 'bagheta', 'blat', 'aluat', 'foietaj', 'pesmet', 'crutoane', 'biscuiti', 'tortilla', 'lipie', 'covrigi', 'flour', 'bread', 'pasta', 'noodles'], allergens: ['gluten'] },

  // Ouă
  { keywords: ['ou', 'oua', 'galbenus', 'albus', 'maioneza', 'egg'], allergens: ['eggs'] },

  // Pește
  { keywords: ['peste', 'somon', 'ton', 'cod', 'macrou', 'hering', 'sardine', 'pastrav', 'crap', 'salau', 'dorada', 'biban', 'hamsii', 'icre', 'sos de peste', 'fish', 'salmon', 'tuna', 'anchovy', 'ansoa'], allergens: ['fish'] },

  // Crustacee
  { keywords: ['crevete', 'creveti', 'rac', 'raci', 'homar', 'langustina', 'crab', 'shrimp', 'prawn', 'lobster'], allergens: ['crustacea'] },

  // Moluște
  { keywords: ['midii', 'scoici', 'calamar', 'caracatita', 'sepie', 'melci', 'stridii', 'mussel', 'squid', 'octopus', 'clam', 'oyster'], allergens: ['molluscs'] },

  // Arahide
  { keywords: ['arahide', 'alune de pamant', 'unt de arahide', 'peanut'], allergens: ['peanuts'] },

  // Fructe cu coajă
  { keywords: ['nuca', 'nuci', 'migdale', 'alune', 'fistic', 'caju', 'pecan', 'macadamia', 'nucă braziliana', 'praline', 'marzipan', 'martipan', 'almond', 'walnut', 'hazelnut', 'cashew', 'pistachio'], allergens: ['nuts'] },

  // Soia
  { keywords: ['soia', 'tofu', 'sos de soia', 'edamame', 'miso', 'tempeh', 'lecitina', 'soy'], allergens: ['soy'] },

  // Țelină
  { keywords: ['telina', 'apio', 'celery'], allergens: ['celery'] },

  // Muștar
  { keywords: ['mustar', 'dijon', 'mustard'], allergens: ['mustard'] },

  // Susan
  { keywords: ['susan', 'tahini', 'humus', 'hummus', 'sesame'], allergens: ['sesame'] },

  // Sulfiți
  { keywords: ['vin', 'otet balsamic', 'fructe uscate', 'stafide', 'caise uscate', 'sulfiti', 'must', 'sulphite', 'sulfite'], allergens: ['sulphites'] },

  // Lupin
  { keywords: ['lupin'], allergens: ['lupin'] },

  // Combinații frecvente
  { keywords: ['maioneza'], allergens: ['eggs', 'mustard'] },
  { keywords: ['pesto'], allergens: ['milk', 'nuts'] },
  { keywords: ['sos caesar', 'dressing caesar'], allergens: ['eggs', 'fish', 'milk', 'mustard'] },
  { keywords: ['sos worcester', 'worcestershire'], allergens: ['fish'] },
  { keywords: ['bechamel', 'besamel'], allergens: ['milk', 'gluten'] },
  { keywords: ['ciocolata', 'chocolate'], allergens: ['milk', 'soy'] },
  { keywords: ['inghetata', 'ice cream'], allergens: ['milk', 'eggs'] },
  { keywords: ['halva'], allergens: ['sesame'] },
  { keywords: ['bere', 'beer'], allergens: ['gluten'] },
];

export function normalizeIngredientName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Alergenii sugerați pentru o denumire. Potrivirea se face pe cuvinte întregi,
 * ca „nuca de cocos" să nu fie confundată cu fructele cu coajă și „unt" să nu
 * apară în „untura".
 */
export function suggestAllergens(name: string): Allergen[] {
  const text = normalizeIngredientName(name);
  if (text.length < 3) return [];

  // Excepții: denumiri care conțin un cuvânt-cheie, dar nu conțin alergenul.
  const EXCEPTIONS = ['nuca de cocos', 'lapte de cocos', 'lapte de migdale', 'lapte vegetal', 'unt de cocos'];
  const exception = EXCEPTIONS.find((phrase) => text.includes(phrase));

  const words = text.split(' ');
  const found = new Set<Allergen>();

  for (const preset of PRESETS) {
    const matched = preset.keywords.some((keyword) => {
      const normalized = normalizeIngredientName(keyword);
      if (normalized.includes(' ')) return text.includes(normalized);
      return words.includes(normalized);
    });
    if (matched) preset.allergens.forEach((allergen) => found.add(allergen));
  }

  if (exception) {
    if (exception.includes('cocos')) {
      found.delete('milk');
      found.delete('nuts');
    }
    if (exception.includes('migdale')) found.delete('milk');
    if (exception.includes('vegetal')) found.delete('milk');
  }

  return [...found];
}
