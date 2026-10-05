/**
 * MANAGER 24/7™ by PARADIM — proprietary software.
 * Copyright © 2026 PARADIM Operations SRL. All rights reserved.
 * Concept author and product director: Marius Paul Nemeșu.
 * See LICENSE-PROPRIETARY.md.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

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

async function readEquipmentCache(userId: string) {
  const raw = await AsyncStorage.getItem(equipmentKey(userId));
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as HaccpEquipment[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeEquipmentCache(userId: string, equipment: readonly HaccpEquipment[]) {
  await AsyncStorage.setItem(equipmentKey(userId), JSON.stringify(equipment));
}

export async function listHaccpEquipment(userId: string): Promise<HaccpEquipment[]> {
  const cached = await readEquipmentCache(userId);
  if (!canSync(userId) || !supabase) {
    if (cached.length) return cached;
    const seeded = defaultHaccpEquipment();
    await writeEquipmentCache(userId, seeded);
    return seeded;
  }
  const { data, error } = await supabase
    .from('haccp_equipment')
    .select('id,location_id,name,kind,critical_min,critical_max,required_readings,reading_times,active,sort_order,updated_at')
    .eq('user_id', userId)
    .eq('active', true)
    .order('sort_order');
  if (error) return cached.length ? cached : defaultHaccpEquipment();
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
  const resolved = remote.length ? remote : cached.length ? cached : defaultHaccpEquipment();
  await writeEquipmentCache(userId, resolved);
  return resolved;
}

export async function saveHaccpEquipment(userId: string, draft: HaccpEquipmentDraft) {
  const now = new Date().toISOString();
  let item: HaccpEquipment = {
    ...draft,
    id: draft.id ?? uuid(),
    name: draft.name.trim(),
    requiredReadings: Math.min(3, Math.max(1, draft.requiredReadings)),
    readingTimes: draft.readingTimes.slice(0, 3),
    updatedAt: now,
    syncState: canSync(userId) ? 'pending' : 'local',
  };
  const current = await readEquipmentCache(userId);
  await writeEquipmentCache(userId, [item, ...current.filter((entry) => entry.id !== item.id)].sort((a, b) => a.sortOrder - b.sortOrder));
  if (!canSync(userId) || !supabase) return item;
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
  if (!error) {
    item = { ...item, syncState: 'synced' };
    const next = await readEquipmentCache(userId);
    await writeEquipmentCache(userId, next.map((entry) => entry.id === item.id ? item : entry));
  }
  return item;
}

export async function deactivateHaccpEquipment(userId: string, item: HaccpEquipment) {
  const current = await readEquipmentCache(userId);
  await writeEquipmentCache(userId, current.filter((entry) => entry.id !== item.id));
  if (!canSync(userId) || !supabase) return;
  await supabase.from('haccp_equipment').update({ active: false }).eq('id', item.id).eq('user_id', userId);
}

export async function loadHaccpProfile(userId: string, identity = ''): Promise<HaccpRoutineProfile> {
  const raw = await AsyncStorage.getItem(profileKey(userId));
  let cached = defaultHaccpProfile(identity);
  try { if (raw) cached = { ...cached, ...JSON.parse(raw) }; } catch { /* keep defaults */ }
  if (!canSync(userId) || !supabase) return cached;
  const { data, error } = await supabase
    .from('haccp_routine_profiles')
    .select('default_location_id,default_location_name,responsible_name,shift_start_time,updated_at')
    .eq('user_id', userId)
    .maybeSingle();
  if (error || !data) return cached;
  const remote: HaccpRoutineProfile = {
    defaultLocationId: data.default_location_id ? String(data.default_location_id) : null,
    defaultLocationName: String(data.default_location_name ?? ''),
    responsibleName: String(data.responsible_name ?? identity),
    shiftStartTime: String(data.shift_start_time ?? '06:00').slice(0, 5),
    updatedAt: String(data.updated_at),
    syncState: 'synced',
  };
  await AsyncStorage.setItem(profileKey(userId), JSON.stringify(remote));
  return remote;
}

export async function saveHaccpProfile(userId: string, source: HaccpRoutineProfile) {
  let profile: HaccpRoutineProfile = {
    ...source,
    updatedAt: new Date().toISOString(),
    syncState: canSync(userId) ? 'pending' : 'local',
  };
  await AsyncStorage.setItem(profileKey(userId), JSON.stringify(profile));
  if (!canSync(userId) || !supabase) return profile;
  const { error } = await supabase.from('haccp_routine_profiles').upsert({
    user_id: userId,
    default_location_id: profile.defaultLocationId,
    default_location_name: profile.defaultLocationName,
    responsible_name: profile.responsibleName,
    shift_start_time: profile.shiftStartTime,
    updated_at: profile.updatedAt,
  }, { onConflict: 'user_id' });
  if (!error) {
    profile = { ...profile, syncState: 'synced' };
    await AsyncStorage.setItem(profileKey(userId), JSON.stringify(profile));
  }
  return profile;
}
