import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocked = vi.hoisted(() => ({
  cache: new Map<string, string>(),
  from: vi.fn(),
  getItem: vi.fn(),
  setItem: vi.fn(),
}));

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: { getItem: mocked.getItem, setItem: mocked.setItem },
}));
vi.mock('@/lib/supabase', () => ({
  isDemoMode: false,
  isSupabaseConfigured: true,
  supabase: { from: mocked.from },
}));

import {
  addLocation, getLocationSetupStatus, listLocations, LocationAccessError,
  removeLocation, updateLocation,
} from '@/lib/locations-repository';

const userId = 'account-one';
const key = `manager247.locations.v1.${userId}`;
const existing = { id: 'location-one', name: 'Restaurant', address: 'Iași', active: true };

function remoteResult(data: unknown, error: unknown = null) {
  const methods = {
    select: vi.fn(), eq: vi.fn(), order: vi.fn(), limit: vi.fn(),
    abortSignal: vi.fn(), insert: vi.fn(), update: vi.fn(), delete: vi.fn(),
    single: vi.fn(), maybeSingle: vi.fn(),
  };
  const query = Object.assign(Promise.resolve({ data, error }), methods);
  for (const method of Object.values(methods)) method.mockReturnValue(query);
  mocked.from.mockReturnValueOnce(query);
  return query;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocked.from.mockReset();
  mocked.cache.clear();
  mocked.getItem.mockImplementation(async (cacheKey: string) => mocked.cache.get(cacheKey) ?? null);
  mocked.setItem.mockImplementation(async (cacheKey: string, value: string) => { mocked.cache.set(cacheKey, value); });
});

describe('locations and account isolation', () => {
  it('stores the server-confirmed first location in the account cache', async () => {
    remoteResult([]);
    const write = remoteResult(existing);
    expect(await addLocation(userId, ' Restaurant ', ' Iași ')).toEqual(existing);
    expect(write.insert).toHaveBeenCalledWith(expect.objectContaining({ owner_user_id: userId, name: 'Restaurant', address: 'Iași' }));
    expect(JSON.parse(mocked.cache.get(key)!)).toEqual([existing]);
    expect(mocked.cache.has('manager247.locations.v1.account-two')).toBe(false);
  });

  it('recognizes the server limit even if the client requests admin privileges', async () => {
    remoteResult([existing]);
    remoteResult(null, { message: 'location_limit_reached', details: 'An ordinary account can create one business location.' });
    await expect(addLocation(userId, 'Second', '', { canManageMultiple: true })).rejects.toMatchObject({ reason: 'limit' });
    expect(JSON.parse(mocked.cache.get(key)!)).toEqual([existing]);
  });

  it('does not create a phantom cached location after a server failure', async () => {
    remoteResult([]);
    remoteResult(null, { message: 'Network request failed' });
    await expect(addLocation(userId, 'New location', '')).rejects.toThrow('Network request failed');
    expect(JSON.parse(mocked.cache.get(key)!)).toEqual([]);
  });

  it('keeps a successful remote save successful if device storage is unavailable', async () => {
    remoteResult([]);
    remoteResult(existing);
    mocked.setItem.mockRejectedValue(new Error('Device storage unavailable'));
    expect(await addLocation(userId, 'Restaurant', 'Iași')).toEqual(existing);
  });

  it('edits the existing row without replacing its identity or owner', async () => {
    remoteResult([existing]);
    const edited = { ...existing, name: 'Restaurant nou', address: 'Rediu' };
    const write = remoteResult(edited);
    expect(await updateLocation(userId, existing.id, 'Restaurant nou', 'Rediu')).toEqual(edited);
    expect(write.eq).toHaveBeenCalledWith('id', existing.id);
    expect(write.eq).toHaveBeenCalledWith('owner_user_id', userId);
    expect(JSON.parse(mocked.cache.get(key)!)).toEqual([edited]);
  });

  it('preserves the location if the edit was denied on the server', async () => {
    remoteResult([existing]);
    remoteResult(null, { message: 'new row violates row-level security policy' });
    await expect(updateLocation(userId, existing.id, 'Changed', '')).rejects.toBeInstanceOf(LocationAccessError);
    expect(JSON.parse(mocked.cache.get(key)!)).toEqual([existing]);
  });

  it('rejects ordinary deletion before making any request', async () => {
    await expect(removeLocation(userId, existing.id)).rejects.toMatchObject({ reason: 'admin_required' });
    expect(mocked.from).not.toHaveBeenCalled();
  });

  it('keeps the cache when a claimed admin deletion is denied', async () => {
    remoteResult([existing]);
    remoteResult(null);
    await expect(removeLocation(userId, existing.id, { canManageMultiple: true })).rejects.toMatchObject({ reason: 'admin_required' });
    expect(JSON.parse(mocked.cache.get(key)!)).toEqual([existing]);
  });

  it('removes the cache entry only after server-confirmed admin deletion', async () => {
    remoteResult([existing]);
    remoteResult({ id: existing.id });
    await removeLocation(userId, existing.id, { canManageMultiple: true });
    expect(JSON.parse(mocked.cache.get(key)!)).toEqual([]);
  });

  it('retains a configured cached location when offline', async () => {
    mocked.cache.set(key, JSON.stringify([existing]));
    expect(await getLocationSetupStatus(userId)).toBe('configured');
    remoteResult(null, { message: 'Offline' });
    expect(await listLocations(userId)).toEqual([existing]);
  });

  it('distinguishes an unverified account from a confirmed missing location', async () => {
    remoteResult(null, { message: 'Network request failed' });
    expect(await getLocationSetupStatus(userId)).toBe('unknown');
    remoteResult([]);
    expect(await getLocationSetupStatus(userId)).toBe('missing');
    remoteResult([{ id: existing.id }]);
    expect(await getLocationSetupStatus(userId)).toBe('configured');
  });

  it('recovers from unreadable local storage by verifying the server', async () => {
    mocked.getItem.mockRejectedValue(new Error('Cannot read storage'));
    remoteResult([{ id: existing.id }]);
    expect(await getLocationSetupStatus(userId)).toBe('configured');
  });

  it('ends a stalled first-login verification after eight seconds', async () => {
    vi.useFakeTimers();
    try {
      const query = remoteResult(null);
      query.abortSignal.mockImplementation((signal: AbortSignal) => new Promise((resolve) => {
        signal.addEventListener('abort', () => resolve({ data: null, error: { message: 'Request aborted' } }));
      }));
      const status = getLocationSetupStatus(userId);
      await vi.advanceTimersByTimeAsync(8_000);
      expect(await status).toBe('unknown');
    } finally {
      vi.useRealTimers();
    }
  });

  it('applies the single-location rule in the local demonstration too', async () => {
    await addLocation('demo', 'First', '');
    await expect(addLocation('demo', 'Second', '')).rejects.toMatchObject({ reason: 'limit' });
    expect(mocked.from).not.toHaveBeenCalled();
  });
});
