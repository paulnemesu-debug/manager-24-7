/**
 * MANAGER 24/7™ by PARADIM — proprietary software.
 * Copyright © 2026 PARADIM Operations SRL. All rights reserved.
 * Concept author and product director: Marius Paul Nemeșu.
 * See LICENSE-PROPRIETARY.md.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { withStorageLock } from '@/lib/storage-lock';
import { cloudRevisionTime } from '@/lib/cloud-revision-time';

import { EMPTY_PNL_INPUTS, normalizePnlPeriod } from '@/lib/pnl';
import { OperationalError } from '@/lib/operational-sync';
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
const recoveryKey = (userId: string) => `manager247.pnl_reports.recovery.v1.${userId}`;
const reportColumns = 'id,period,revenue_food,revenue_beverage,revenue_other,cogs_food,cogs_beverage,packaging_cost,payroll_cost,rent_cost,utilities_cost,delivery_commissions,marketing_cost,maintenance_cost,admin_software_cost,other_operating_cost,taxes_interest_depreciation,notes,created_at,updated_at';

async function reportAuthorization(userId: string): Promise<string | null> {
  try {
    const { data, error } = await supabase!.auth.getSession();
    return !error && data.session?.user.id === userId && data.session.access_token
      ? `Bearer ${data.session.access_token}` : null;
  } catch { return null; }
}

function validRemoteReport(value: unknown): value is RemotePnlReport {
  if (!value || typeof value !== 'object') return false;
  const row = value as RemotePnlReport;
  return typeof row.period === 'string' && /^\d{4}-(0[1-9]|1[0-2])-01$/.test(row.period)
    && cloudRevisionTime(row.updated_at) !== null && isKnownPnlReport(fromRemote(row));
}

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

function isKnownPnlReport(value: unknown): value is PnlReport {
  if (!value || typeof value !== 'object') return false;
  const report = value as Record<string, unknown>;
  return typeof report.id === 'string' && report.id.trim().length > 0
    && typeof report.period === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(report.period)
    && typeof report.notes === 'string'
    && typeof report.createdAt === 'string' && typeof report.updatedAt === 'string'
    && ['local', 'pending', 'synced'].includes(String(report.syncState))
    && Object.keys(EMPTY_PNL_INPUTS).every((key) => typeof report[key] === 'number' && Number.isFinite(report[key]));
}

async function readCachedPnlReports(userId: string): Promise<{ reports: PnlReport[]; known: boolean; raw: string | null }> {
  const raw = await AsyncStorage.getItem(cacheKey(userId));
  if (raw === null) return { reports: [], known: false, raw };
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? { reports: parsed as PnlReport[], known: parsed.every(isKnownPnlReport), raw }
      : { reports: [], known: false, raw };
  } catch {
    return { reports: [], known: false, raw };
  }
}

export async function loadCachedPnlReports(userId: string): Promise<PnlReport[]> {
  const cached = await readCachedPnlReports(userId);
  if (cached.raw !== null && !cached.known) throw new OperationalError('operational.sync.invalidLocal');
  return cached.reports;
}

async function preserveRecoverySource(userId: string, raw: string) {
  const stored = await AsyncStorage.getItem(recoveryKey(userId));
  let archive: { raw: string; recordedAt: string }[] = [];
  if (stored !== null) {
    try {
      const parsed: unknown = JSON.parse(stored);
      if (!Array.isArray(parsed) || parsed.some(item => !item || typeof item.raw !== 'string'
        || typeof item.recordedAt !== 'string')) throw new Error('Invalid recovery archive');
      archive = parsed;
    } catch { throw new OperationalError('operational.sync.invalidLocal'); }
  }
  if (archive.some(item => item.raw === raw)) return;
  // Preserve the exact unknown bytes before recovery can replace the working
  // cache. A rejected archive write stops replacement; no pending data is guessed.
  await AsyncStorage.setItem(recoveryKey(userId), JSON.stringify([...archive, { raw, recordedAt: new Date().toISOString() }]));
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
  };
}

async function savePnlReportUnlocked(userId: string, draft: PnlReportDraft, capturedAuthorization?: string): Promise<PnlReport> {
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
    baseUpdatedAt: existing ? existing.syncState === 'synced' ? existing.updatedAt : existing.baseUpdatedAt : null,
  };
  await replaceCached(userId, pending);
  if (!canUseCloud(userId) || !supabase) return pending;
  const authorization = capturedAuthorization ?? await reportAuthorization(userId);
  if (!authorization) return pending;

  const { data, error } = await supabase
    .from('pnl_reports')
    .upsert(toRemote(userId, pending), { onConflict: 'user_id,period' })
    .select(reportColumns)
    .single().setHeader('Authorization', authorization);
  if (error || !validRemoteReport(data) || normalizePnlPeriod(data.period) !== pending.period) return pending;
  const synced = fromRemote(data as RemotePnlReport);
  await replaceCached(userId, synced);
  return synced;
}

async function syncPendingPnlReports(userId: string, reports: PnlReport[], authorization: string) {
  let local = reports;
  for (const report of local.filter((item) => item.syncState === 'pending')) {
    try {
      const checked = await supabase!.from('pnl_reports').select(reportColumns)
        .eq('user_id', userId).in('period', [`${report.period}-01`]).setHeader('Authorization', authorization);
      if (checked.error || !Array.isArray(checked.data) || checked.data.length > 1 || !checked.data.every(validRemoteReport)) continue;
      const cloud = checked.data[0] ? fromRemote(checked.data[0]) : null;
      if (cloud && cloud.period !== report.period) continue;
      const same = cloud && cloud.notes.trim() === report.notes.trim()
        && Object.keys(EMPTY_PNL_INPUTS).every(key => cloud[key as keyof typeof EMPTY_PNL_INPUTS] === report[key as keyof typeof EMPTY_PNL_INPUTS]);
      let acknowledged: PnlReport | null = same ? cloud : null;
      if (!same) {
        // A lost response can be followed by a newer edit on another device.
        // Replay only the recorded base revision; unknown legacy conflicts stay local.
        if (cloud && (!report.baseUpdatedAt || cloudRevisionTime(report.baseUpdatedAt) !== cloudRevisionTime(cloud.updatedAt))) continue;
        if (!cloud && report.baseUpdatedAt !== null) continue;
        const payload = toRemote(userId, { ...report, id: cloud?.id ?? report.id });
        const write = cloud
          ? supabase!.from('pnl_reports').update(payload).eq('user_id', userId).eq('id', cloud.id)
            .eq('period', `${report.period}-01`).eq('updated_at', cloud.updatedAt)
          : supabase!.from('pnl_reports').insert(payload);
        const result = await write.select(reportColumns).single().setHeader('Authorization', authorization);
        if (result.error || !validRemoteReport(result.data) || normalizePnlPeriod(result.data.period) !== report.period) continue;
        acknowledged = fromRemote(result.data);
      }
      if (acknowledged) {
        await replaceCached(userId, acknowledged);
        local = local.map(item => item.period === report.period ? acknowledged! : item);
      }
    } catch { /* Preserve the original local intent for a later retry or explicit save. */ }
  }
  return local;
}

async function syncPnlReportsUnlocked(userId: string, options: { requireKnownReports?: boolean } = {}): Promise<PnlReport[]> {
  const cached = await readCachedPnlReports(userId);
  const corrupted = cached.raw !== null && !cached.known;
  const needsRecovery = corrupted || options.requireKnownReports && !cached.known;
  // Retain valid local intent, but an invalid collection is not a known offline snapshot.
  let local = needsRecovery ? cached.reports.filter(isKnownPnlReport) : cached.reports;
  if (!canUseCloud(userId) || !supabase) return local;
  const authorization = await reportAuthorization(userId);
  if (!authorization) {
    if (options.requireKnownReports && !cached.known) throw new Error('P&L reports are unavailable without a valid local cache.');
    return local;
  }
  // Verify unknown data before uploads can replace the malformed source cache.
  if (!needsRecovery) local = await syncPendingPnlReports(userId, local, authorization);

  const result = await supabase
    .from('pnl_reports')
    .select(reportColumns)
    .eq('user_id', userId)
    .order('period', { ascending: false })
    .limit(36)
    .setHeader('Authorization', authorization)
    .then((response) => response, (error: unknown) => {
      if (!options.requireKnownReports || !cached.known) throw error;
      return null;
    });
  if (!result) return local;
  const { data, error } = result;
  if (error) {
    if (options.requireKnownReports && !cached.known) throw new Error('P&L reports are unavailable without a valid local cache.');
    return local;
  }

  if (!Array.isArray(data) || !data.every(validRemoteReport)) {
    if (options.requireKnownReports && !cached.known) throw new Error('P&L reports could not be verified.');
    return local;
  }
  const remote = new Map(data.map(row => { const report = fromRemote(row); return [report.period, report]; }));
  const missing = new Set<string>();
  const periods = local.filter(item => item.syncState === 'synced' && (!remote.has(item.period)
    || (cloudRevisionTime(remote.get(item.period)!.updatedAt) ?? -1n) < (cloudRevisionTime(item.updatedAt) ?? -1n)))
    .map(item => `${item.period}-01`);
  // The monthly list is capped at 36. Verify missing months explicitly before
  // interpreting an omission as deletion, and never upload acknowledged cache.
  for (let offset = 0; offset < periods.length; offset += 50) {
    const batch = periods.slice(offset, offset + 50);
    try {
      const checked = await supabase.from('pnl_reports').select(reportColumns)
        .eq('user_id', userId).in('period', batch).setHeader('Authorization', authorization);
      if (checked.error || !Array.isArray(checked.data) || !checked.data.every(validRemoteReport)
        || !checked.data.every(row => batch.includes(row.period))
        || new Set(checked.data.map(row => row.period)).size !== checked.data.length) continue;
      const verified = new Map(checked.data.map(row => { const report = fromRemote(row); return [report.period, report]; }));
      for (const date of batch) {
        const period = date.slice(0, 7);
        const report = verified.get(period);
        if (report) remote.set(period, report);
        else { remote.delete(period); missing.add(period); }
      }
    } catch { /* A failed check cannot erase the acknowledged offline snapshot. */ }
  }
  for (const item of local.filter(item => item.syncState === 'synced')) {
    if (missing.has(item.period)) continue;
    const cloud = remote.get(item.period);
    if (!cloud || (cloudRevisionTime(item.updatedAt) ?? -1n) > (cloudRevisionTime(cloud.updatedAt) ?? -1n)) remote.set(item.period, item);
  }
  const unsynced = local.filter((item) => item.syncState !== 'synced');
  if (corrupted) await preserveRecoverySource(userId, cached.raw!);
  const merged = await writeCache(userId, [
    ...unsynced,
    ...[...remote.values()].filter((item) => !unsynced.some((localItem) => localItem.period === item.period)),
  ]);
  return needsRecovery ? syncPendingPnlReports(userId, merged, authorization) : merged;
}

export const savePnlReport = (userId: string, draft: PnlReportDraft) =>
  withStorageLock(cacheKey(userId), () => savePnlReportUnlocked(userId, draft));
export const syncPnlReports = (userId: string, options: { requireKnownReports?: boolean } = {}) =>
  withStorageLock(cacheKey(userId), () => syncPnlReportsUnlocked(userId, options));
