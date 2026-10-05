/**
 * MANAGER 24/7™ by PARADIM — proprietary software.
 * Copyright © 2026 PARADIM Operations SRL. All rights reserved.
 * Concept author and product director: Marius Paul Nemeșu.
 * See LICENSE-PROPRIETARY.md.
 */

import type { PriceUnit, QuantityUnit } from '@/types/recipe';

export type OperationsSyncState = 'local' | 'pending' | 'synced';

export type StockPolicy = {
  id: string;
  catalogId: string;
  locationId: string | null;
  minimumQuantity: number;
  targetQuantity: number;
  storageZone: string;
  updatedAt: string;
  syncState: OperationsSyncState;
};

export type StockPolicyDraft = Omit<StockPolicy, 'id' | 'updatedAt' | 'syncState'> & { id?: string };

export type StockObservation = {
  catalogId: string;
  onHand: number;
};

export type RestockSuggestion = {
  catalogId: string;
  name: string;
  supplier: string;
  unit: PriceUnit;
  onHand: number;
  minimumQuantity: number;
  targetQuantity: number;
  orderQuantity: number;
  unitCost: number;
  estimatedCost: number;
  storageZone: string;
};

export type SupplierOrderLine = Pick<
  RestockSuggestion,
  'catalogId' | 'name' | 'unit' | 'orderQuantity' | 'unitCost' | 'estimatedCost' | 'storageZone'
>;

export type SupplierOrder = {
  id: string;
  locationId: string | null;
  supplier: string;
  orderDate: string;
  status: 'draft' | 'sent' | 'confirmed' | 'received' | 'cancelled';
  lines: SupplierOrderLine[];
  totalEstimated: number;
  notes: string;
  createdAt: string;
  updatedAt: string;
  syncState: OperationsSyncState;
};

export type SupplierOrderDraft = Omit<SupplierOrder, 'id' | 'createdAt' | 'updatedAt' | 'syncState'> & { id?: string };

export type WasteReason = 'expired' | 'preparation' | 'overproduction' | 'quality' | 'plate' | 'other';

export type WasteEntry = {
  id: string;
  locationId: string | null;
  eventDate: string;
  catalogId: string | null;
  itemName: string;
  quantity: number;
  unit: QuantityUnit;
  unitCost: number;
  reason: WasteReason;
  notes: string;
  value: number;
  createdAt: string;
  updatedAt: string;
  syncState: OperationsSyncState;
};

export type WasteEntryDraft = Omit<WasteEntry, 'id' | 'value' | 'createdAt' | 'updatedAt' | 'syncState'> & { id?: string };

export type InventoryFrequency = 'weekly' | 'monthly';

export type InventorySchedule = {
  id: string;
  locationId: string | null;
  frequency: InventoryFrequency;
  weekday: number | null;
  monthDay: number | null;
  enabled: boolean;
  nextDueDate: string;
  updatedAt: string;
  syncState: OperationsSyncState;
};

export type InventoryScheduleDraft = Omit<InventorySchedule, 'id' | 'updatedAt' | 'syncState'> & { id?: string };
