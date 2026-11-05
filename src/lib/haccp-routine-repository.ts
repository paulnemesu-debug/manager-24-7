/**
 * MANAGER 24/7™ by PARADIM — proprietary software.
 * Copyright © 2026 PARADIM Operations SRL. All rights reserved.
 * Concept author and product director: Marius Paul Nemeșu.
 * See LICENSE-PROPRIETARY.md.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

import { withStorageLock } from '@/lib/storage-lock';
import { isDemoMode, isSupabaseConfigured, supabase } from '@/lib/supabase';
import type { HaccpEquipment, HaccpEquipmentDraft, HaccpRoutineProfile } from '@/types/haccp-routine';

const equipmentKey = (userId: string) => `manager247.haccp-equipment.v1.${userId}`;
const profileKey = (userId: string) => `manager247.haccp-routine-profile.v1.${userId}`;
const uuid = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (character) => {
  const random = Math.floor(Math.random() * 16);
  return (character === 'x' ? random : (random & 3) | 8).toString(16);
});

function canSync(userId: string) {
  return userId !== 'demo' && !isDemoMode && isSupabaseConfigured && Boolean(supabase);
}

export function defaultHaccpEquipment(locationId: string | null = null): HaccpEquipment[] {
  const now = new Date().toISOString();
  return [
    { id: uuid(), locationId, name: 'Frigider carne', kind: 'cold', criticalMin: 0, criticalMax: 4, requiredReadings: 3, readingTimes: ['06:00', '12:00', '18:00'], active: true, sortOrder: 1, updatedAt: now, syncState: 'local' },
    { id: uuid(), locationId, name: 'Frigider lactate', kind: 'cold', criticalMin: 0, criticalMax: 4, requiredReadings: 3, readingTimes: ['06:00', '12:00', '18:00'], active: true, sortOrder: 2, updatedAt: now, syncState: 'local' },
    { id: uuid(), locationId, name: 'Linie caldă', kind: 'hot', criticalMin: 63, criticalMax: null, requiredReadings: 1, readingTimes: ['11:30'], active: true, sortOrder: 3, updatedAt: now, syncState: 'local' },
  ];
}

export function defaultHaccpProfile(identity = ''): HaccpRoutineProfile {
  return {
    defaultLocationId: null,
    defaultLocationName: 'Bucătărie principală',
    responsibleName: identity,
    shiftStartTime: '06:00',
    updatedAt: new Date().toISOString(),
    syncState: 'local',
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasSyncMetadata(value: Record<string, unknown>) {
  return typeof value.updatedAt === 'string' && Number.isFinite(Date.parse(value.updatedAt))
    && ['local', 'pending', 'synced'].includes(String(value.syncState));
}

const nullableString = (value: unknown) => value === null || typeof value === 'string';
const nullableNumber = (value: unknown) => value === null || (typeof value === 'number' && Number.isFinite(value));

function isEquipment(value: unknown): value is HaccpEquipment {
  return isRecord(value) && typeof value.id === 'string' && Boolean(value.id)
    && nullableString(value.locationId) && typeof value.name === 'string'
    && ['cold', 'frozen', 'hot', 'other'].includes(String(value.kind))
    && nullableNumber(value.criticalMin) && nullableNumber(value.criticalMax)
    && typeof value.requiredReadings === 'number' && Number.isFinite(value.requiredReadings)
    && Array.isArray(value.readingTimes) && value.readingTimes.every((time) => typeof time === 'string')
    && typeof value.active === 'boolean' && typeof value.sortOrder === 'number' && Number.isFinite(value.sortOrder)
    && hasSyncMetadata(value);
}

function isProfile(value: unknown): value is HaccpRoutineProfile {
  return isRecord(value) && nullableString(value.defaultLocationId)
    && typeof value.defaultLocationName === 'string' && typeof value.responsibleName === 'string'
    && typeof value.shiftStartTime === 'string' && hasSyncMetadata(value);
}

async function readEquipmentCache(userId: string): Promise<HaccpEquipment[] | null> {
  const raw = await AsyncStorage.getItem(equipmentKey(userId));
  if (raw === null) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.every(isEquipment)) return parsed;
  } catch {
    // Preserve the original bytes; replacing them would destroy recoverable edits.
  }
  throw new Error('HACCP equipment cache is invalid. The saved data has been preserved.');
}

async function readProfileCache(userId: string): Promise<HaccpRoutineProfile | null> {
  const raw = await AsyncStorage.getItem(profileKey(userId));
  if (raw === null) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (isProfile(parsed)) return parsed;
  } catch {
    // Preserve the original bytes instead of treating corruption as a new profile.
  }
  throw new Error('HACCP profile cache is invalid. The saved data has been preserved.');
}

async function writeEquipmentCache(userId: string, equipment: readonly HaccpEquipment[]) {
  await AsyncStorage.setItem(equipmentKey(userId), JSON.stringify(equipment));
}

async function syncEquipment(userId: string, item: HaccpEquipment): Promise<HaccpEquipment> {
  if (item.syncState === 'synced' || !canSync(userId) || !supabase) return item;
  try {
    const { error } = await supabase.from('haccp_equipment').upsert({
      id: item.id,
      user_id: userId,
      location_id: item.locationId,
      name: item.name,
      kind: item.kind,
      critical_min: item.criticalMin,
      critical_max: item.criticalMax,
      required_readings: item.requiredReadings,
      reading_times: item.readingTimes,
      active: item.active,
      sort_order: item.sortOrder,
      updated_at: item.updatedAt,
    }, { onConflict: 'id' });
    if (!error) return { ...item, syncState: 'synced' };
  } catch {
    // A rejected request leaves the already-persisted item available for replay.
  }
  return item;
}

const activeEquipment = (items: readonly HaccpEquipment[]) => items.filter((item) => item.active).sort((a, b) => a.sortOrder - b.sortOrder);

async function equipmentFallback(userId: string, cached: HaccpEquipment[] | null) {
  if (cached !== null) return activeEquipment(cached);
  const seeded = defaultHaccpEquipment();
  await writeEquipmentCache(userId, seeded);
  return seeded;
}

async function listHaccpEquipmentUnlocked(userId: string): Promise<HaccpEquipment[]> {
  let cached = await readEquipmentCache(userId);
  if (!canSync(userId) || !supabase) return equipmentFallback(userId, cached);
  const acknowledged = new Set<string>();
  if (cached !== null) {
    const replayed: HaccpEquipment[] = [];
    for (const item of cached) {
      const synced = await syncEquipment(userId, item);
      if (synced !== item) acknowledged.add(item.id);
      replayed.push(synced);
    }
    if (replayed.some((item, index) => item !== cached![index])) await writeEquipmentCache(userId, replayed);
    cached = replayed;
  }
  let result;
  try {
    result = await supabase
      .from('haccp_equipment')
      .select('id,location_id,name,kind,critical_min,critical_max,required_readings,reading_times,active,sort_order,updated_at')
      .eq('user_id', userId)
      .order('sort_order');
  } catch {
    return equipmentFallback(userId, cached);
  }
  const { data, error } = result;
  if (error) return equipmentFallback(userId, cached);
  const remote = (data ?? []).map((row) => ({
    id: String(row.id),
    locationId: row.location_id ? String(row.location_id) : null,
    name: String(row.name),
    kind: row.kind as HaccpEquipment['kind'],
    criticalMin: row.critical_min === null ? null : Number(row.critical_min),
    criticalMax: row.critical_max === null ? null : Number(row.critical_max),
    requiredReadings: Number(row.required_readings),
    readingTimes: Array.isArray(row.reading_times) ? row.reading_times.map(String) : [],
    active: Boolean(row.active),
    sortOrder: Number(row.sort_order),
    updatedAt: String(row.updated_at),
    syncState: 'synced' as const,
  }));
  if (!remote.length && cached === null) return equipmentFallback(userId, cached);
  const merged = new Map<string, HaccpEquipment>(remote.map((item) => [item.id, item]));
  for (const item of cached ?? []) {
    const cloud = merged.get(item.id);
    // Keep this load's acknowledged intent over an immediately stale read. On
    // later loads trust cloud edits; device clocks are not server revisions.
    if (!cloud || item.syncState !== 'synced' || acknowledged.has(item.id)) merged.set(item.id, item);
  }
  const resolved = [...merged.values()].sort((a, b) => a.sortOrder - b.sortOrder);
  await writeEquipmentCache(userId, resolved);
  return activeEquipment(resolved);
}

export function listHaccpEquipment(userId: string): Promise<HaccpEquipment[]> {
  return withStorageLock(equipmentKey(userId), () => listHaccpEquipmentUnlocked(userId));
}

/** Existing durable registry only: no cloud lock, replay, default seeding or writes. */
export async function readHaccpEquipmentRegistrySnapshot(userId: string): Promise<HaccpEquipment[]> {
  return (await readEquipmentCache(userId) ?? []).sort((a, b) => a.sortOrder - b.sortOrder);
}

/** Maintenance retains deactivated assets and their identity without scheduling readings. */
export function listHaccpEquipmentRegistry(userId: string): Promise<HaccpEquipment[]> {
  return withStorageLock(equipmentKey(userId), async () => {
    await listHaccpEquipmentUnlocked(userId);
    return (await readEquipmentCache(userId) ?? []).sort((a, b) => a.sortOrder - b.sortOrder);
  });
}

async function saveHaccpEquipmentUnlocked(userId: string, draft: HaccpEquipmentDraft) {
  const now = new Date().toISOString();
  const item: HaccpEquipment = {
    ...draft,
    id: draft.id ?? uuid(),
    name: draft.name.trim(),
    requiredReadings: Math.min(3, Math.max(1, draft.requiredReadings)),
    readingTimes: draft.readingTimes.slice(0, 3),
    updatedAt: now,
    syncState: canSync(userId) ? 'pending' : 'local',
  };
  const current = await readEquipmentCache(userId) ?? [];
  const next = [item, ...current.filter((entry) => entry.id !== item.id)].sort((a, b) => a.sortOrder - b.sortOrder);
  await writeEquipmentCache(userId, next);
  const synced = await syncEquipment(userId, item);
  if (synced !== item) {
    await writeEquipmentCache(userId, next.map((entry) => entry.id === item.id ? synced : entry));
  }
  return synced;
}

export function saveHaccpEquipment(userId: string, draft: HaccpEquipmentDraft) {
  return withStorageLock(equipmentKey(userId), () => saveHaccpEquipmentUnlocked(userId, draft));
}

export async function deactivateHaccpEquipment(userId: string, item: HaccpEquipment) {
  await withStorageLock(equipmentKey(userId), async () => {
    const current = await readEquipmentCache(userId);
    const latest = current?.find((entry) => entry.id === item.id) ?? item;
    await saveHaccpEquipmentUnlocked(userId, { ...latest, active: false });
  });
}

async function syncProfile(userId: string, profile: HaccpRoutineProfile): Promise<HaccpRoutineProfile> {
  if (profile.syncState === 'synced' || !canSync(userId) || !supabase) return profile;
  try {
    const { error } = await supabase.from('haccp_routine_profiles').upsert({
      user_id: userId,
      default_location_id: profile.defaultLocationId,
      default_location_name: profile.defaultLocationName,
      responsible_name: profile.responsibleName,
      shift_start_time: profile.shiftStartTime,
      updated_at: profile.updatedAt,
    }, { onConflict: 'user_id' });
    if (!error) return { ...profile, syncState: 'synced' };
  } catch {
    // Only cloud errors are absorbed; failed local persistence must reach the caller.
  }
  return profile;
}

/** Validated durable scope only: no lock, cloud request, writes or invented defaults. */
export function readHaccpProfileSnapshot(userId: string): Promise<HaccpRoutineProfile | null> {
  return readProfileCache(userId);
}

async function loadHaccpProfileUnlocked(userId: string, identity: string, requireVerifiedScope = false): Promise<HaccpRoutineProfile> {
  let cached = await readProfileCache(userId);
  const unavailable = () => new Error('HACCP location is unavailable. Retry loading the saved profile.');
  if (!canSync(userId) || !supabase) {
    if (requireVerifiedScope && !cached && userId !== 'demo') throw unavailable();
    return cached ?? defaultHaccpProfile(identity);
  }
  let acknowledged = false;
  if (cached !== null) {
    const replayed = await syncProfile(userId, cached);
    if (replayed !== cached) {
      await AsyncStorage.setItem(profileKey(userId), JSON.stringify(replayed));
      acknowledged = true;
    }
    cached = replayed;
    if (cached.syncState !== 'synced') return cached;
  }
  let result;
  try {
    result = await supabase
      .from('haccp_routine_profiles')
      .select('default_location_id,default_location_name,responsible_name,shift_start_time,updated_at')
      .eq('user_id', userId)
      .maybeSingle();
  } catch {
    if (requireVerifiedScope && !cached) throw unavailable();
    return cached ?? defaultHaccpProfile(identity);
  }
  const { data, error } = result;
  if (error) {
    if (requireVerifiedScope && !cached) throw unavailable();
    return cached ?? defaultHaccpProfile(identity);
  }
  // A successful empty lookup is different from a failed request: this is a new profile.
  if (!data) return cached ?? defaultHaccpProfile(identity);
  const remote: HaccpRoutineProfile = {
    defaultLocationId: data.default_location_id ? String(data.default_location_id) : null,
    defaultLocationName: String(data.default_location_name ?? ''),
    responsibleName: String(data.responsible_name ?? identity),
    shiftStartTime: String(data.shift_start_time ?? '06:00').slice(0, 5),
    updatedAt: String(data.updated_at),
    syncState: 'synced',
  };
  const resolved = acknowledged && cached ? cached : remote;
  await AsyncStorage.setItem(profileKey(userId), JSON.stringify(resolved));
  return resolved;
}

export function loadHaccpProfile(userId: string, identity = ''): Promise<HaccpRoutineProfile> {
  return withStorageLock(profileKey(userId), () => loadHaccpProfileUnlocked(userId, identity));
}

/** Form entry must not silently assign a default location when the saved scope is unavailable. */
export function loadHaccpProfileForEntry(userId: string, identity = ''): Promise<HaccpRoutineProfile> {
  return withStorageLock(profileKey(userId), () => loadHaccpProfileUnlocked(userId, identity, true));
}

export function saveHaccpProfile(userId: string, source: HaccpRoutineProfile) {
  return withStorageLock(profileKey(userId), async () => {
    await readProfileCache(userId);
    const profile: HaccpRoutineProfile = {
      ...source,
      updatedAt: new Date().toISOString(),
      syncState: canSync(userId) ? 'pending' : 'local',
    };
    await AsyncStorage.setItem(profileKey(userId), JSON.stringify(profile));
    const synced = await syncProfile(userId, profile);
    if (synced !== profile) await AsyncStorage.setItem(profileKey(userId), JSON.stringify(synced));
    return synced;
  });
}
