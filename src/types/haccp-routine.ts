/**
 * MANAGER 24/7™ by PARADIM — proprietary software.
 * Copyright © 2026 PARADIM Operations SRL. All rights reserved.
 * Concept author and product director: Marius Paul Nemeșu.
 * See LICENSE-PROPRIETARY.md.
 */

export type HaccpEquipmentKind = 'cold' | 'frozen' | 'hot' | 'other';

export type HaccpEquipment = {
  id: string;
  locationId: string | null;
  name: string;
  kind: HaccpEquipmentKind;
  criticalMin: number | null;
  criticalMax: number | null;
  requiredReadings: number;
  readingTimes: string[];
  active: boolean;
  sortOrder: number;
  updatedAt: string;
  syncState: 'local' | 'pending' | 'synced';
};

export type HaccpEquipmentDraft = Omit<HaccpEquipment, 'id' | 'updatedAt' | 'syncState'> & { id?: string };

export type HaccpRoutineProfile = {
  defaultLocationId: string | null;
  defaultLocationName: string;
  responsibleName: string;
  shiftStartTime: string;
  updatedAt: string;
  syncState: 'local' | 'pending' | 'synced';
};

export type HaccpTodayTask = {
  key: string;
  title: string;
  subtitle: string;
  formCode: string;
  kind: 'hygiene' | 'cleaning' | 'temperature' | 'reception';
  equipment?: HaccpEquipment;
  completedSteps: number;
  totalSteps: number;
  status: 'pending' | 'conform' | 'nonconform';
  required: boolean;
};
