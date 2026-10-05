import type { QuantityUnit } from '@/types/recipe';

export type SyncState = 'local' | 'pending' | 'synced';
export type WastePlanStatus = 'draft' | 'final' | 'submitted';
export type WasteMeasure = 'staff_training' | 'production_planning' | 'fifo' | 'discount_sale' | 'consumer_redistribution' | 'receiver_donation' | 'animal_feed' | 'compost_biogas';
export type FoodProductOrigin = 'animal' | 'plant' | 'prepared_food';
export type FoodSafetyCheck = 'compliant' | 'blocked';

export type WastePreventionPlan = {
  id: string; locationId: string | null; reportingYear: number; companyName: string; companyTaxId: string;
  companyAddress: string; companyAuthorization: string; companyPhone: string; companyEmail: string;
  legalRepresentative: string; responsiblePerson: string; measures: WasteMeasure[];
  objectives: string; status: WastePlanStatus; submittedAt: string | null; updatedAt: string; syncState: SyncState;
};
export type WastePreventionPlanDraft = Omit<WastePreventionPlan, 'id' | 'updatedAt' | 'syncState'> & { id?: string };

export type WasteReceiver = {
  id: string; name: string; taxId: string; county: string; authorization: string; contact: string;
  contractReference: string; contractDate: string | null; notes: string; active: boolean; updatedAt: string; syncState: SyncState;
};
export type WasteReceiverDraft = Omit<WasteReceiver, 'id' | 'updatedAt' | 'syncState'> & { id?: string };

export type FoodRedistribution = {
  id: string; locationId: string | null; transferDate: string; destinationType: 'consumer' | 'receiver'; receiverId: string | null;
  productName: string; productCategory: string; quantity: number; unit: QuantityUnit; estimatedValue: number;
  productOrigin: FoodProductOrigin; quantityKg: number; temperatureC: number | null;
  expiryDate: string | null; consumerCount: number | null; documentReference: string; traceabilityReference: string;
  safetyCheck: FoodSafetyCheck; correctiveAction: string; handedOverBy: string; receivedBy: string; notes: string;
  createdAt: string; updatedAt: string; syncState: SyncState;
};
export type FoodRedistributionDraft = Omit<FoodRedistribution, 'id' | 'createdAt' | 'updatedAt' | 'syncState'> & { id?: string };

export type WasteComplianceData = { plans: WastePreventionPlan[]; receivers: WasteReceiver[]; transfers: FoodRedistribution[] };
