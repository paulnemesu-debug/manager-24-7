/**
 * MANAGER 24/7™ by PARADIM — proprietary software.
 * Copyright © 2026 PARADIM Operations SRL. All rights reserved.
 * Concept author and product director: Marius Paul Nemeșu.
 * See LICENSE-PROPRIETARY.md.
 */

import type { PnlInputs, PnlResult } from '@/types/pnl';

export const EMPTY_PNL_INPUTS: PnlInputs = {
  revenueFood: 0,
  revenueBeverage: 0,
  revenueOther: 0,
  cogsFood: 0,
  cogsBeverage: 0,
  packagingCost: 0,
  payrollCost: 0,
  rentCost: 0,
  utilitiesCost: 0,
  deliveryCommissions: 0,
  marketingCost: 0,
  maintenanceCost: 0,
  adminSoftwareCost: 0,
  otherOperatingCost: 0,
  taxesInterestDepreciation: 0,
};

const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const percent = (value: number, total: number) => total > 0 ? (value / total) * 100 : null;
const safe = (value: number) => Number.isFinite(value) ? Math.max(0, value) : 0;

export function calculatePnl(source: PnlInputs): PnlResult {
  const input = Object.fromEntries(
    Object.entries(source).map(([key, value]) => [key, safe(value)]),
  ) as PnlInputs;
  const totalRevenue = roundMoney(input.revenueFood + input.revenueBeverage + input.revenueOther);
  const totalCogs = roundMoney(input.cogsFood + input.cogsBeverage + input.packagingCost);
  const grossProfit = roundMoney(totalRevenue - totalCogs);
  const operatingCosts = roundMoney(
    input.payrollCost
      + input.rentCost
      + input.utilitiesCost
      + input.deliveryCommissions
      + input.marketingCost
      + input.maintenanceCost
      + input.adminSoftwareCost
      + input.otherOperatingCost,
  );
  const primeCost = roundMoney(totalCogs + input.payrollCost);
  const ebitda = roundMoney(grossProfit - operatingCosts);
  const netResult = roundMoney(ebitda - input.taxesInterestDepreciation);
  const variableCosts = totalCogs + input.deliveryCommissions;
  const variableCostRate = totalRevenue > 0 ? variableCosts / totalRevenue : null;
  const fixedCosts = roundMoney(
    input.payrollCost
      + input.rentCost
      + input.utilitiesCost
      + input.marketingCost
      + input.maintenanceCost
      + input.adminSoftwareCost
      + input.otherOperatingCost
      + input.taxesInterestDepreciation,
  );
  const breakEvenRevenue = variableCostRate !== null && variableCostRate < 1
    ? roundMoney(fixedCosts / (1 - variableCostRate))
    : null;
  const primeCostPercent = percent(primeCost, totalRevenue);
  const netMarginPercent = percent(netResult, totalRevenue);

  const healthStatus = totalRevenue <= 0
    ? 'incomplete'
    : netResult < 0 || (primeCostPercent ?? 0) > 75
      ? 'critical'
      : (netMarginPercent ?? 0) >= 8 && (primeCostPercent ?? 100) <= 65
        ? 'healthy'
        : 'watch';

  return {
    totalRevenue,
    totalCogs,
    grossProfit,
    grossMarginPercent: percent(grossProfit, totalRevenue),
    operatingCosts,
    primeCost,
    primeCostPercent,
    ebitda,
    ebitdaMarginPercent: percent(ebitda, totalRevenue),
    netResult,
    netMarginPercent,
    breakEvenRevenue,
    breakEvenGap: breakEvenRevenue === null ? null : roundMoney(totalRevenue - breakEvenRevenue),
    healthStatus,
  };
}

export function currentPnlPeriod(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export function normalizePnlPeriod(value: string) {
  const match = /^(\d{4})-(\d{2})/.exec(value);
  if (!match) return currentPnlPeriod();
  const month = Math.min(12, Math.max(1, Number(match[2])));
  return `${match[1]}-${String(month).padStart(2, '0')}`;
}
