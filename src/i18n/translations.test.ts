/**
 * MANAGER 24/7™ by PARADIM — proprietary software.
 * Copyright © 2026 PARADIM Operations SRL. All rights reserved.
 * Concept author and product director: Marius Paul Nemeșu.
 * See LICENSE-PROPRIETARY.md.
 */

import { describe, expect, it } from 'vitest';

import { SUPPORTED_LOCALES, translate, translations } from './translations';

describe('translations', () => {
  it('covers every key in every supported language', () => {
    const keys = Object.keys(translations.ro);
    for (const locale of SUPPORTED_LOCALES) {
      const missing = keys.filter((key) => !translations[locale][key as keyof typeof translations.ro]);
      expect({ locale, missing }).toEqual({ locale, missing: [] });
    }
  });

  it('replaces named parameters', () => {
    expect(translate('en', 'recipes.count', { count: 4 })).toBe('4 dishes analysed');
    expect(translate('ro', 'recipes.count', { count: 4 })).toBe('4 preparate analizate');
  });

  it('leaves unknown parameters untouched instead of printing undefined', () => {
    expect(translate('ro', 'recipes.count')).toContain('{count}');
  });

  it('offers email codes and unlimited admin access in both languages', () => {
    expect(translate('ro', 'signIn.sendCode')).toBe('Trimite codul de acces');
    expect(translate('en', 'signIn.sendCode')).toBe('Send access code');
    for (const locale of SUPPORTED_LOCALES) {
      expect(translate(locale, 'signIn.noPassword')).not.toMatch(/link/i);
      expect(translate(locale, 'signIn.codeSentBody', { email: 'test@example.com' })).toContain('test@example.com');
      expect(translate(locale, 'account.adminBadge')).toMatch(/nelimitat|unlimited/i);
    }
  });
});
