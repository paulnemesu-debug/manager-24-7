/**
 * MANAGER 24/7™ by PARADIM — proprietary software.
 * Copyright © 2026 PARADIM Operations SRL. All rights reserved.
 * Concept author and product director: Marius Paul Nemeșu.
 * See LICENSE-PROPRIETARY.md.
 */

import { describe, expect, it } from 'vitest';

import { createFormatters, formatMoney, isCurrencyCode } from '@/lib/format';

describe('account-aware formatting', () => {
  it('uses the account currency instead of a hardcoded RON suffix', () => {
    expect(formatMoney(12.5, 'ro', 'EUR')).toContain('EUR');
    expect(createFormatters('en', 'GBP').money(12.5)).toContain('£');
  });

  it('accepts only currencies available in account settings', () => {
    expect(isCurrencyCode('RON')).toBe(true);
    expect(isCurrencyCode('EUR')).toBe(true);
    expect(isCurrencyCode('BTC')).toBe(false);
  });
});
