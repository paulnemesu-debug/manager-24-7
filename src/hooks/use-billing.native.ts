/**
 * MANAGER 24/7™ by PARADIM — proprietary software.
 * Copyright © 2026 PARADIM Operations SRL. All rights reserved.
 * Concept author and product director: Marius Paul Nemeșu.
 * See LICENSE-PROPRIETARY.md.
 */

import type { BillingState } from '@/hooks/billing-types';

export function useBilling(): BillingState {
  return {
    configured: false,
    connected: false,
    isLoading: false,
    displayPrice: null,
    error: null,
    buy: async () => undefined,
    restore: async () => undefined,
  };
}
