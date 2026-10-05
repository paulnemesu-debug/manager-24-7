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
  if (!raw) return empty();
  try {
    const data = JSON.parse(raw) as WasteComplianceData;
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
  catch { return empty(); }
}
const write = (userId: string, data: WasteComplianceData) => AsyncStorage.setItem(keyFor(userId), JSON.stringify(data));
function merge<T extends { id: string; syncState: string }>(remote: T[], local: T[]) {
  const pending = local.filter((item) => item.syncState !== 'synced');
  const ids = new Set(pending.map((item) => item.id));
  return [...pending, ...remote.filter((item) => !ids.has(item.id))];
}

export async function loadWasteCompliance(userId: string): Promise<WasteComplianceData> {
  const cached = await read(userId);
  if (!canSync(userId) || !supabase) return cached;
  const [plansResult, receiversResult, transfersResult] = await Promise.all([
    supabase.from('waste_prevention_plans').select('*').eq('user_id', userId).order('reporting_year', { ascending: false }),
    supabase.from('waste_receivers').select('*').eq('user_id', userId).order('name'),
    supabase.from('food_redistributions').select('*').eq('user_id', userId).order('transfer_date', { ascending: false }).limit(500),
  ]);
  if (plansResult.error || receiversResult.error || transfersResult.error) return cached;
  const plans: WastePreventionPlan[] = (plansResult.data ?? []).map((r) => ({ id: r.id, locationId: r.location_id, reportingYear: r.reporting_year, companyName: r.company_name, companyTaxId: r.company_tax_id, companyAddress: r.company_address, companyAuthorization: r.company_authorization ?? '', companyPhone: r.company_phone ?? '', companyEmail: r.company_email ?? '', legalRepresentative: r.legal_representative, responsiblePerson: r.responsible_person, measures: r.measures, objectives: r.objectives, status: r.status, submittedAt: r.submitted_at, updatedAt: r.updated_at, syncState: 'synced' }));
  const receivers: WasteReceiver[] = (receiversResult.data ?? []).map((r) => ({ id: r.id, name: r.name, taxId: r.tax_id, county: r.county, authorization: r.authorization_reference, contact: r.contact, contractReference: r.contract_reference, contractDate: r.contract_date, notes: r.notes, active: r.active, updatedAt: r.updated_at, syncState: 'synced' }));
  const transfers: FoodRedistribution[] = (transfersResult.data ?? []).map((r) => ({ id: r.id, locationId: r.location_id, transferDate: r.transfer_date, destinationType: r.destination_type, receiverId: r.receiver_id, productName: r.product_name, productCategory: r.product_category, quantity: Number(r.quantity), unit: r.unit, estimatedValue: Number(r.estimated_value), productOrigin: r.product_origin ?? 'prepared_food', quantityKg: quantityInKg(Number(r.quantity), r.unit, Number(r.quantity_kg ?? 0)), temperatureC: r.temperature_c === null || r.temperature_c === undefined ? null : Number(r.temperature_c), expiryDate: r.expiry_date, consumerCount: r.consumer_count, documentReference: r.document_reference, traceabilityReference: r.traceability_reference ?? '', safetyCheck: r.safety_check ?? 'compliant', correctiveAction: r.corrective_action ?? '', handedOverBy: r.handed_over_by ?? '', receivedBy: r.received_by ?? '', notes: r.notes, createdAt: r.created_at, updatedAt: r.updated_at, syncState: 'synced' }));
  const data = { plans: merge(plans, cached.plans), receivers: merge(receivers, cached.receivers), transfers: merge(transfers, cached.transfers) };
  await write(userId, data); return data;
}

export async function saveWastePlan(userId: string, draft: WastePreventionPlanDraft) {
  const now = new Date().toISOString();
  let item: WastePreventionPlan = { ...draft, id: draft.id ?? uuid(), updatedAt: now, syncState: canSync(userId) ? 'pending' : 'local' };
  const data = await read(userId); data.plans = [item, ...data.plans.filter((x) => x.id !== item.id)]; await write(userId, data);
  if (!canSync(userId) || !supabase) return item;
  const { error } = await supabase.from('waste_prevention_plans').upsert({ id: item.id, user_id: userId, location_id: item.locationId, reporting_year: item.reportingYear, company_name: item.companyName, company_tax_id: item.companyTaxId, company_address: item.companyAddress, company_authorization: item.companyAuthorization, company_phone: item.companyPhone, company_email: item.companyEmail, legal_representative: item.legalRepresentative, responsible_person: item.responsiblePerson, measures: item.measures, objectives: item.objectives, status: item.status, submitted_at: item.submittedAt }, { onConflict: 'id' });
  if (!error) { item = { ...item, syncState: 'synced' }; data.plans = [item, ...data.plans.filter((x) => x.id !== item.id)]; await write(userId, data); }
  return item;
}

export async function saveWasteReceiver(userId: string, draft: WasteReceiverDraft) {
  const now = new Date().toISOString(); let item: WasteReceiver = { ...draft, id: draft.id ?? uuid(), updatedAt: now, syncState: canSync(userId) ? 'pending' : 'local' };
  const data = await read(userId); data.receivers = [item, ...data.receivers.filter((x) => x.id !== item.id)]; await write(userId, data);
  if (!canSync(userId) || !supabase) return item;
  const { error } = await supabase.from('waste_receivers').upsert({ id: item.id, user_id: userId, name: item.name, tax_id: item.taxId, county: item.county, authorization_reference: item.authorization, contact: item.contact, contract_reference: item.contractReference, contract_date: item.contractDate, notes: item.notes, active: item.active }, { onConflict: 'id' });
  if (!error) { item = { ...item, syncState: 'synced' }; data.receivers = [item, ...data.receivers.filter((x) => x.id !== item.id)]; await write(userId, data); }
  return item;
}

export async function saveRedistribution(userId: string, draft: FoodRedistributionDraft) {
  if (draft.safetyCheck !== 'compliant') throw new Error('Un produs neconform nu poate fi redistribuit. Înregistrează-l în Registrul de risipă.');
  const now = new Date().toISOString(); let item: FoodRedistribution = { ...draft, quantityKg: quantityInKg(draft.quantity, draft.unit, draft.quantityKg), id: draft.id ?? uuid(), createdAt: now, updatedAt: now, syncState: canSync(userId) ? 'pending' : 'local' };
  const data = await read(userId); data.transfers = [item, ...data.transfers.filter((x) => x.id !== item.id)]; await write(userId, data);
  if (!canSync(userId) || !supabase) return item;
  const { error } = await supabase.from('food_redistributions').upsert({ id: item.id, user_id: userId, location_id: item.locationId, transfer_date: item.transferDate, destination_type: item.destinationType, receiver_id: item.receiverId, product_name: item.productName, product_category: item.productCategory, quantity: item.quantity, unit: item.unit, estimated_value: item.estimatedValue, product_origin: item.productOrigin, quantity_kg: item.quantityKg, temperature_c: item.temperatureC, expiry_date: item.expiryDate, consumer_count: item.consumerCount, document_reference: item.documentReference, traceability_reference: item.traceabilityReference, safety_check: item.safetyCheck, corrective_action: item.correctiveAction, handed_over_by: item.handedOverBy, received_by: item.receivedBy, notes: item.notes }, { onConflict: 'id' });
  if (!error) { item = { ...item, syncState: 'synced' }; data.transfers = [item, ...data.transfers.filter((x) => x.id !== item.id)]; await write(userId, data); }
  return item;
}
