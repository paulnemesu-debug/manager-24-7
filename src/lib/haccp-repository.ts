/**
 * MANAGER 24/7™ by PARADIM — proprietary software.
 * Copyright © 2026 PARADIM Operations SRL. All rights reserved.
 * Concept author and product director: Marius Paul Nemeșu.
 * See LICENSE-PROPRIETARY.md.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

import { withStorageLock } from '@/lib/storage-lock';
import { isDemoMode, isSupabaseConfigured, supabase } from '@/lib/supabase';
import type { HaccpDocument, HaccpSaveResult } from '@/types/haccp';

type RemoteHaccpRow = {
  id: string;
  user_id: string;
  form_code: string;
  location: string | null;
  period_key: string | null;
  payload: Omit<HaccpDocument, 'id' | 'formCode' | 'syncState' | 'deletedAt'>;
  created_at: string;
  updated_at: string;
};

const storageKey = (userId: string) => `professional_foodcost.haccp_documents.v1.${userId}`;

function createUuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (character) => {
    const random = Math.floor(Math.random() * 16);
    const value = character === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

export function createHaccpDocumentId() {
  return createUuid();
}

export function createHaccpRowId() {
  return createUuid();
}

async function writeCache(userId: string, documents: readonly HaccpDocument[]) {
  await AsyncStorage.setItem(storageKey(userId), JSON.stringify(documents));
}

export async function loadCachedHaccpDocuments(userId: string): Promise<HaccpDocument[]> {
  const raw = await AsyncStorage.getItem(storageKey(userId));
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as HaccpDocument[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function getLocation(document: HaccpDocument) {
  return document.headerValues.location
    ?? document.headerValues.cold_room
    ?? '';
}

function getPeriodKey(document: HaccpDocument) {
  const values = document.headerValues;
  if (values.year && values.month) return `${values.year}-${values.month.padStart(2, '0')}`;
  return values.period ?? values.form_date ?? values.date ?? document.updatedAt.slice(0, 10);
}

function toRemote(userId: string, document: HaccpDocument) {
  const { id, formCode, headerValues, rows, createdAt, updatedAt } = document;
  return {
    id,
    user_id: userId,
    form_code: formCode,
    location: getLocation(document),
    period_key: getPeriodKey(document),
    payload: { headerValues, rows, createdAt, updatedAt },
    created_at: createdAt,
    updated_at: updatedAt,
  };
}

function fromRemote(row: RemoteHaccpRow): HaccpDocument {
  return {
    id: row.id,
    formCode: row.form_code,
    headerValues: row.payload?.headerValues ?? {},
    rows: row.payload?.rows ?? [],
    createdAt: row.payload?.createdAt ?? row.created_at,
    updatedAt: row.payload?.updatedAt ?? row.updated_at,
    syncState: 'synced',
    deletedAt: null,
  };
}

function canUseCloud(userId: string) {
  return userId !== 'demo' && !isDemoMode && isSupabaseConfigured && Boolean(supabase);
}

async function replaceCachedDocument(userId: string, document: HaccpDocument) {
  const current = await loadCachedHaccpDocuments(userId);
  const next = [document, ...current.filter((item) => item.id !== document.id)]
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  await writeCache(userId, next);
  return next;
}

async function saveHaccpDocumentsUnlocked(
  userId: string,
  sources: readonly HaccpDocument[],
): Promise<HaccpSaveResult[]> {
  if (!sources.length) return [];
  const now = new Date().toISOString();
  const pending = sources.map<HaccpDocument>((source) => ({
    ...source,
    createdAt: source.createdAt || now,
    updatedAt: now,
    deletedAt: null,
    syncState: canUseCloud(userId) ? 'pending' : 'local',
  }));
  const ids = new Set(pending.map((document) => document.id));
  const current = await loadCachedHaccpDocuments(userId);
  const next = [...pending, ...current.filter((document) => !ids.has(document.id))]
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  await writeCache(userId, next);

  if (!canUseCloud(userId) || !supabase) {
    return pending.map((document) => ({ document, synced: false }));
  }

  const { error } = await supabase
    .from('haccp_documents')
    .upsert(pending.map((document) => toRemote(userId, document)), { onConflict: 'id' });
  if (error) return pending.map((document) => ({ document, synced: false }));

  const synced = pending.map((document) => ({ ...document, syncState: 'synced' as const }));
  const syncedById = new Map(synced.map((document) => [document.id, document]));
  await writeCache(userId, next.map((document) => syncedById.get(document.id) ?? document));
  return synced.map((document) => ({ document, synced: true }));
}

export async function saveHaccpDocument(userId: string, source: HaccpDocument): Promise<HaccpSaveResult> {
  const [result] = await saveHaccpDocuments(userId, [source]);
  return result;
}

async function deleteHaccpDocumentUnlocked(userId: string, source: HaccpDocument) {
  const deletedAt = new Date().toISOString();
  const tombstone: HaccpDocument = {
    ...source,
    updatedAt: deletedAt,
    deletedAt,
    syncState: canUseCloud(userId) ? 'pending' : 'local',
  };
  await replaceCachedDocument(userId, tombstone);

  if (!canUseCloud(userId) || !supabase) {
    const current = await loadCachedHaccpDocuments(userId);
    await writeCache(userId, current.filter((item) => item.id !== source.id));
    return true;
  }

  const { error } = await supabase.from('haccp_documents').delete().eq('id', source.id).eq('user_id', userId);
  if (error) return false;
  const current = await loadCachedHaccpDocuments(userId);
  await writeCache(userId, current.filter((item) => item.id !== source.id));
  return true;
}

async function syncHaccpDocumentsUnlocked(userId: string) {
  const cached = await loadCachedHaccpDocuments(userId);
  if (!canUseCloud(userId) || !supabase) {
    return { documents: cached.filter((item) => !item.deletedAt), pending: 0, error: null as string | null };
  }

  let working = [...cached];
  const pendingUpserts = working.filter((item) => item.syncState === 'pending' && !item.deletedAt);
  if (pendingUpserts.length) {
    const { error } = await supabase
      .from('haccp_documents')
      .upsert(pendingUpserts.map((item) => toRemote(userId, item)), { onConflict: 'id' });
    if (!error) {
      const ids = new Set(pendingUpserts.map((item) => item.id));
      working = working.map((item) => ids.has(item.id) ? { ...item, syncState: 'synced' as const } : item);
    }
  }

  for (const tombstone of working.filter((item) => item.deletedAt)) {
    const { error } = await supabase.from('haccp_documents').delete().eq('id', tombstone.id).eq('user_id', userId);
    if (!error) working = working.filter((item) => item.id !== tombstone.id);
  }

  const { data, error } = await supabase
    .from('haccp_documents')
    .select('id,user_id,form_code,location,period_key,payload,created_at,updated_at')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });

  if (error) {
    await writeCache(userId, working);
    const visible = working.filter((item) => !item.deletedAt);
    return {
      documents: visible,
      pending: visible.filter((item) => item.syncState === 'pending').length,
      error: error.message,
    };
  }

  const localById = new Map(working.map((item) => [item.id, item]));
  const merged = (data as RemoteHaccpRow[]).map((row) => {
    const local = localById.get(row.id);
    if (local?.syncState === 'pending') return local;
    return fromRemote(row);
  });
  for (const local of working) {
    if (!merged.some((item) => item.id === local.id)) merged.push(local);
  }
  merged.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  await writeCache(userId, merged);
  const visible = merged.filter((item) => !item.deletedAt);
  return {
    documents: visible,
    pending: visible.filter((item) => item.syncState === 'pending').length,
    error: null as string | null,
  };
}

export const saveHaccpDocuments = (userId: string, sources: readonly HaccpDocument[]) => withStorageLock(`haccp:${userId}`, () => saveHaccpDocumentsUnlocked(userId, sources));
export const deleteHaccpDocument = (userId: string, source: HaccpDocument) => withStorageLock(`haccp:${userId}`, () => deleteHaccpDocumentUnlocked(userId, source));
export const syncHaccpDocuments = (userId: string) => withStorageLock(`haccp:${userId}`, () => syncHaccpDocumentsUnlocked(userId));
