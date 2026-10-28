import { createElement, useEffect } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  scope: 'account-a' as string | null, storage: new Map<string, string>(),
  cloud: new Map<string, { currency: string; default_vat_percent: number }>(),
  reads: new Map<string, Promise<void>>(), writes: new Map<string, Promise<void>>(), readFailures: new Set<string>(),
}));
vi.mock('@/contexts/auth-context', () => ({ useAuth: () => ({
  user: state.scope && state.scope !== 'demo' ? { id: state.scope } : null,
  isDemo: state.scope === 'demo',
}) }));
vi.mock('@/contexts/locale-context', () => ({ useI18n: () => ({ locale: 'en' }) }));
vi.mock('@react-native-async-storage/async-storage', () => ({ default: {
  getItem: async (key: string) => state.storage.get(key) ?? null,
  setItem: async (key: string, value: string) => { state.storage.set(key, value); },
} }));
vi.mock('@/lib/supabase', () => ({ isDemoMode: false, supabase: {
  from: () => {
    let userId = '';
    const query = {
      select: () => query,
      eq: (_field: string, value: string) => { userId = value; return query; },
      maybeSingle: async () => {
        await state.reads.get(userId);
        return { data: state.cloud.get(userId) ?? null, error: state.readFailures.has(userId) ? new Error('Offline') : null };
      },
      upsert: async (row: { user_id: string; currency: string; default_vat_percent: number }) => {
        await state.writes.get(row.user_id);
        state.cloud.set(row.user_id, row);
        return { error: null };
      },
    };
    return query;
  },
} }));

import { PreferencesProvider, usePreferences } from './preferences-context';
import { DEFAULT_ACCOUNT_PREFERENCES } from '@/lib/preferences-repository';

const key = (scope: string) => `professional_foodcost.preferences.v1.${scope}`;
let renderer: ReactTestRenderer | undefined;
let preferences: ReturnType<typeof usePreferences>;
function Probe() {
  const current = usePreferences();
  useEffect(() => { preferences = current; }, [current]);
  return null;
}
const element = () => createElement(PreferencesProvider, null, createElement(Probe));
const mount = async () => { await act(async () => { renderer = create(element()); }); };
const switchScope = async (scope: string | null) => {
  state.scope = scope;
  await act(async () => { renderer!.update(element()); });
};
const deferred = () => {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
};

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  state.scope = 'account-a'; state.storage.clear(); state.cloud.clear(); state.reads.clear(); state.writes.clear(); state.readFailures.clear();
  for (const [scope, currency, vat] of [['account-a', 'EUR', 19], ['demo', 'USD', 5]] as const) {
    state.storage.set(key(scope), JSON.stringify({ preferences: { currency, defaultVatPercent: vat }, pending: false }));
    state.cloud.set(scope, { currency, default_vat_percent: vat });
  }
});
afterEach(async () => {
  await act(async () => { renderer?.unmount(); }); renderer = undefined;
  vi.unstubAllGlobals();
});

describe('preferences across account and instant-demo transitions', () => {
  it('does not apply an old account save acknowledgement to demo UI or a subsequent demo save', async () => {
    await mount();
    const write = deferred(); state.writes.set('account-a', write.promise);
    await act(async () => { preferences.setCurrency('HUF'); });
    await switchScope('demo');
    expect(preferences.currency).toBe('USD');
    await act(async () => { write.resolve(); });
    expect(preferences.currency).toBe('USD');
    expect(preferences.defaultVatPercent).toBe(5);
    await act(async () => { preferences.setDefaultVatPercent(9); });
    expect(JSON.parse(state.storage.get(key('demo'))!)).toEqual({ preferences: { currency: 'USD', defaultVatPercent: 9 }, pending: false });
    expect(JSON.parse(state.storage.get(key('account-a'))!).preferences.currency).toBe('HUF');
  });

  it('does not mark demo preferences pending when an old account write fails late', async () => {
    await mount();
    const write = deferred(); state.writes.set('account-a', write.promise);
    await act(async () => { preferences.setCurrency('HUF'); });
    await switchScope('demo');
    expect(preferences.isPendingSync).toBe(false);
    await act(async () => { write.reject(new Error('Offline')); });
    expect(preferences.isPendingSync).toBe(false);
    expect(preferences.currency).toBe('USD');
    expect(JSON.parse(state.storage.get(key('account-a'))!).pending).toBe(true);
  });

  it('keeps a late old-account fetch out of the current demo UI and cache', async () => {
    const read = deferred(); state.reads.set('account-a', read.promise);
    await mount();
    await switchScope('demo');
    const before = state.storage.get(key('demo'));
    state.cloud.set('account-a', { currency: 'PLN', default_vat_percent: 23 });
    await act(async () => { read.resolve(); });
    expect(preferences.currency).toBe('USD'); expect(preferences.defaultVatPercent).toBe(5);
    expect(state.storage.get(key('demo'))).toBe(before);
    expect(preferences.isReady).toBe(true);
  });

  it('starts an uncached account from defaults if its read fails, without retaining the previous account preferences', async () => {
    await mount(); expect(preferences.currency).toBe('EUR');
    state.readFailures.add('account-b');
    await switchScope('account-b');
    expect(preferences.currency).toBe(DEFAULT_ACCOUNT_PREFERENCES.currency);
    expect(preferences.defaultVatPercent).toBe(DEFAULT_ACCOUNT_PREFERENCES.defaultVatPercent);
    expect(preferences.isReady).toBe(true);
    expect(state.storage.has(key('account-b'))).toBe(false);
  });
});
