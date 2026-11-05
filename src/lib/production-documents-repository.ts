/**
 * MANAGER 24/7™ by PARADIM — proprietary software.
 * Copyright © 2026 PARADIM Operations SRL. All rights reserved.
 * Concept author and product director: Marius Paul Nemeșu.
 * See LICENSE-PROPRIETARY.md.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { withStorageLock } from '@/lib/storage-lock';
import { OperationalError } from '@/lib/operational-sync';
import { cloudRevisionTime as historyTime } from '@/lib/cloud-revision-time';

import {
  calculateBulkBatchTotals,
  recalculateBulkOperationalLine,
  recalculateOperationalLine,
} from '@/lib/operations';
import { isDemoMode, isSupabaseConfigured, supabase } from '@/lib/supabase';
import type {
  BulkBatch,
  BulkBatchDraft,
  ConsumptionVoucher,
  ConsumptionVoucherDraft,
  OperationalLine,
} from '@/types/operations';

type RemoteVoucher = {
  id: string;
  user_id?: string;
  document_date: string;
  reference: string;
  source: ConsumptionVoucher['source'];
  source_reference: string | null;
  notes: string | null;
  lines: OperationalLine[];
  total_cost: number;
  created_at: string;
  updated_at: string;
};

type RemoteBatch = {
  id: string;
  user_id?: string;
  recipe_id: string | null;
  batch_date: string;
  title: string;
  source: BulkBatch['source'];
  source_reference: string | null;
  lines: OperationalLine[];
  final_weight_grams: number;
  portions: number;
  sale_price_gross: number;
  vat_percent: number;
  total_cost: number;
  portion_cost: number;
  cost_per_kg: number | null;
  food_cost_percent: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

const voucherKey = (userId: string) => `professional_foodcost.consumption_vouchers.v1.${userId}`;
const batchKey = (userId: string) => `professional_foodcost.bulk_batches.v1.${userId}`;
const voucherColumns = 'id,user_id,document_date,reference,source,source_reference,notes,lines,total_cost,created_at,updated_at';
const batchColumns = 'id,user_id,recipe_id,batch_date,title,source,source_reference,lines,final_weight_grams,portions,sale_price_gross,vat_percent,total_cost,portion_cost,cost_per_kg,food_cost_percent,notes,created_at,updated_at';

type HistoryRecord = { id: string; updatedAt: string; syncState: 'local' | 'pending' | 'synced'; deletedAt: string | null; createOnly?: boolean };
type RemoteHistory = { id: string; user_id?: string; updated_at: string; lines: OperationalLine[] };
type ReplayRecord = HistoryRecord & { baseUpdatedAt?: string | null };
type DocumentPayload = Record<string, unknown> & { lines: OperationalLine[] };
const lineFields = ['id', 'catalogId', 'name', 'quantity', 'unit', 'purchasePrice', 'priceUnit', 'lossPercent', 'cost'] as const;

function samePayload(left: DocumentPayload, right: DocumentPayload) {
  return Object.keys(left).filter(key => key !== 'created_at' && key !== 'lines').every(key => left[key] === right[key])
    && left.lines.length === right.lines.length
    && left.lines.every((line, index) => lineFields.every(key => line[key] === right.lines[index][key]));
}

async function replayOrdinaryDocument<T extends ReplayRecord, R extends RemoteHistory>(
  table: 'consumption_vouchers' | 'bulk_batches', columns: string, userId: string, authorization: string,
  pending: T, toRemote: (userId: string, item: T) => DocumentPayload, fromRemote: (row: R) => T,
): Promise<T> {
  try {
    const checked = await supabase!.from(table).select(columns).eq('user_id', userId)
      .in('id', [pending.id]).limit(2).setHeader('Authorization', authorization);
    if (checked.error || !Array.isArray(checked.data) || checked.data.length > 1) return pending;
    const row = checked.data[0] as unknown as R | undefined;
    if (row && (row.id !== pending.id || row.user_id !== userId || historyTime(row.updated_at) === null || !Array.isArray(row.lines))) return pending;
    const cloud = row ? fromRemote(row) : undefined;
    if (cloud && samePayload(toRemote(userId, cloud), toRemote(userId, pending))) {
      return { ...cloud, ...(pending.createOnly ? { createOnly: true } : {}) };
    }
    if (cloud ? !pending.baseUpdatedAt || historyTime(pending.baseUpdatedAt) !== historyTime(cloud.updatedAt)
      : pending.baseUpdatedAt !== null) return pending;
    const payload = toRemote(userId, pending);
    const write = cloud
      ? supabase!.from(table).update(payload).eq('user_id', userId).eq('id', pending.id).eq('updated_at', cloud.updatedAt)
      : supabase!.from(table).insert(payload);
    const result = await write.select(columns).single().setHeader('Authorization', authorization);
    const saved = result.data as unknown as R | null;
    if (result.error || !saved || saved.id !== pending.id || saved.user_id !== userId
      || historyTime(saved.updated_at) === null || !Array.isArray(saved.lines)) return pending;
    return { ...fromRemote(saved), ...(pending.createOnly ? { createOnly: true } : {}) };
  } catch { return pending; }
}

function voucherToRemote(userId: string, item: ConsumptionVoucher): DocumentPayload {
  return {
    id: item.id, user_id: userId, document_date: item.documentDate, reference: item.reference,
    source: item.source, source_reference: item.sourceReference, notes: item.notes || null,
    lines: item.lines, total_cost: item.totalCost, created_at: item.createdAt,
  };
}

function batchToRemote(userId: string, item: BulkBatch): DocumentPayload {
  return {
    id: item.id, user_id: userId, recipe_id: item.recipeId, batch_date: item.batchDate, title: item.title,
    source: item.source, source_reference: item.sourceReference, lines: item.lines,
    final_weight_grams: item.finalWeightGrams, portions: item.portions, sale_price_gross: item.salePriceGross,
    vat_percent: item.vatPercent, total_cost: item.totalCost, portion_cost: item.portionCost,
    cost_per_kg: item.costPerKg, food_cost_percent: item.foodCostPercent, notes: item.notes || null,
    created_at: item.createdAt,
  };
}

async function reconcileHistory<T extends HistoryRecord, R extends RemoteHistory>(
  table: 'consumption_vouchers' | 'bulk_batches',
  columns: string,
  userId: string,
  authorization: string,
  local: T[],
  list: R[],
  fromRemote: (row: R) => T,
): Promise<T[]> {
  const merged = new Map(local.map(item => [item.id, item]));
  const validRow = (row: R) => row && typeof row.id === 'string' && row.user_id === userId
    && typeof row.updated_at === 'string' && historyTime(row.updated_at) !== null && Array.isArray(row.lines);
  const accept = (row: R) => {
    const previous = merged.get(row.id);
    if (previous?.deletedAt || (previous && previous.syncState !== 'synced')) return;
    const previousTime = previous ? historyTime(previous.updatedAt) : null;
    const incomingTime = historyTime(row.updated_at)!;
    if (previous && (previousTime === null || incomingTime < previousTime)) return;
    merged.set(row.id, { ...fromRemote(row), ...(previous?.createOnly ? { createOnly: true } : {}) });
  };
  const listed = new Map<string, R>();
  for (const row of list) {
    if (!validRow(row)) continue;
    listed.set(row.id, row);
    accept(row);
  }
  const omittedOrOlder = local.filter(item => {
    if (item.deletedAt || item.syncState !== 'synced') return false;
    const listedRow = listed.get(item.id);
    const localTime = historyTime(item.updatedAt);
    return !listedRow || localTime === null || historyTime(listedRow.updated_at)! < localTime;
  });
  for (let offset = 0; offset < omittedOrOlder.length; offset += 50) {
    const ids = omittedOrOlder.slice(offset, offset + 50).map(item => item.id);
    try {
      const { data, error } = await supabase!.from(table).select(columns).eq('user_id', userId)
        .in('id', ids).limit(50).setHeader('Authorization', authorization);
      if (error || !Array.isArray(data)) continue;
      const verified = data as unknown as R[];
      if (verified.some(row => !validRow(row) || !ids.includes(row.id))
        || new Set(verified.map(row => row.id)).size !== verified.length) continue;
      for (const row of verified) accept(row);
      const present = new Set(verified.map(row => row.id));
      for (const id of ids) {
        if (present.has(id)) continue;
        const previous = merged.get(id)!;
        if (previous.createOnly) {
          merged.set(id, { ...previous, deletedAt: new Date().toISOString() });
        } else {
          merged.delete(id);
        }
      }
    } catch {
      // A failed verification is not evidence that an acknowledged document was deleted.
    }
  }
  return [...merged.values()].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

function createUuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (character) => {
    const random = Math.floor(Math.random() * 16);
    const value = character === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

export const createProductionDocumentId = createUuid;

function canUseCloud(userId: string) {
  return userId !== 'demo' && !isDemoMode && isSupabaseConfigured && Boolean(supabase);
}

async function readCache<T>(storageKey: string): Promise<T[]> {
  const raw = await AsyncStorage.getItem(storageKey);
  if (raw === null) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.some((item) => !item || typeof item.id !== 'string')) {
      throw new OperationalError('operational.sync.invalidLocal');
    }
    return parsed as T[];
  } catch {
    throw new OperationalError('operational.sync.invalidLocal');
  }
}

async function replaceCache<T extends { id: string; updatedAt: string }>(
  storageKey: string,
  item: T,
): Promise<T[]> {
  const current = await readCache<T>(storageKey);
  const next = [item, ...current.filter((entry) => entry.id !== item.id)]
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  await AsyncStorage.setItem(storageKey, JSON.stringify(next));
  return next;
}

function voucherFromRemote(row: RemoteVoucher): ConsumptionVoucher {
  return {
    id: row.id,
    documentDate: row.document_date,
    reference: row.reference,
    source: row.source,
    sourceReference: row.source_reference,
    notes: row.notes ?? '',
    lines: Array.isArray(row.lines) ? row.lines.map(recalculateOperationalLine) : [],
    totalCost: Number(row.total_cost),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    syncState: 'synced',
    deletedAt: null,
  };
}

function batchFromRemote(row: RemoteBatch): BulkBatch {
  return {
    id: row.id,
    recipeId: row.recipe_id,
    batchDate: row.batch_date,
    title: row.title,
    source: row.source,
    sourceReference: row.source_reference,
    lines: Array.isArray(row.lines) ? row.lines.map(recalculateBulkOperationalLine) : [],
    finalWeightGrams: Number(row.final_weight_grams),
    portions: Number(row.portions),
    salePriceGross: Number(row.sale_price_gross),
    vatPercent: Number(row.vat_percent),
    totalCost: Number(row.total_cost),
    portionCost: Number(row.portion_cost),
    costPerKg: row.cost_per_kg === null ? null : Number(row.cost_per_kg),
    foodCostPercent: row.food_cost_percent === null ? null : Number(row.food_cost_percent),
    notes: row.notes ?? '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    syncState: 'synced',
    deletedAt: null,
  };
}

export const loadCachedConsumptionVouchers = (userId: string) => (
  readCache<ConsumptionVoucher>(voucherKey(userId))
);

export const loadCachedBulkBatches = (userId: string) => (
  readCache<BulkBatch>(batchKey(userId))
);

async function saveConsumptionVoucherUnlocked(
  userId: string,
  draft: ConsumptionVoucherDraft,
  capturedAuthorization?: string,
): Promise<ConsumptionVoucher> {
  const now = new Date().toISOString();
  const cached = await loadCachedConsumptionVouchers(userId);
  const existing = cached.find((item) => item.id === draft.id);
  if (existing?.createOnly && existing.syncState === 'pending') {
    throw new Error('Așteptați sincronizarea bonului de producție înainte de editare. / Wait for the production voucher to synchronize before editing.');
  }
  const lines = draft.lines.map(recalculateOperationalLine);
  const pending: ConsumptionVoucher = {
    ...draft,
    lines,
    totalCost: Math.round(lines.reduce((sum, line) => sum + line.cost, 0) * 100) / 100,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    syncState: canUseCloud(userId) ? 'pending' : 'local',
    deletedAt: null,
    baseUpdatedAt: existing ? existing.syncState === 'synced' ? existing.updatedAt : existing.baseUpdatedAt : null,
    ...(existing?.createOnly ? { createOnly: true } : {}),
  };
  if (existing?.deletedAt) throw new ProductionVoucherDeletedError();
  await replaceCache(voucherKey(userId), pending);
  if (!canUseCloud(userId) || !supabase) return pending;
  const authorization = capturedAuthorization ?? await voucherAuthorization(userId);
  if (!authorization) return pending;
  const { data, error } = await supabase.from('consumption_vouchers').upsert(voucherToRemote(userId, pending), { onConflict: 'id' })
    .select('updated_at').single().setHeader('Authorization', authorization);
  if (error || typeof data?.updated_at !== 'string' || historyTime(data.updated_at) === null) return pending;
  const synced = { ...pending, updatedAt: data.updated_at, syncState: 'synced' as const };
  await replaceCache(voucherKey(userId), synced);
  return synced;
}

/** A deleted production voucher is a durable outcome, never an invitation to recreate it. */
export class ProductionVoucherDeletedError extends Error {
  constructor() { super('Bonul de consum a fost șters. Nu poate fi recreat automat. / The consumption voucher was deleted and cannot be recreated automatically.'); }
}

async function voucherAuthorization(userId: string): Promise<string | null> {
  if (!canUseCloud(userId) || !supabase) return null;
  try {
    const { data, error } = await supabase.auth.getSession();
    const session = data.session;
    return !error && session?.user.id === userId && session.access_token ? `Bearer ${session.access_token}` : null;
  } catch { return null; }
}

async function replayCreateOnlyVoucher(userId: string, pending: ConsumptionVoucher): Promise<ConsumptionVoucher> {
  if (pending.deletedAt) throw new ProductionVoucherDeletedError();
  if (!canUseCloud(userId) || !supabase) return pending;
  try {
    const authorization = await voucherAuthorization(userId);
    if (!authorization) return pending;
    const { data, error } = await supabase.rpc('create_production_sheet_voucher', {
      p_sheet_id: pending.sourceReference,
    }).setHeader('Authorization', authorization);
    if (error || !data || data.id !== pending.id || !['created','existing','deleted'].includes(data.status)) return pending;
    if (data.status === 'deleted') {
      const tombstone: ConsumptionVoucher = { ...pending, createOnly: true, deletedAt: new Date().toISOString(), syncState: 'synced' };
      await replaceCache(voucherKey(userId), tombstone);
      throw new ProductionVoucherDeletedError();
    }
    if (!data.record || data.record.id !== pending.id) return pending;
    const authoritative: ConsumptionVoucher = { ...voucherFromRemote(data.record as RemoteVoucher), createOnly: true };
    await replaceCache(voucherKey(userId), authoritative);
    return authoritative;
  } catch (error) {
    if (error instanceof ProductionVoucherDeletedError) throw error;
    return pending;
  }
}

/** Explicit production-sheet request; offline intent remains insert-only across restarts. */
export const createConsumptionVoucherOnce = (userId: string, draft: ConsumptionVoucherDraft) =>
  withStorageLock(voucherKey(userId), async (): Promise<ConsumptionVoucher> => {
    if (draft.source !== 'production_plan' || !draft.sourceReference) throw new Error('Production sheet reference required / Referința fișei de producție este obligatorie');
    const cached = await loadCachedConsumptionVouchers(userId);
    const existing = cached.find(item => item.id === draft.id);
    if (existing?.deletedAt) throw new ProductionVoucherDeletedError();
    const now = new Date().toISOString();
    const lines = draft.lines.map(recalculateOperationalLine);
    const pending: ConsumptionVoucher = existing ?? {
      ...draft, lines, totalCost: Math.round(lines.reduce((sum,line)=>sum+line.cost,0)*100)/100,
      createdAt: now, updatedAt: now, syncState: canUseCloud(userId)?'pending':'local', deletedAt:null, createOnly:true,
    };
    await replaceCache(voucherKey(userId),pending);
    return replayCreateOnlyVoucher(userId,pending);
  });

async function saveBulkBatchUnlocked(userId: string, draft: BulkBatchDraft, capturedAuthorization?: string): Promise<BulkBatch> {
  const now = new Date().toISOString();
  const cached = await loadCachedBulkBatches(userId);
  const existing = cached.find((item) => item.id === draft.id);
  if (existing?.deletedAt) {
    throw new Error('Fișa de producție a fost ștearsă. / The bulk batch was deleted.');
  }
  const lines = draft.lines.map(recalculateBulkOperationalLine);
  const totals = calculateBulkBatchTotals({ ...draft, lines });
  const pending: BulkBatch = {
    ...draft,
    ...totals,
    lines,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    syncState: canUseCloud(userId) ? 'pending' : 'local',
    deletedAt: null,
    baseUpdatedAt: existing ? existing.syncState === 'synced' ? existing.updatedAt : existing.baseUpdatedAt : null,
  };
  await replaceCache(batchKey(userId), pending);
  if (!canUseCloud(userId) || !supabase) return pending;
  const authorization = capturedAuthorization ?? await voucherAuthorization(userId);
  if (!authorization) return pending;
  const { data, error } = await supabase.from('bulk_batches').upsert(batchToRemote(userId, pending), { onConflict: 'id' })
    .select('updated_at').single().setHeader('Authorization', authorization);
  if (error || typeof data?.updated_at !== 'string' || historyTime(data.updated_at) === null) return pending;
  const synced = { ...pending, updatedAt: data.updated_at, syncState: 'synced' as const };
  await replaceCache(batchKey(userId), synced);
  return synced;
}

async function syncConsumptionVouchersUnlocked(userId: string): Promise<ConsumptionVoucher[]> {
  let local = await loadCachedConsumptionVouchers(userId);
  const visible = () => local.filter(item=>!item.deletedAt);
  if (!canUseCloud(userId) || !supabase) return visible();
  const authorization = await voucherAuthorization(userId);
  if (!authorization) return visible();
  for (const item of local.filter(entry=>entry.syncState==='pending' && !entry.deletedAt)) {
    if (item.createOnly && item.baseUpdatedAt === undefined) {
      try { await replayCreateOnlyVoucher(userId,item); }
      catch(error) { if(!(error instanceof ProductionVoucherDeletedError)) throw error; }
      local=await loadCachedConsumptionVouchers(userId);
    } else {
      const synced = await replayOrdinaryDocument('consumption_vouchers', voucherColumns, userId, authorization, item, voucherToRemote, voucherFromRemote);
      if (synced !== item) await replaceCache(voucherKey(userId), synced);
      local=local.map(entry=>entry.id===synced.id?synced:entry);
    }
  }
  const {data,error}=await supabase.from('consumption_vouchers')
    .select(voucherColumns)
    .eq('user_id',userId).order('document_date',{ascending:false}).order('updated_at',{ascending:false}).limit(100)
    .setHeader('Authorization',authorization);
  if(error)return visible();
  if (!Array.isArray(data)) return visible();
  const merged = await reconcileHistory('consumption_vouchers', voucherColumns, userId, authorization, local, data as RemoteVoucher[], voucherFromRemote);
  await AsyncStorage.setItem(voucherKey(userId),JSON.stringify(merged));
  return merged.filter(item=>!item.deletedAt);
}

async function syncBulkBatchesUnlocked(userId: string): Promise<BulkBatch[]> {
  let local = await loadCachedBulkBatches(userId);
  const visible = () => local.filter(item => !item.deletedAt);
  if (!canUseCloud(userId) || !supabase) return visible();
  const authorization = await voucherAuthorization(userId);
  if (!authorization) return visible();
  for (const item of local.filter((entry) => entry.syncState === 'pending' && !entry.deletedAt)) {
    const synced = await replayOrdinaryDocument('bulk_batches', batchColumns, userId, authorization, item, batchToRemote, batchFromRemote);
    if (synced !== item) await replaceCache(batchKey(userId), synced);
    local = local.map((entry) => entry.id === synced.id ? synced : entry);
  }
  const { data, error } = await supabase
    .from('bulk_batches')
    .select(batchColumns)
    .eq('user_id', userId)
    .order('batch_date', { ascending: false })
    .order('updated_at', { ascending: false })
    .limit(100).setHeader('Authorization', authorization);
  if (error || !Array.isArray(data)) return visible();
  const merged = await reconcileHistory('bulk_batches', batchColumns, userId, authorization, local, data as RemoteBatch[], batchFromRemote);
  await AsyncStorage.setItem(batchKey(userId), JSON.stringify(merged));
  return merged.filter(item => !item.deletedAt);
}

export const saveConsumptionVoucher = (userId: string, draft: ConsumptionVoucherDraft) =>
  withStorageLock(voucherKey(userId), () => saveConsumptionVoucherUnlocked(userId, draft));
export const saveBulkBatch = (userId: string, draft: BulkBatchDraft) =>
  withStorageLock(batchKey(userId), () => saveBulkBatchUnlocked(userId, draft));
export const syncConsumptionVouchers = (userId: string) =>
  withStorageLock(voucherKey(userId), () => syncConsumptionVouchersUnlocked(userId));
export const syncBulkBatches = (userId: string) =>
  withStorageLock(batchKey(userId), () => syncBulkBatchesUnlocked(userId));
