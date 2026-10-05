/**
 * MANAGER 24/7™ by PARADIM — proprietary software.
 * Copyright © 2026 PARADIM Operations SRL. All rights reserved.
 * Concept author and product director: Marius Paul Nemeșu.
 * See LICENSE-PROPRIETARY.md.
 */

import { describe, expect, it } from 'vitest';

import { hasEntitlementAccess, isEntitlementLeaseValid } from '@/lib/subscription-cache';

const day = 24 * 60 * 60 * 1000;
const now = new Date('2026-09-13T12:00:00.000Z').getTime();

function snapshot(overrides = {}) {
  return {
    status: 'active' as const,
    isAdmin: false,
    isViewer: false,
    productId: 'pro',
    periodEnd: null,
    checkedAt: new Date(now - day).toISOString(),
    serverAllowed: true,
    ...overrides,
  };
}

describe('offline entitlement lease', () => {
  it('keeps a recently validated paid account available offline', () => {
    expect(isEntitlementLeaseValid(snapshot(), now)).toBe(true);
    expect(hasEntitlementAccess(snapshot(), now)).toBe(true);
  });

  it('does not turn the cache into a permanent paywall bypass', () => {
    const stale = snapshot({ checkedAt: new Date(now - 8 * day).toISOString() });
    expect(isEntitlementLeaseValid(stale, now)).toBe(false);
    expect(hasEntitlementAccess(stale, now)).toBe(false);
  });

  it('never grants access when the server denied the entitlement', () => {
    expect(hasEntitlementAccess(snapshot({ serverAllowed: false }), now)).toBe(false);
  });
});
