/**
 * MANAGER 24/7™ by PARADIM — proprietary software.
 * Copyright © 2026 PARADIM Operations SRL. All rights reserved.
 * Concept author and product director: Marius Paul Nemeșu.
 * See LICENSE-PROPRIETARY.md.
 */

import type { PriceUnit, QuantityUnit } from '@/types/recipe';

export type SyncState = 'local' | 'pending' | 'synced';

export type OperationalLine = {
  id: string;
  catalogId: string | null;
  name: string;
  quantity: number;
  unit: QuantityUnit;
  purchasePrice: number;
  priceUnit: PriceUnit;
  /** Pierdere la curățare/procesare. Este aplicată doar în calculul rețetei bulk. */
  lossPercent?: number;
  cost: number;
};

export type ConsumptionVoucherSource = 'manual' | 'file_import' | 'production_plan' | 'bulk_recipe';

export type ConsumptionVoucher = {
  id: string;
  documentDate: string;
  reference: string;
  source: ConsumptionVoucherSource;
  sourceReference: string | null;
  notes: string;
  lines: OperationalLine[];
  totalCost: number;
  createdAt: string;
  updatedAt: string;
  syncState: SyncState;
  deletedAt: string | null;
};

export type ConsumptionVoucherDraft = Omit<
  ConsumptionVoucher,
  'createdAt' | 'updatedAt' | 'syncState' | 'deletedAt' | 'totalCost'
>;

export type BulkBatchSource = 'manual' | 'file_import' | 'consumption_voucher';

export type BulkBatch = {
  id: string;
  recipeId: string | null;
  batchDate: string;
  title: string;
  source: BulkBatchSource;
  sourceReference: string | null;
  lines: OperationalLine[];
  finalWeightGrams: number;
  portions: number;
  salePriceGross: number;
  vatPercent: number;
  totalCost: number;
  portionCost: number;
  costPerKg: number | null;
  foodCostPercent: number | null;
  notes: string;
  createdAt: string;
  updatedAt: string;
  syncState: SyncState;
  deletedAt: string | null;
};

export type BulkBatchDraft = Omit<
  BulkBatch,
  | 'createdAt'
  | 'updatedAt'
  | 'syncState'
  | 'deletedAt'
  | 'totalCost'
  | 'portionCost'
  | 'costPerKg'
  | 'foodCostPercent'
>;

export type BulkBatchTotals = Pick<
  BulkBatch,
  'totalCost' | 'portionCost' | 'costPerKg' | 'foodCostPercent'
> & {
  servingWeightGrams: number | null;
};
