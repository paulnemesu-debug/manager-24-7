import { OperationalError } from '@/lib/operational-sync';
import { withStorageLock } from '@/lib/storage-lock';
import { cloudRevisionTime as serverTime } from '@/lib/cloud-revision-time';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { isDemoMode, isSupabaseConfigured, supabase } from '@/lib/supabase';
import { quantityInKg } from '@/lib/waste-compliance-model';
import type { FoodRedistribution, FoodRedistributionDraft, WasteComplianceData, WastePreventionPlan, WastePreventionPlanDraft, WasteReceiver, WasteReceiverDraft } from '@/types/waste-compliance';

const empty = (): WasteComplianceData => ({ plans: [], receivers: [], transfers: [] });
const keyFor = (userId: string) => `manager247.waste-compliance.v1.${userId}`;
const uuid = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => ((c === 'x' ? Math.random() * 16 : (Math.random() * 4 + 8)) | 0).toString(16));
const canSync = (userId: string) => userId !== 'demo' && !isDemoMode && isSupabaseConfigured && Boolean(supabase);

async function read(userId: string): Promise<WasteComplianceData> {
  const raw = await AsyncStorage.getItem(keyFor(userId));
  if (raw === null) return empty();
  try {
    const data = JSON.parse(raw) as WasteComplianceData;
    if (!data || typeof data !== 'object' || ![data.plans, data.receivers, data.transfers].every((items) =>
      Array.isArray(items) && items.every((item) => item && typeof item === 'object' && typeof item.id === 'string' &&
        item.id.length > 0 && ['local', 'pending', 'synced'].includes(item.syncState)))) {
      throw new Error('Invalid waste compliance cache');
    }
    return {
      plans: (data.plans ?? []).map((item) => ({
        ...item,
        companyAuthorization: item.companyAuthorization ?? '',
        companyPhone: item.companyPhone ?? '',
        companyEmail: item.companyEmail ?? '',
      })),
      receivers: data.receivers ?? [],
      transfers: (data.transfers ?? []).map((item) => ({
        ...item,
        productOrigin: item.productOrigin ?? 'prepared_food',
        quantityKg: quantityInKg(item.quantity, item.unit, item.quantityKg ?? 0),
        temperatureC: item.temperatureC ?? null,
        traceabilityReference: item.traceabilityReference ?? '',
        safetyCheck: item.safetyCheck ?? 'compliant',
        correctiveAction: item.correctiveAction ?? '',
        handedOverBy: item.handedOverBy ?? '',
        receivedBy: item.receivedBy ?? '',
      })),
    };
  }
  catch { throw new Error('Waste compliance cache could not be read. Saved data has not been changed.'); }
}
const write = (userId: string, data: WasteComplianceData) => AsyncStorage.setItem(keyFor(userId), JSON.stringify(data));
type CachedRecord = { id: string; updatedAt: string; syncState: string; baseServerUpdatedAt?: string | null };
const replayBase = (previous?: CachedRecord) => previous
  ? previous.syncState === 'synced' ? previous.updatedAt : previous.baseServerUpdatedAt
  : null;
async function wasteAuthorization(userId: string): Promise<string | null> {
  try {
    const { data, error } = await supabase!.auth.getSession();
    return !error && data.session?.user.id === userId && data.session.access_token
      ? `Bearer ${data.session.access_token}` : null;
  } catch { return null; }
}

async function verifyListedRows<T extends { id: string; updated_at: string }>(userId: string, table: string, listed: T[], cached: CachedRecord[], authorization: string) {
  const rows = new Map(listed.map(row => [row.id, row]));
  const missing = new Set<string>();
  const ids = cached.filter(item => {
    const remote = rows.get(item.id);
    return item.syncState === 'synced' && (!remote
      || (serverTime(remote.updated_at) ?? -1n) < (serverTime(item.updatedAt) ?? -1n));
  }).map(item => item.id);
  for (let offset = 0; offset < ids.length; offset += 100) {
    const batch = ids.slice(offset, offset + 100);
    try {
      const { data, error } = await supabase!.from(table).select('*').eq('user_id', userId)
        .in('id', batch).setHeader('Authorization', authorization);
      const returned: unknown = data;
      if (error || !Array.isArray(returned) || !returned.every(row => row && typeof row.id === 'string' && serverTime(row.updated_at) !== null)) continue;
      const verified = new Map((returned as T[]).map(row => [row.id, row]));
      for (const id of batch) {
        const row = verified.get(id);
        if (row) rows.set(id, row);
        else { rows.delete(id); missing.add(id); }
      }
    } catch { /* A failed lookup cannot prove an acknowledged record was deleted. */ }
  }
  return { rows: [...rows.values()], missing };
}

function merge<T extends CachedRecord>(remote: T[], local: T[], missing: ReadonlySet<string>) {
  const merged = new Map(remote.map(item => [item.id, item]));
  for (const item of local) {
    if (missing.has(item.id)) continue;
    const cloud = merged.get(item.id);
    if (!cloud || item.syncState !== 'synced'
      || (serverTime(item.updatedAt) ?? -1n) > (serverTime(cloud.updatedAt) ?? -1n)) merged.set(item.id, item);
  }
  return [...merged.values()];
}

export function loadWasteCompliance(userId: string): Promise<WasteComplianceData> {
  return withStorageLock(keyFor(userId), () => loadWasteComplianceUnlocked(userId));
}

async function loadWasteComplianceUnlocked(userId: string): Promise<WasteComplianceData> {
  const cached = await read(userId);
  if (!canSync(userId) || !supabase) return cached;
  const authorization = await wasteAuthorization(userId);
  if (!authorization) return cached;
  // Receiver acknowledgements precede transfers, which may reference their IDs.
  for (const item of cached.plans) await syncItem(userId, cached, cached.plans, item, uploadPlan, authorization, true);
  for (const item of cached.receivers) await syncItem(userId, cached, cached.receivers, item, uploadReceiver, authorization, true);
  for (const item of cached.transfers) await syncItem(userId, cached, cached.transfers, item, uploadTransfer, authorization, true);
  const results = await Promise.all([
    supabase.from('waste_prevention_plans').select('*').eq('user_id', userId).order('reporting_year', { ascending: false }).setHeader('Authorization', authorization),
    supabase.from('waste_receivers').select('*').eq('user_id', userId).order('name').setHeader('Authorization', authorization),
    supabase.from('food_redistributions').select('*').eq('user_id', userId).order('transfer_date', { ascending: false }).limit(500).setHeader('Authorization', authorization),
  ]).catch(() => null);
  if (!results) return cached;
  const [plansResult, receiversResult, transfersResult] = results;
  if (plansResult.error || receiversResult.error || transfersResult.error) return cached;
  const [verifiedPlans, verifiedReceivers, verifiedTransfers] = await Promise.all([
    verifyListedRows(userId, 'waste_prevention_plans', plansResult.data ?? [], cached.plans, authorization),
    verifyListedRows(userId, 'waste_receivers', receiversResult.data ?? [], cached.receivers, authorization),
    verifyListedRows(userId, 'food_redistributions', transfersResult.data ?? [], cached.transfers, authorization),
  ]);
  plansResult.data = verifiedPlans.rows;
  receiversResult.data = verifiedReceivers.rows;
  transfersResult.data = verifiedTransfers.rows;
  const plans: WastePreventionPlan[] = (plansResult.data ?? []).map((r) => ({ id: r.id, locationId: r.location_id, reportingYear: r.reporting_year, companyName: r.company_name, companyTaxId: r.company_tax_id, companyAddress: r.company_address, companyAuthorization: r.company_authorization ?? '', companyPhone: r.company_phone ?? '', companyEmail: r.company_email ?? '', legalRepresentative: r.legal_representative, responsiblePerson: r.responsible_person, measures: r.measures, objectives: r.objectives, status: r.status, submittedAt: r.submitted_at, updatedAt: r.updated_at, syncState: 'synced' }));
  const receivers: WasteReceiver[] = (receiversResult.data ?? []).map((r) => ({ id: r.id, name: r.name, taxId: r.tax_id, county: r.county, authorization: r.authorization_reference, contact: r.contact, contractReference: r.contract_reference, contractDate: r.contract_date, notes: r.notes, active: r.active, updatedAt: r.updated_at, syncState: 'synced' }));
  const transfers: FoodRedistribution[] = (transfersResult.data ?? []).map((r) => ({ id: r.id, locationId: r.location_id, transferDate: r.transfer_date, destinationType: r.destination_type, receiverId: r.receiver_id, productName: r.product_name, productCategory: r.product_category, quantity: Number(r.quantity), unit: r.unit, estimatedValue: Number(r.estimated_value), productOrigin: r.product_origin ?? 'prepared_food', quantityKg: quantityInKg(Number(r.quantity), r.unit, Number(r.quantity_kg ?? 0)), temperatureC: r.temperature_c === null || r.temperature_c === undefined ? null : Number(r.temperature_c), expiryDate: r.expiry_date, consumerCount: r.consumer_count, documentReference: r.document_reference, traceabilityReference: r.traceability_reference ?? '', safetyCheck: r.safety_check ?? 'compliant', correctiveAction: r.corrective_action ?? '', handedOverBy: r.handed_over_by ?? '', receivedBy: r.received_by ?? '', notes: r.notes, createdAt: r.created_at, updatedAt: r.updated_at, syncState: 'synced' }));
  const data = { plans: merge(plans, cached.plans, verifiedPlans.missing), receivers: merge(receivers, cached.receivers, verifiedReceivers.missing), transfers: merge(transfers, cached.transfers, verifiedTransfers.missing) };
  await write(userId, data); return data;
}

/** Cloud failures leave the durable item pending; local write failures propagate. */
function canonicalPayload(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalPayload);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value)
    .filter(([, entry]) => entry !== undefined).sort(([a], [b]) => a.localeCompare(b))
    .map(([key, entry]) => [key, canonicalPayload(entry)]));
  return value;
}

function samePayload(payload: Record<string, unknown>, row: Record<string, unknown>) {
  return Object.entries(payload).filter(([, value]) => value !== undefined).every(([key, value]) =>
    key.endsWith('_at') && serverTime(value) !== null
      ? serverTime(value) === serverTime(row[key])
      : JSON.stringify(canonicalPayload(value)) === JSON.stringify(canonicalPayload(row[key])));
}

async function upload(table: string, payload: Record<string, unknown>, baseServerUpdatedAt: string | null | undefined, capturedAuthorization?: string, replay = false): Promise<string | null> {
  if (!supabase) return null;
  const authorization = capturedAuthorization ?? await wasteAuthorization(String(payload.user_id));
  if (!authorization) return null;
  try {
    let query;
    if (replay) {
      const { data, error } = await supabase.from(table).select('*')
        .eq('user_id', payload.user_id).eq('id', payload.id).setHeader('Authorization', authorization);
      if (error || !Array.isArray(data) || data.length > 1) return null;
      const row = data[0];
      if (!row) {
        if (baseServerUpdatedAt !== null) return null;
        query = supabase.from(table).insert(payload);
      } else {
        if (row.id !== payload.id || row.user_id !== payload.user_id || serverTime(row.updated_at) === null) return null;
        if (samePayload(payload, row)) return row.updated_at;
        if (serverTime(baseServerUpdatedAt) === null || serverTime(baseServerUpdatedAt) !== serverTime(row.updated_at)) return null;
        query = supabase.from(table).update(payload).eq('user_id', payload.user_id)
          .eq('id', payload.id).eq('updated_at', row.updated_at);
      }
    } else {
      query = supabase.from(table).upsert(payload, { onConflict: 'id' });
    }
    const { data, error } = await query.select('updated_at').single().setHeader('Authorization', authorization);
    const updatedAt: unknown = data?.updated_at;
    return !error && typeof updatedAt === 'string' && serverTime(updatedAt) !== null ? updatedAt : null;
  } catch { return null; }
}

function uploadPlan(userId: string, item: WastePreventionPlan, authorization?: string, replay?: boolean) {
  return upload('waste_prevention_plans', { id: item.id, user_id: userId, location_id: item.locationId, reporting_year: item.reportingYear, company_name: item.companyName, company_tax_id: item.companyTaxId, company_address: item.companyAddress, company_authorization: item.companyAuthorization, company_phone: item.companyPhone, company_email: item.companyEmail, legal_representative: item.legalRepresentative, responsible_person: item.responsiblePerson, measures: item.measures, objectives: item.objectives, status: item.status, submitted_at: item.submittedAt }, item.baseServerUpdatedAt, authorization, replay);
}

function uploadReceiver(userId: string, item: WasteReceiver, authorization?: string, replay?: boolean) {
  return upload('waste_receivers', { id: item.id, user_id: userId, name: item.name, tax_id: item.taxId, county: item.county, authorization_reference: item.authorization, contact: item.contact, contract_reference: item.contractReference, contract_date: item.contractDate, notes: item.notes, active: item.active }, item.baseServerUpdatedAt, authorization, replay);
}

function uploadTransfer(userId: string, item: FoodRedistribution, authorization?: string, replay?: boolean) {
  return upload('food_redistributions', { id: item.id, user_id: userId, location_id: item.locationId, transfer_date: item.transferDate, destination_type: item.destinationType, receiver_id: item.receiverId, product_name: item.productName, product_category: item.productCategory, quantity: item.quantity, unit: item.unit, estimated_value: item.estimatedValue, product_origin: item.productOrigin, quantity_kg: item.quantityKg, temperature_c: item.temperatureC, expiry_date: item.expiryDate, consumer_count: item.consumerCount, document_reference: item.documentReference, traceability_reference: item.traceabilityReference, safety_check: item.safetyCheck, corrective_action: item.correctiveAction, handed_over_by: item.handedOverBy, received_by: item.receivedBy, notes: item.notes, created_at: item.createdAt }, item.baseServerUpdatedAt, authorization, replay);
}

async function syncItem<T extends { id: string; updatedAt: string; syncState: 'local' | 'pending' | 'synced' }>(
  userId: string, data: WasteComplianceData, items: T[], item: T,
  uploadItem: (userId: string, item: T, authorization?: string, replay?: boolean) => Promise<string | null>, authorization?: string, replay = false,
): Promise<T> {
  if (!canSync(userId) || item.syncState === 'synced') return item;
  const acknowledged = await uploadItem(userId, item, authorization, replay);
  if (!acknowledged) return item;
  const synced = { ...item, updatedAt: acknowledged, syncState: 'synced' as const };
  items[items.findIndex((entry) => entry.id === item.id)] = synced;
  await write(userId, data);
  return synced;
}

export function saveWastePlan(userId: string, draft: WastePreventionPlanDraft) {
  return withStorageLock(keyFor(userId), () => saveWastePlanUnlocked(userId, draft));
}

async function saveWastePlanUnlocked(userId: string, draft: WastePreventionPlanDraft) {
  const data = await read(userId);
  const item: WastePreventionPlan = { ...draft, id: draft.id ?? uuid(), baseServerUpdatedAt: replayBase(data.plans.find(entry => entry.id === draft.id)), updatedAt: new Date().toISOString(), syncState: canSync(userId) ? 'pending' : 'local' };
  data.plans = [item, ...data.plans.filter((entry) => entry.id !== item.id)];
  await write(userId, data);
  return syncItem(userId, data, data.plans, item, uploadPlan);
}

export function saveWasteReceiver(userId: string, draft: WasteReceiverDraft) {
  return withStorageLock(keyFor(userId), () => saveWasteReceiverUnlocked(userId, draft));
}

async function saveWasteReceiverUnlocked(userId: string, draft: WasteReceiverDraft) {
  const data = await read(userId);
  const item: WasteReceiver = { ...draft, id: draft.id ?? uuid(), baseServerUpdatedAt: replayBase(data.receivers.find(entry => entry.id === draft.id)), updatedAt: new Date().toISOString(), syncState: canSync(userId) ? 'pending' : 'local' };
  data.receivers = [item, ...data.receivers.filter((entry) => entry.id !== item.id)];
  await write(userId, data);
  return syncItem(userId, data, data.receivers, item, uploadReceiver);
}

export function saveRedistribution(userId: string, draft: FoodRedistributionDraft) {
  return withStorageLock(keyFor(userId), () => saveRedistributionUnlocked(userId, draft));
}

async function saveRedistributionUnlocked(userId: string, draft: FoodRedistributionDraft) {
  if (draft.safetyCheck !== 'compliant') throw new OperationalError('waste.blockedValidation');
  const data = await read(userId);
  const now = new Date().toISOString();
  const existing = data.transfers.find((entry) => entry.id === draft.id);
  const item: FoodRedistribution = { ...draft, quantityKg: quantityInKg(draft.quantity, draft.unit, draft.quantityKg), id: draft.id ?? uuid(), baseServerUpdatedAt: replayBase(existing), createdAt: existing?.createdAt ?? now, updatedAt: now, syncState: canSync(userId) ? 'pending' : 'local' };
  data.transfers = [item, ...data.transfers.filter((entry) => entry.id !== item.id)];
  await write(userId, data);
  return syncItem(userId, data, data.transfers, item, uploadTransfer);
}
