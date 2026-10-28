import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ storage: new Map<string, string>(), from: vi.fn() }));
vi.mock('@react-native-async-storage/async-storage', () => ({ default: {
  getItem: async (key: string) => state.storage.get(key) ?? null,
  setItem: async (key: string, value: string) => { state.storage.set(key, value); },
} }));
// Production configuration: instant demo must work even when a client exists.
vi.mock('@/lib/supabase', () => ({ isDemoMode: false, supabase: { from: state.from } }));

import { DEFAULT_ACCOUNT_PREFERENCES, fetchPreferences, loadCachedPreferences, savePreferences } from './preferences-repository';

const key = (userId: string) => `professional_foodcost.preferences.v1.${userId}`;
const demoPreferences = { currency: 'USD' as const, defaultVatPercent: 5 };
const realPreferences = { currency: 'EUR' as const, defaultVatPercent: 19 };
function cloud(data: unknown, error: unknown = null) {
  const query = { select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn(async () => ({ data, error })),
    upsert: vi.fn(async () => ({ data, error })) };
  query.select.mockReturnValue(query); query.eq.mockReturnValue(query);
  state.from.mockReturnValue(query);
  return query;
}

beforeEach(() => {
  state.storage.clear(); state.from.mockReset();
  state.from.mockImplementation(() => { throw new Error('Demo attempted cloud access'); });
  state.storage.set(key('real-account'), JSON.stringify({ preferences: realPreferences, pending: false }));
});

describe('instant demo preferences in production configuration', () => {
  it('reads the demo cache without requesting cloud or exposing the real-account cache', async () => {
    state.storage.set(key('demo'), JSON.stringify({ preferences: demoPreferences, pending: false }));
    expect(await fetchPreferences('demo')).toEqual(demoPreferences);
    expect(state.from).not.toHaveBeenCalled();
    expect((await loadCachedPreferences('real-account'))?.preferences).toEqual(realPreferences);
  });

  it('returns defaults for a new demo without requesting cloud or copying another account', async () => {
    expect(await fetchPreferences('demo')).toEqual(DEFAULT_ACCOUNT_PREFERENCES);
    expect(state.from).not.toHaveBeenCalled();
  });

  it('saves and reloads demo preferences as local completed work, preserving real-account data', async () => {
    const realBefore = state.storage.get(key('real-account'));
    expect(await savePreferences('demo', demoPreferences)).toEqual(demoPreferences);
    expect(await fetchPreferences('demo')).toEqual(demoPreferences);
    expect(await loadCachedPreferences('demo')).toEqual({ preferences: demoPreferences, pending: false });
    expect(state.storage.get(key('real-account'))).toBe(realBefore);
    expect(state.from).not.toHaveBeenCalled();
  });

  it('still fetches real-account preferences using the owner filter and its own cache', async () => {
    state.storage.set(key('demo'), JSON.stringify({ preferences: demoPreferences, pending: false }));
    const query = cloud({ currency: 'GBP', default_vat_percent: 20 });
    expect(await fetchPreferences('real-account')).toEqual({ currency: 'GBP', defaultVatPercent: 20 });
    expect(state.from).toHaveBeenCalledWith('user_preferences');
    expect(query.eq).toHaveBeenCalledWith('user_id', 'real-account');
    expect((await loadCachedPreferences('demo'))?.preferences).toEqual(demoPreferences);
  });

  it('still writes real-account preferences with its user ID and clears pending only after success', async () => {
    const query = cloud(null);
    expect(await savePreferences('real-account', realPreferences)).toEqual(realPreferences);
    expect(query.upsert).toHaveBeenCalledWith(expect.objectContaining({
      user_id: 'real-account', currency: 'EUR', default_vat_percent: 19,
    }));
    expect(await loadCachedPreferences('real-account')).toEqual({ preferences: realPreferences, pending: false });
    expect(state.storage.has(key('demo'))).toBe(false);
  });

  it('retains real-account pending intent and surfaces a rejected cloud write', async () => {
    cloud(null, new Error('Cloud unavailable'));
    await expect(savePreferences('real-account', realPreferences)).rejects.toThrow('Cloud unavailable');
    expect(await loadCachedPreferences('real-account')).toEqual({ preferences: realPreferences, pending: true });
    expect(state.storage.has(key('demo'))).toBe(false);
  });
});
