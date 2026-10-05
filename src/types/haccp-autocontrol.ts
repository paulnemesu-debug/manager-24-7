/**
 * MANAGER 24/7™ by PARADIM — proprietary software.
 * Copyright © 2026 PARADIM Operations SRL. All rights reserved.
 * Concept author and product director: Marius Paul Nemeșu.
 * See LICENSE-PROPRIETARY.md.
 */

import type { HaccpSyncState } from '@/types/haccp';

export type HaccpAutocontrolType = 'food_sample' | 'hygiene_test' | 'water_test';
export type HaccpAutocontrolStatus = 'scheduled' | 'completed' | 'cancelled';
export type HaccpAutocontrolSource = 'manual' | 'import';

export type HaccpAutocontrolDraft = {
  id?: string;
  controlType: HaccpAutocontrolType;
  title: string;
  scheduledAt: string;
  reminderAt: string | null;
  location: string | null;
  responsiblePerson: string | null;
  laboratory: string | null;
  notes: string | null;
  result: string | null;
  status: HaccpAutocontrolStatus;
  source: HaccpAutocontrolSource;
  sourceFileName: string | null;
  completedAt: string | null;
};

export type HaccpAutocontrolEvent = HaccpAutocontrolDraft & {
  id: string;
  createdAt: string;
  updatedAt: string;
  syncState: HaccpSyncState;
  deletedAt?: string | null;
};
