/**
 * MANAGER 24/7™ by PARADIM — proprietary software.
 * Copyright © 2026 PARADIM Operations SRL. All rights reserved.
 * Concept author and product director: Marius Paul Nemeșu.
 * See LICENSE-PROPRIETARY.md.
 */

export type BillingState = {
  configured: boolean;
  connected: boolean;
  isLoading: boolean;
  displayPrice: string | null;
  error: string | null;
  buy: () => Promise<void>;
  restore: () => Promise<void>;
};
