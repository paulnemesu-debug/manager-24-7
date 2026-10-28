/**
 * MANAGER 24/7™ by PARADIM — proprietary software.
 * Copyright © 2026 PARADIM Operations SRL. All rights reserved.
 * Concept author and product director: Marius Paul Nemeșu.
 * See LICENSE-PROPRIETARY.md.
 */

import { describe, expect, it } from 'vitest';

import { calculatePnl, EMPTY_PNL_INPUTS, normalizePnlPeriod } from '@/lib/pnl';

describe('managerial P&L', () => {
  it('calculates gross profit, Prime Cost, EBITDA and net result', () => {
    const result = calculatePnl({
      ...EMPTY_PNL_INPUTS,
      revenueFood: 80_000,
      revenueBeverage: 20_000,
      cogsFood: 24_000,
      cogsBeverage: 5_000,
      packagingCost: 1_000,
      payrollCost: 30_000,
      rentCost: 8_000,
      utilitiesCost: 4_000,
      marketingCost: 1_000,
      adminSoftwareCost: 1_000,
      taxesInterestDepreciation: 2_000,
    });

    expect(result.totalRevenue).toBe(100_000);
    expect(result.totalCogs).toBe(30_000);
    expect(result.grossProfit).toBe(70_000);
    expect(result.primeCost).toBe(60_000);
    expect(result.primeCostPercent).toBe(60);
    expect(result.ebitda).toBe(26_000);
    expect(result.netResult).toBe(24_000);
    expect(result.healthStatus).toBe('healthy');
  });

  it('marks a loss as critical and calculates the break-even gap', () => {
    const result = calculatePnl({
      ...EMPTY_PNL_INPUTS,
      revenueFood: 50_000,
      cogsFood: 25_000,
      payrollCost: 20_000,
      rentCost: 10_000,
      utilitiesCost: 5_000,
    });

    expect(result.netResult).toBe(-10_000);
    expect(result.breakEvenRevenue).toBe(70_000);
    expect(result.breakEvenGap).toBe(-20_000);
    expect(result.healthStatus).toBe('critical');
  });

  it('does not invent percentages without revenue', () => {
    const result = calculatePnl({ ...EMPTY_PNL_INPUTS, rentCost: 3_000 });
    expect(result.grossMarginPercent).toBeNull();
    expect(result.breakEvenRevenue).toBeNull();
    expect(result.healthStatus).toBe('incomplete');
  });

  it('normalizes a selected date to its reporting month', () => {
    expect(normalizePnlPeriod('2026-09-28')).toBe('2026-09');
    expect(normalizePnlPeriod('2026-99')).toBe('2026-12');
  });
});
