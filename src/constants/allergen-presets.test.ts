/**
 * MANAGER 24/7™ by PARADIM — proprietary software.
 * Copyright © 2026 PARADIM Operations SRL. All rights reserved.
 * Concept author and product director: Marius Paul Nemeșu.
 * See LICENSE-PROPRIETARY.md.
 */

import { describe, expect, it } from 'vitest';

import { suggestAllergens } from './allergen-presets';

describe('preset-uri de alergeni', () => {
  it('recunoaște lactatele scrise cu diacritice', () => {
    expect(suggestAllergens('Smântână 32%')).toEqual(['milk']);
    expect(suggestAllergens('Brânză telemea')).toEqual(['milk']);
  });

  it('recunoaște glutenul din produsele de panificație', () => {
    expect(suggestAllergens('Făină 000')).toEqual(['gluten']);
    expect(suggestAllergens('Chiflă brioche')).toEqual(['gluten']);
  });

  it('întoarce mai mulți alergeni pentru preparate compuse', () => {
    const maioneza = suggestAllergens('Maioneză');
    expect(maioneza).toContain('eggs');
    expect(maioneza).toContain('mustard');
  });

  it('nu confundă nuca de cocos cu fructele cu coajă', () => {
    expect(suggestAllergens('Lapte de cocos')).toEqual([]);
    expect(suggestAllergens('Nucă de cocos rasă')).toEqual([]);
  });

  it('nu se declanșează pe potriviri parțiale de cuvânt', () => {
    expect(suggestAllergens('Untură de porc')).toEqual([]);
    expect(suggestAllergens('Ouătoare')).toEqual([]);
  });

  it('nu propune nimic pentru ingrediente fără alergeni', () => {
    expect(suggestAllergens('Piept de pui')).toEqual([]);
    expect(suggestAllergens('Cartofi')).toEqual([]);
    expect(suggestAllergens('Sare')).toEqual([]);
  });

  it('ignoră denumirile prea scurte', () => {
    expect(suggestAllergens('ou')).toEqual([]);
    expect(suggestAllergens('')).toEqual([]);
  });
});
