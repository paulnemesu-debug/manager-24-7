/**
 * MANAGER 24/7™ by PARADIM — proprietary software.
 * Copyright © 2026 PARADIM Operations SRL. All rights reserved.
 * Concept author and product director: Marius Paul Nemeșu.
 * See LICENSE-PROPRIETARY.md.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { withStorageLock } from '@/lib/storage-lock';
import { OperationalError } from '@/lib/operational-sync';

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
  };
  if (existing?.deletedAt) throw new ProductionVoucherDeletedError();
  await replaceCache(voucherKey(userId), pending);
  if (!canUseCloud(userId) || !supabase) return pending;
  const { error } = await supabase.from('consumption_vouchers').upsert({
    id: pending.id,
    user_id: userId,
    document_date: pending.documentDate,
    reference: pending.reference,
    source: pending.source,
    source_reference: pending.sourceReference,
    notes: pending.notes || null,
    lines: pending.lines,
    total_cost: pending.totalCost,
    created_at: pending.createdAt,
    updated_at: pending.updatedAt,
  }, { onConflict: 'id' });
  if (error) return pending;
  const synced = { ...pending, syncState: 'synced' as const };
  await replaceCache(voucherKey(userId), synced);
  return synced;
}

/** A deleted production voucher is a durable outcome, never an invitation to recreate it. */
export class ProductionVoucherDeletedError extends Error {
  constructor() { super('Bonul de consum a fost șters. Nu poate fi recreat automat. / The consumption voucher was deleted and cannot be recreated automatically.'); }
}

async function voucherAuthorization(userId: string): Promise<string | null> {
  if (!canUseCloud(userId) || !supabase) return null;
  const { data, error } = await supabase.auth.getSession();
  const session = data.session;
  return !error && session?.user.id === userId && session.access_token ? `Bearer ${session.access_token}` : null;
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

async function saveBulkBatchUnlocked(userId: string, draft: BulkBatchDraft): Promise<BulkBatch> {
  const now = new Date().toISOString();
  const cached = await loadCachedBulkBatches(userId);
  const existing = cached.find((item) => item.id === draft.id);
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
  };
  await replaceCache(batchKey(userId), pending);
  if (!canUseCloud(userId) || !supabase) return pending;
  const { error } = await supabase.from('bulk_batches').upsert({
    id: pending.id,
    user_id: userId,
    recipe_id: pending.recipeId,
    batch_date: pending.batchDate,
    title: pending.title,
    source: pending.source,
    source_reference: pending.sourceReference,
    lines: pending.lines,
    final_weight_grams: pending.finalWeightGrams,
    portions: pending.portions,
    sale_price_gross: pending.salePriceGross,
    vat_percent: pending.vatPercent,
    total_cost: pending.totalCost,
    portion_cost: pending.portionCost,
    cost_per_kg: pending.costPerKg,
    food_cost_percent: pending.foodCostPercent,
    notes: pending.notes || null,
    created_at: pending.createdAt,
    updated_at: pending.updatedAt,
  }, { onConflict: 'id' });
  if (error) return pending;
  const synced = { ...pending, syncState: 'synced' as const };
  await replaceCache(batchKey(userId), synced);
  return synced;
}

async function syncConsumptionVouchersUnlocked(userId: string): Promise<ConsumptionVoucher[]> {
  let local = await loadCachedConsumptionVouchers(userId);
  const visible = () => local.filter(item=>!item.deletedAt);
  if (!canUseCloud(userId) || !supabase) return visible();
  for (const item of local.filter(entry=>entry.syncState==='pending' && !entry.deletedAt)) {
    if (item.createOnly) {
      try { await replayCreateOnlyVoucher(userId,item); }
      catch(error) { if(!(error instanceof ProductionVoucherDeletedError)) throw error; }
      local=await loadCachedConsumptionVouchers(userId);
    } else {
      const synced = await saveConsumptionVoucherUnlocked(userId, {
        id:item.id, documentDate:item.documentDate, reference:item.reference, source:item.source,
        sourceReference:item.sourceReference, notes:item.notes, lines:item.lines,
      });
      local=local.map(entry=>entry.id===synced.id?synced:entry);
    }
  }
  const authorization=await voucherAuthorization(userId);
  if(!authorization)return visible();
  const {data,error}=await supabase.from('consumption_vouchers')
    .select('id,document_date,reference,source,source_reference,notes,lines,total_cost,created_at,updated_at')
    .eq('user_id',userId).order('document_date',{ascending:false}).order('updated_at',{ascending:false}).limit(100)
    .setHeader('Authorization',authorization);
  if(error)return visible();
  const remote=(data as RemoteVoucher[]).map(voucherFromRemote);
  const pending=local.filter(item=>item.syncState==='pending'&&!item.deletedAt);
  // Keep production creation/deletion receipts even outside the latest-100 list.
  const receipts=local.filter(item=>item.createOnly && item.syncState!=='pending' && !remote.some(row=>row.id===item.id));
  const merged=[...pending,...remote.filter(item=>!pending.some(entry=>entry.id===item.id)).map(item=>({...item,createOnly:local.some(entry=>entry.id===item.id&&entry.createOnly)||undefined})),...receipts];
  await AsyncStorage.setItem(voucherKey(userId),JSON.stringify(merged));
  return merged.filter(item=>!item.deletedAt);
}

async function syncBulkBatchesUnlocked(userId: string): Promise<BulkBatch[]> {
  let local = await loadCachedBulkBatches(userId);
  if (!canUseCloud(userId) || !supabase) return local;
  for (const item of local.filter((entry) => entry.syncState === 'pending')) {
    const synced = await saveBulkBatchUnlocked(userId, {
      id: item.id,
      recipeId: item.recipeId,
      batchDate: item.batchDate,
      title: item.title,
      source: item.source,
      sourceReference: item.sourceReference,
      lines: item.lines,
      finalWeightGrams: item.finalWeightGrams,
      portions: item.portions,
      salePriceGross: item.salePriceGross,
      vatPercent: item.vatPercent,
      notes: item.notes,
    });
    local = local.map((entry) => entry.id === synced.id ? synced : entry);
  }
  const { data, error } = await supabase
    .from('bulk_batches')
    .select('id,recipe_id,batch_date,title,source,source_reference,lines,final_weight_grams,portions,sale_price_gross,vat_percent,total_cost,portion_cost,cost_per_kg,food_cost_percent,notes,created_at,updated_at')
    .eq('user_id', userId)
    .order('batch_date', { ascending: false })
    .order('updated_at', { ascending: false })
    .limit(100);
  if (error) return local;
  const remote = (data as RemoteBatch[]).map(batchFromRemote);
  const pending = local.filter((item) => item.syncState === 'pending');
  const merged = [...pending, ...remote.filter((item) => !pending.some((entry) => entry.id === item.id))];
  await AsyncStorage.setItem(batchKey(userId), JSON.stringify(merged));
  return merged;
}

export const saveConsumptionVoucher = (userId: string, draft: ConsumptionVoucherDraft) =>
  withStorageLock(voucherKey(userId), () => saveConsumptionVoucherUnlocked(userId, draft));
export const saveBulkBatch = (userId: string, draft: BulkBatchDraft) =>
  withStorageLock(batchKey(userId), () => saveBulkBatchUnlocked(userId, draft));
export const syncConsumptionVouchers = (userId: string) =>
  withStorageLock(voucherKey(userId), () => syncConsumptionVouchersUnlocked(userId));
export const syncBulkBatches = (userId: string) =>
  withStorageLock(batchKey(userId), () => syncBulkBatchesUnlocked(userId));
