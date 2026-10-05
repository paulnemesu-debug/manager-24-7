/**
 * MANAGER 24/7™ by PARADIM — proprietary software.
 * Copyright © 2026 PARADIM Operations SRL. All rights reserved.
 * Concept author and product director: Marius Paul Nemeșu.
 * See LICENSE-PROPRIETARY.md.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

import { isDemoMode, isSupabaseConfigured, supabase } from '@/lib/supabase';

export type BusinessLocation = { id: string; name: string; address: string; active: boolean };
export type LocationAdminOptions = { canManageMultiple?: boolean };
export type LocationSetupStatus = 'configured' | 'missing' | 'unknown';

const keyFor = (userId: string) => `manager247.locations.v1.${userId}`;
const uuid = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (character) => {
  const random = Math.floor(Math.random() * 16);
  return (character === 'x' ? random : (random & 3) | 8).toString(16);
});

const normaliseLocation = (row: {
  id: string;
  name: string;
  address?: string | null;
  active?: boolean | null;
}): BusinessLocation => ({
  id: row.id,
  name: row.name,
  address: row.address ?? '',
  active: row.active ?? true,
});

const readCachedLocations = async (userId: string) => {
  try {
    const raw = await AsyncStorage.getItem(keyFor(userId));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed.filter((item) => item && typeof item.id === 'string' && typeof item.name === 'string' && item.active !== false).map(normaliseLocation)
      : [];
  } catch {
    return [];
  }
};

const writeCachedLocations = (userId: string, locations: BusinessLocation[]) => (
  AsyncStorage.setItem(keyFor(userId), JSON.stringify(locations))
);

export class LocationAccessError extends Error {
  constructor(public readonly reason: 'limit' | 'admin_required' | 'not_found') {
    super(reason === 'limit'
      ? 'Contul include o singură locație. Accesul multi-locație va fi disponibil ca abonament suplimentar.'
      : reason === 'admin_required'
        ? 'Doar administratorul poate șterge locații.'
        : 'Locația nu a fost găsită sau nu poate fi modificată.');
    this.name = 'LocationAccessError';
  }
}

const translateLocationError = (error: unknown): Error => {
  // PostgREST returns plain objects, rather than instances of Error.
  const fields = error && typeof error === 'object'
    ? error as { message?: unknown; details?: unknown }
    : null;
  const message = typeof fields?.message === 'string'
    ? fields.message
    : typeof error === 'string' ? error : '';
  const details = typeof fields?.details === 'string' ? fields.details : '';
  if (/location_limit_reached|one business location|single location/i.test(`${message} ${details}`)) {
    return new LocationAccessError('limit');
  }
  if (/location_owner_mismatch|row.level security|permission denied/i.test(message)) {
    return new LocationAccessError('not_found');
  }
  return error instanceof Error ? error : new Error(message || 'Operațiunea nu a reușit.');
};

export async function listLocations(userId: string): Promise<BusinessLocation[]> {
  const cached = await readCachedLocations(userId);
  if (userId === 'demo' || isDemoMode || !isSupabaseConfigured || !supabase) return cached;
  const { data, error } = await supabase.from('business_locations').select('id,name,address,active').eq('active', true).order('name');
  if (error) return cached;
  const remote = (data ?? []).map(normaliseLocation);
  await writeCachedLocations(userId, remote).catch(() => undefined);
  return remote;
}

export async function getLocationSetupStatus(userId: string): Promise<LocationSetupStatus> {
  const cached = await readCachedLocations(userId);
  if (cached.some((item) => item.active)) return 'configured';
  if (userId === 'demo' || isDemoMode || !isSupabaseConfigured || !supabase) return 'missing';

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const { data, error } = await supabase
      .from('business_locations')
      .select('id')
      .eq('active', true)
      .limit(1)
      .abortSignal(controller.signal);
    if (error) return 'unknown';
    return data?.length ? 'configured' : 'missing';
  } catch {
    return 'unknown';
  } finally {
    clearTimeout(timeout);
  }
}

export async function addLocation(
  userId: string,
  name: string,
  address: string,
  options: LocationAdminOptions = {},
): Promise<BusinessLocation> {
  const location = { id: uuid(), name: name.trim(), address: address.trim(), active: true };
  if (!location.name) throw new Error('Completează denumirea locației.');
  const current = await listLocations(userId);
  const client = supabase;
  const isLocal = userId === 'demo' || isDemoMode || !isSupabaseConfigured || !client;

  if (isLocal) {
    if (!options.canManageMultiple && current.length >= 1) throw new LocationAccessError('limit');
    await writeCachedLocations(userId, [...current, location]);
    return location;
  }

  const { data, error } = await client
    .from('business_locations')
    .insert({
      id: location.id,
      owner_user_id: userId,
      name: location.name,
      address: location.address || null,
    })
    .select('id,name,address,active')
    .single();
  if (error) throw translateLocationError(error);

  const saved = normaliseLocation(data);
  await writeCachedLocations(userId, [...current.filter((item) => item.id !== saved.id), saved]).catch(() => undefined);
  return saved;
}

export async function updateLocation(
  userId: string,
  locationId: string,
  name: string,
  address: string,
): Promise<BusinessLocation> {
  const cleanName = name.trim();
  const cleanAddress = address.trim();
  if (!cleanName) throw new Error('Completează denumirea locației.');

  const current = await listLocations(userId);
  const existing = current.find((item) => item.id === locationId);
  if (!existing) throw new LocationAccessError('not_found');

  const client = supabase;
  const isLocal = userId === 'demo' || isDemoMode || !isSupabaseConfigured || !client;
  if (isLocal) {
    const saved = { ...existing, name: cleanName, address: cleanAddress };
    await writeCachedLocations(userId, current.map((item) => item.id === saved.id ? saved : item));
    return saved;
  }

  const { data, error } = await client
    .from('business_locations')
    .update({ name: cleanName, address: cleanAddress || null })
    .eq('id', locationId)
    .eq('owner_user_id', userId)
    .select('id,name,address,active')
    .maybeSingle();
  if (error) throw translateLocationError(error);
  if (!data) throw new LocationAccessError('not_found');

  const saved = normaliseLocation(data);
  await writeCachedLocations(userId, current.map((item) => item.id === saved.id ? saved : item)).catch(() => undefined);
  return saved;
}

export async function removeLocation(
  userId: string,
  locationId: string,
  options: LocationAdminOptions = {},
): Promise<void> {
  if (!options.canManageMultiple) throw new LocationAccessError('admin_required');
  const current = await listLocations(userId);
  if (!current.some((item) => item.id === locationId)) throw new LocationAccessError('not_found');

  const client = supabase;
  const isLocal = userId === 'demo' || isDemoMode || !isSupabaseConfigured || !client;
  if (!isLocal) {
    const { data, error } = await client
      .from('business_locations')
      .delete()
      .eq('id', locationId)
      .eq('owner_user_id', userId)
      .select('id')
      .maybeSingle();
    if (error) throw translateLocationError(error);
    if (!data) throw new LocationAccessError('admin_required');
  }

  const write = writeCachedLocations(userId, current.filter((item) => item.id !== locationId));
  if (isLocal) await write;
  else await write.catch(() => undefined);
}
