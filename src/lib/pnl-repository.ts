/**
 * MANAGER 24/7™ by PARADIM — proprietary software.
 * Copyright © 2026 PARADIM Operations SRL. All rights reserved.
 * Concept author and product director: Marius Paul Nemeșu.
 * See LICENSE-PROPRIETARY.md.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

import { normalizePnlPeriod } from '@/lib/pnl';
import { isDemoMode, isSupabaseConfigured, supabase } from '@/lib/supabase';
import type { PnlReport, PnlReportDraft } from '@/types/pnl';

type RemotePnlReport = {
  id: string;
  period: string;
  revenue_food: number;
  revenue_beverage: number;
  revenue_other: number;
  cogs_food: number;
  cogs_beverage: number;
  packaging_cost: number;
  payroll_cost: number;
  rent_cost: number;
  utilities_cost: number;
  delivery_commissions: number;
  marketing_cost: number;
  maintenance_cost: number;
  admin_software_cost: number;
  other_operating_cost: number;
  taxes_interest_depreciation: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

const cacheKey = (userId: string) => `manager247.pnl_reports.v1.${userId}`;

function createUuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (character) => {
    const random = Math.floor(Math.random() * 16);
    const value = character === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

export const createPnlReportId = createUuid;

function canUseCloud(userId: string) {
  return userId !== 'demo' && !isDemoMode && isSupabaseConfigured && Boolean(supabase);
}

export async function loadCachedPnlReports(userId: string): Promise<PnlReport[]> {
  const raw = await AsyncStorage.getItem(cacheKey(userId));
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed as PnlReport[] : [];
  } catch {
    return [];
  }
}

async function writeCache(userId: string, reports: PnlReport[]) {
  const sorted = [...reports].sort((left, right) => (
    right.period.localeCompare(left.period) || right.updatedAt.localeCompare(left.updatedAt)
  ));
  await AsyncStorage.setItem(cacheKey(userId), JSON.stringify(sorted));
  return sorted;
}

async function replaceCached(userId: string, report: PnlReport) {
  const current = await loadCachedPnlReports(userId);
  return writeCache(userId, [
    report,
    ...current.filter((item) => item.id !== report.id && item.period !== report.period),
  ]);
}

function fromRemote(row: RemotePnlReport): PnlReport {
  return {
    id: row.id,
    period: normalizePnlPeriod(row.period),
    revenueFood: Number(row.revenue_food),
    revenueBeverage: Number(row.revenue_beverage),
    revenueOther: Number(row.revenue_other),
    cogsFood: Number(row.cogs_food),
    cogsBeverage: Number(row.cogs_beverage),
    packagingCost: Number(row.packaging_cost),
    payrollCost: Number(row.payroll_cost),
    rentCost: Number(row.rent_cost),
    utilitiesCost: Number(row.utilities_cost),
    deliveryCommissions: Number(row.delivery_commissions),
    marketingCost: Number(row.marketing_cost),
    maintenanceCost: Number(row.maintenance_cost),
    adminSoftwareCost: Number(row.admin_software_cost),
    otherOperatingCost: Number(row.other_operating_cost),
    taxesInterestDepreciation: Number(row.taxes_interest_depreciation),
    notes: row.notes ?? '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    syncState: 'synced',
  };
}

function toRemote(userId: string, report: PnlReport) {
  return {
    id: report.id,
    user_id: userId,
    period: `${normalizePnlPeriod(report.period)}-01`,
    revenue_food: report.revenueFood,
    revenue_beverage: report.revenueBeverage,
    revenue_other: report.revenueOther,
    cogs_food: report.cogsFood,
    cogs_beverage: report.cogsBeverage,
    packaging_cost: report.packagingCost,
    payroll_cost: report.payrollCost,
    rent_cost: report.rentCost,
    utilities_cost: report.utilitiesCost,
    delivery_commissions: report.deliveryCommissions,
    marketing_cost: report.marketingCost,
    maintenance_cost: report.maintenanceCost,
    admin_software_cost: report.adminSoftwareCost,
    other_operating_cost: report.otherOperatingCost,
    taxes_interest_depreciation: report.taxesInterestDepreciation,
    notes: report.notes.trim() || null,
    created_at: report.createdAt,
    updated_at: report.updatedAt,
  };
}

export async function savePnlReport(userId: string, draft: PnlReportDraft): Promise<PnlReport> {
  const now = new Date().toISOString();
  const current = await loadCachedPnlReports(userId);
  const existing = current.find((item) => item.id === draft.id || item.period === draft.period);
  const pending: PnlReport = {
    ...draft,
    id: existing?.id ?? draft.id,
    period: normalizePnlPeriod(draft.period),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    syncState: canUseCloud(userId) ? 'pending' : 'local',
  };
  await replaceCached(userId, pending);
  if (!canUseCloud(userId) || !supabase) return pending;

  const { data, error } = await supabase
    .from('pnl_reports')
    .upsert(toRemote(userId, pending), { onConflict: 'user_id,period' })
    .select('id,period,revenue_food,revenue_beverage,revenue_other,cogs_food,cogs_beverage,packaging_cost,payroll_cost,rent_cost,utilities_cost,delivery_commissions,marketing_cost,maintenance_cost,admin_software_cost,other_operating_cost,taxes_interest_depreciation,notes,created_at,updated_at')
    .single();
  if (error || !data) return pending;
  const synced = fromRemote(data as RemotePnlReport);
  await replaceCached(userId, synced);
  return synced;
}

export async function syncPnlReports(userId: string): Promise<PnlReport[]> {
  let local = await loadCachedPnlReports(userId);
  if (!canUseCloud(userId) || !supabase) return local;

  for (const report of local.filter((item) => item.syncState === 'pending')) {
    const synced = await savePnlReport(userId, report);
    local = local.map((item) => item.id === report.id ? synced : item);
  }

  const { data, error } = await supabase
    .from('pnl_reports')
    .select('id,period,revenue_food,revenue_beverage,revenue_other,cogs_food,cogs_beverage,packaging_cost,payroll_cost,rent_cost,utilities_cost,delivery_commissions,marketing_cost,maintenance_cost,admin_software_cost,other_operating_cost,taxes_interest_depreciation,notes,created_at,updated_at')
    .eq('user_id', userId)
    .order('period', { ascending: false })
    .limit(36);
  if (error) return local;

  const remote = (data as RemotePnlReport[]).map(fromRemote);
  const unsynced = local.filter((item) => item.syncState !== 'synced');
  return writeCache(userId, [
    ...unsynced,
    ...remote.filter((item) => !unsynced.some((localItem) => localItem.period === item.period)),
  ]);
}
