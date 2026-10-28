/**
 * MANAGER 24/7™ by PARADIM — proprietary software.
 * Copyright © 2026 PARADIM Operations SRL. All rights reserved.
 * Concept author and product director: Marius Paul Nemeșu.
 * See LICENSE-PROPRIETARY.md.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

import { isDemoMode, isSupabaseConfigured, supabase } from '@/lib/supabase';
import type { HaccpAutocontrolDraft, HaccpAutocontrolEvent } from '@/types/haccp-autocontrol';

type RemoteRow = {
  id: string;
  control_type: HaccpAutocontrolEvent['controlType'];
  title: string;
  scheduled_at: string;
  reminder_at: string | null;
  location: string | null;
  responsible_person: string | null;
  laboratory: string | null;
  notes: string | null;
  result: string | null;
  status: HaccpAutocontrolEvent['status'];
  source: HaccpAutocontrolEvent['source'];
  source_file_name: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

const storageKey = (userId: string) => `manager247.haccp_autocontrol.v1.${userId}`;

function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (character) => {
    const random = Math.floor(Math.random() * 16);
    const value = character === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

function canUseCloud(userId: string) {
  return userId !== 'demo' && !isDemoMode && isSupabaseConfigured && Boolean(supabase);
}

async function write(userId: string, events: readonly HaccpAutocontrolEvent[]) {
  await AsyncStorage.setItem(storageKey(userId), JSON.stringify(events));
}

async function readStoredHaccpAutocontrol(userId: string): Promise<HaccpAutocontrolEvent[]> {
  const raw = await AsyncStorage.getItem(storageKey(userId));
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as HaccpAutocontrolEvent[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function loadCachedHaccpAutocontrol(userId: string): Promise<HaccpAutocontrolEvent[]> {
  return (await readStoredHaccpAutocontrol(userId)).filter((event) => !event.deletedAt);
}

function toRemote(userId: string, event: HaccpAutocontrolEvent) {
  return {
    id: event.id,
    user_id: userId,
    control_type: event.controlType,
    title: event.title.trim(),
    scheduled_at: event.scheduledAt,
    reminder_at: event.reminderAt,
    location: event.location?.trim() || null,
    responsible_person: event.responsiblePerson?.trim() || null,
    laboratory: event.laboratory?.trim() || null,
    notes: event.notes?.trim() || null,
    result: event.result?.trim() || null,
    status: event.status,
    source: event.source,
    source_file_name: event.sourceFileName,
    completed_at: event.completedAt,
    created_at: event.createdAt,
    updated_at: event.updatedAt,
  };
}

function fromRemote(row: RemoteRow): HaccpAutocontrolEvent {
  return {
    id: row.id,
    controlType: row.control_type,
    title: row.title,
    scheduledAt: row.scheduled_at,
    reminderAt: row.reminder_at,
    location: row.location,
    responsiblePerson: row.responsible_person,
    laboratory: row.laboratory,
    notes: row.notes,
    result: row.result,
    status: row.status,
    source: row.source,
    sourceFileName: row.source_file_name,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    syncState: 'synced',
    deletedAt: null,
  };
}

function eventFromDraft(draft: HaccpAutocontrolDraft, cloud: boolean): HaccpAutocontrolEvent {
  const now = new Date().toISOString();
  return {
    ...draft,
    id: draft.id ?? uuid(),
    title: draft.title.trim(),
    createdAt: now,
    updatedAt: now,
    syncState: cloud ? 'pending' : 'local',
    deletedAt: null,
  };
}

export async function saveHaccpAutocontrolEvents(
  userId: string,
  drafts: readonly HaccpAutocontrolDraft[],
): Promise<HaccpAutocontrolEvent[]> {
  if (!drafts.length) return [];
  const current = await readStoredHaccpAutocontrol(userId);
  const currentById = new Map(current.map((event) => [event.id, event]));
  const cloud = canUseCloud(userId);
  const pending = drafts.map((draft) => {
    const previous = draft.id ? currentById.get(draft.id) : null;
    const event = eventFromDraft(draft, cloud);
    return previous ? { ...event, createdAt: previous.createdAt } : event;
  });
  const pendingIds = new Set(pending.map((event) => event.id));
  const next = [...pending, ...current.filter((event) => !pendingIds.has(event.id))]
    .sort((left, right) => left.scheduledAt.localeCompare(right.scheduledAt));
  await write(userId, next);

  if (!cloud || !supabase) return pending;
  const { error } = await supabase
    .from('haccp_autocontrol_events')
    .upsert(pending.map((event) => toRemote(userId, event)), { onConflict: 'id' });
  if (error) return pending;

  const synced = pending.map((event) => ({ ...event, syncState: 'synced' as const }));
  const syncedById = new Map(synced.map((event) => [event.id, event]));
  await write(userId, next.map((event) => syncedById.get(event.id) ?? event));
  return synced;
}

export async function saveHaccpAutocontrolEvent(userId: string, draft: HaccpAutocontrolDraft) {
  return (await saveHaccpAutocontrolEvents(userId, [draft]))[0]!;
}

export async function deleteHaccpAutocontrolEvent(userId: string, event: HaccpAutocontrolEvent) {
  const current = await readStoredHaccpAutocontrol(userId);
  const remaining = current.filter((item) => item.id !== event.id);
  if (!canUseCloud(userId) || !supabase) {
    await write(userId, remaining);
    return true;
  }
  const tombstone: HaccpAutocontrolEvent = {
    ...event,
    deletedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    syncState: 'pending',
  };
  await write(userId, [tombstone, ...remaining]);
  const { error } = await supabase
    .from('haccp_autocontrol_events')
    .delete()
    .eq('id', event.id)
    .eq('user_id', userId);
  if (!error) await write(userId, remaining);
  // Ștergerea este imediată local; dacă serverul nu răspunde, tombstone-ul
  // rămâne în coada offline și va fi procesat la următoarea sincronizare.
  return true;
}

export async function syncHaccpAutocontrol(userId: string) {
  const cached = await readStoredHaccpAutocontrol(userId);
  if (!canUseCloud(userId) || !supabase) {
    return {
      events: cached.filter((event) => !event.deletedAt),
      pending: cached.filter((event) => event.syncState === 'pending').length,
      error: null as string | null,
    };
  }

  let working = [...cached];
  let syncError: string | null = null;
  const pendingDeletes = working.filter((event) => event.syncState === 'pending' && event.deletedAt);
  if (pendingDeletes.length) {
    const ids = pendingDeletes.map((event) => event.id);
    const { error } = await supabase
      .from('haccp_autocontrol_events')
      .delete()
      .eq('user_id', userId)
      .in('id', ids);
    if (error) syncError = error.message;
    else {
      const deletedIds = new Set(ids);
      working = working.filter((event) => !deletedIds.has(event.id));
    }
  }

  const pending = working.filter((event) => event.syncState === 'pending' && !event.deletedAt);
  if (pending.length) {
    const { error } = await supabase
      .from('haccp_autocontrol_events')
      .upsert(pending.map((event) => toRemote(userId, event)), { onConflict: 'id' });
    if (!error) {
      const ids = new Set(pending.map((event) => event.id));
      working = working.map((event) => ids.has(event.id) ? { ...event, syncState: 'synced' as const } : event);
    } else syncError = syncError ?? error.message;
  }

  const { data, error } = await supabase
    .from('haccp_autocontrol_events')
    .select('id,control_type,title,scheduled_at,reminder_at,location,responsible_person,laboratory,notes,result,status,source,source_file_name,completed_at,created_at,updated_at')
    .eq('user_id', userId)
    .order('scheduled_at', { ascending: true });
  if (error) {
    await write(userId, working);
    return {
      events: working.filter((event) => !event.deletedAt),
      pending: working.filter((event) => event.syncState === 'pending').length,
      error: syncError ?? error.message,
    };
  }

  const localById = new Map(working.map((event) => [event.id, event]));
  const tombstones = new Set(working.filter((event) => event.deletedAt).map((event) => event.id));
  const merged = (data as RemoteRow[]).filter((row) => !tombstones.has(row.id)).map((row) => {
    const local = localById.get(row.id);
    return local?.syncState === 'pending' ? local : fromRemote(row);
  });
  for (const local of working) {
    if (!local.deletedAt && !merged.some((event) => event.id === local.id)) merged.push(local);
  }
  merged.sort((left, right) => left.scheduledAt.localeCompare(right.scheduledAt));
  await write(userId, [...merged, ...working.filter((event) => event.deletedAt)]);
  return {
    events: merged,
    pending: working.filter((event) => event.syncState === 'pending').length,
    error: syncError,
  };
}
