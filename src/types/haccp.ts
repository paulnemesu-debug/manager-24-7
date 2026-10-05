/**
 * MANAGER 24/7™ by PARADIM — proprietary software.
 * Copyright © 2026 PARADIM Operations SRL. All rights reserved.
 * Concept author and product director: Marius Paul Nemeșu.
 * See LICENSE-PROPRIETARY.md.
 */

export type HaccpValues = Record<string, string>;

export type HaccpDocumentRow = {
  id: string;
  values: HaccpValues;
  createdAt: string;
  updatedAt: string;
};

export type HaccpSyncState = 'local' | 'pending' | 'synced';

export type HaccpDocument = {
  id: string;
  formCode: string;
  headerValues: HaccpValues;
  rows: HaccpDocumentRow[];
  createdAt: string;
  updatedAt: string;
  syncState: HaccpSyncState;
  deletedAt?: string | null;
};

export type HaccpSaveResult = {
  document: HaccpDocument;
  synced: boolean;
};
