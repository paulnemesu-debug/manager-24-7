/**
 * MANAGER 24/7™ by PARADIM — proprietary software.
 * Copyright © 2026 PARADIM Operations SRL. All rights reserved.
 * Concept author and product director: Marius Paul Nemeșu.
 * See LICENSE-PROPRIETARY.md.
 */

import type { SyncState } from '@/types/operations';

export type PnlHealthStatus = 'incomplete' | 'healthy' | 'watch' | 'critical';

export type PnlInputs = {
  revenueFood: number;
  revenueBeverage: number;
  revenueOther: number;
  cogsFood: number;
  cogsBeverage: number;
  packagingCost: number;
  payrollCost: number;
  rentCost: number;
  utilitiesCost: number;
  deliveryCommissions: number;
  marketingCost: number;
  maintenanceCost: number;
  adminSoftwareCost: number;
  otherOperatingCost: number;
  taxesInterestDepreciation: number;
};

export type PnlReport = PnlInputs & {
  id: string;
  period: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
  syncState: SyncState;
};

export type PnlReportDraft = Omit<PnlReport, 'createdAt' | 'updatedAt' | 'syncState'>;

export type PnlResult = {
  totalRevenue: number;
  totalCogs: number;
  grossProfit: number;
  grossMarginPercent: number | null;
  operatingCosts: number;
  primeCost: number;
  primeCostPercent: number | null;
  ebitda: number;
  ebitdaMarginPercent: number | null;
  netResult: number;
  netMarginPercent: number | null;
  breakEvenRevenue: number | null;
  breakEvenGap: number | null;
  healthStatus: PnlHealthStatus;
};
