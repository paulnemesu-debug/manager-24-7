import { OperationalError } from '@/lib/operational-sync';
import { withStorageLock } from '@/lib/storage-lock';
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
function merge<T extends { id: string; syncState: string }>(remote: T[], local: T[]) {
  const pending = local.filter((item) => item.syncState !== 'synced');
  const ids = new Set(pending.map((item) => item.id));
  return [...pending, ...remote.filter((item) => !ids.has(item.id))];
}

export function loadWasteCompliance(userId: string): Promise<WasteComplianceData> {
  return withStorageLock(keyFor(userId), () => loadWasteComplianceUnlocked(userId));
}

async function loadWasteComplianceUnlocked(userId: string): Promise<WasteComplianceData> {
  const cached = await read(userId);
  if (!canSync(userId) || !supabase) return cached;
  // Receiver acknowledgements precede transfers, which may reference their IDs.
  for (const item of cached.plans) await syncItem(userId, cached, cached.plans, item, uploadPlan);
  for (const item of cached.receivers) await syncItem(userId, cached, cached.receivers, item, uploadReceiver);
  for (const item of cached.transfers) await syncItem(userId, cached, cached.transfers, item, uploadTransfer);
  const results = await Promise.all([
    supabase.from('waste_prevention_plans').select('*').eq('user_id', userId).order('reporting_year', { ascending: false }),
    supabase.from('waste_receivers').select('*').eq('user_id', userId).order('name'),
    supabase.from('food_redistributions').select('*').eq('user_id', userId).order('transfer_date', { ascending: false }).limit(500),
  ]).catch(() => null);
  if (!results) return cached;
  const [plansResult, receiversResult, transfersResult] = results;
  if (plansResult.error || receiversResult.error || transfersResult.error) return cached;
  const plans: WastePreventionPlan[] = (plansResult.data ?? []).map((r) => ({ id: r.id, locationId: r.location_id, reportingYear: r.reporting_year, companyName: r.company_name, companyTaxId: r.company_tax_id, companyAddress: r.company_address, companyAuthorization: r.company_authorization ?? '', companyPhone: r.company_phone ?? '', companyEmail: r.company_email ?? '', legalRepresentative: r.legal_representative, responsiblePerson: r.responsible_person, measures: r.measures, objectives: r.objectives, status: r.status, submittedAt: r.submitted_at, updatedAt: r.updated_at, syncState: 'synced' }));
  const receivers: WasteReceiver[] = (receiversResult.data ?? []).map((r) => ({ id: r.id, name: r.name, taxId: r.tax_id, county: r.county, authorization: r.authorization_reference, contact: r.contact, contractReference: r.contract_reference, contractDate: r.contract_date, notes: r.notes, active: r.active, updatedAt: r.updated_at, syncState: 'synced' }));
  const transfers: FoodRedistribution[] = (transfersResult.data ?? []).map((r) => ({ id: r.id, locationId: r.location_id, transferDate: r.transfer_date, destinationType: r.destination_type, receiverId: r.receiver_id, productName: r.product_name, productCategory: r.product_category, quantity: Number(r.quantity), unit: r.unit, estimatedValue: Number(r.estimated_value), productOrigin: r.product_origin ?? 'prepared_food', quantityKg: quantityInKg(Number(r.quantity), r.unit, Number(r.quantity_kg ?? 0)), temperatureC: r.temperature_c === null || r.temperature_c === undefined ? null : Number(r.temperature_c), expiryDate: r.expiry_date, consumerCount: r.consumer_count, documentReference: r.document_reference, traceabilityReference: r.traceability_reference ?? '', safetyCheck: r.safety_check ?? 'compliant', correctiveAction: r.corrective_action ?? '', handedOverBy: r.handed_over_by ?? '', receivedBy: r.received_by ?? '', notes: r.notes, createdAt: r.created_at, updatedAt: r.updated_at, syncState: 'synced' }));
  const data = { plans: merge(plans, cached.plans), receivers: merge(receivers, cached.receivers), transfers: merge(transfers, cached.transfers) };
  await write(userId, data); return data;
}

/** Cloud failures leave the durable item pending; local write failures propagate. */
async function upload(table: string, payload: Record<string, unknown>): Promise<boolean> {
  if (!supabase) return false;
  try {
    const { error } = await supabase.from(table).upsert(payload, { onConflict: 'id' });
    return !error;
  } catch { return false; }
}

function uploadPlan(userId: string, item: WastePreventionPlan) {
  return upload('waste_prevention_plans', { id: item.id, user_id: userId, location_id: item.locationId, reporting_year: item.reportingYear, company_name: item.companyName, company_tax_id: item.companyTaxId, company_address: item.companyAddress, company_authorization: item.companyAuthorization, company_phone: item.companyPhone, company_email: item.companyEmail, legal_representative: item.legalRepresentative, responsible_person: item.responsiblePerson, measures: item.measures, objectives: item.objectives, status: item.status, submitted_at: item.submittedAt });
}

function uploadReceiver(userId: string, item: WasteReceiver) {
  return upload('waste_receivers', { id: item.id, user_id: userId, name: item.name, tax_id: item.taxId, county: item.county, authorization_reference: item.authorization, contact: item.contact, contract_reference: item.contractReference, contract_date: item.contractDate, notes: item.notes, active: item.active });
}

function uploadTransfer(userId: string, item: FoodRedistribution) {
  return upload('food_redistributions', { id: item.id, user_id: userId, location_id: item.locationId, transfer_date: item.transferDate, destination_type: item.destinationType, receiver_id: item.receiverId, product_name: item.productName, product_category: item.productCategory, quantity: item.quantity, unit: item.unit, estimated_value: item.estimatedValue, product_origin: item.productOrigin, quantity_kg: item.quantityKg, temperature_c: item.temperatureC, expiry_date: item.expiryDate, consumer_count: item.consumerCount, document_reference: item.documentReference, traceability_reference: item.traceabilityReference, safety_check: item.safetyCheck, corrective_action: item.correctiveAction, handed_over_by: item.handedOverBy, received_by: item.receivedBy, notes: item.notes, created_at: item.createdAt });
}

async function syncItem<T extends { id: string; syncState: 'local' | 'pending' | 'synced' }>(
  userId: string, data: WasteComplianceData, items: T[], item: T,
  uploadItem: (userId: string, item: T) => Promise<boolean>,
): Promise<T> {
  if (!canSync(userId) || item.syncState === 'synced' || !await uploadItem(userId, item)) return item;
  const synced = { ...item, syncState: 'synced' as const };
  items[items.findIndex((entry) => entry.id === item.id)] = synced;
  await write(userId, data);
  return synced;
}

export function saveWastePlan(userId: string, draft: WastePreventionPlanDraft) {
  return withStorageLock(keyFor(userId), () => saveWastePlanUnlocked(userId, draft));
}

async function saveWastePlanUnlocked(userId: string, draft: WastePreventionPlanDraft) {
  const data = await read(userId);
  const item: WastePreventionPlan = { ...draft, id: draft.id ?? uuid(), updatedAt: new Date().toISOString(), syncState: canSync(userId) ? 'pending' : 'local' };
  data.plans = [item, ...data.plans.filter((entry) => entry.id !== item.id)];
  await write(userId, data);
  return syncItem(userId, data, data.plans, item, uploadPlan);
}

export function saveWasteReceiver(userId: string, draft: WasteReceiverDraft) {
  return withStorageLock(keyFor(userId), () => saveWasteReceiverUnlocked(userId, draft));
}

async function saveWasteReceiverUnlocked(userId: string, draft: WasteReceiverDraft) {
  const data = await read(userId);
  const item: WasteReceiver = { ...draft, id: draft.id ?? uuid(), updatedAt: new Date().toISOString(), syncState: canSync(userId) ? 'pending' : 'local' };
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
  const item: FoodRedistribution = { ...draft, quantityKg: quantityInKg(draft.quantity, draft.unit, draft.quantityKg), id: draft.id ?? uuid(), createdAt: existing?.createdAt ?? now, updatedAt: now, syncState: canSync(userId) ? 'pending' : 'local' };
  data.transfers = [item, ...data.transfers.filter((entry) => entry.id !== item.id)];
  await write(userId, data);
  return syncItem(userId, data, data.transfers, item, uploadTransfer);
}
