import { createElement, useEffect } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { createClient, type Session } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const adapters = vi.hoisted(() => ({
  client: null as any, reset: vi.fn(async () => undefined), seed: vi.fn(async (): Promise<void> => undefined),
  requestCode: vi.fn(async () => undefined), verifyCode: vi.fn(),
  isWeb: true, link: null as null | ((event: { url: string }) => void),
}));
vi.mock('@/contexts/locale-context', () => ({ useI18n: () => ({ locale: 'en' }) }));
vi.mock('@/lib/instant-demo', () => ({ resetInstantDemo: adapters.reset, seedInstantDemo: adapters.seed }));
vi.mock('@/lib/account-deletion-cleanup', () => ({ deleteAccountAndCleanup: vi.fn(), retryConfirmedAccountCleanup: vi.fn(async () => undefined) }));
vi.mock('@/lib/email-otp', () => ({ requestEmailCode: adapters.requestCode, verifyEmailCode: adapters.verifyCode }));
vi.mock('@/lib/supabase', () => ({ isDemoMode: false, isSupabaseConfigured: true, get isWeb() { return adapters.isWeb; }, get supabase() { return adapters.client; } }));
vi.mock('expo-linking', () => ({
  parse: (url: string) => ({ queryParams: Object.fromEntries(new URL(url).searchParams) }),
  getInitialURL: async () => null,
  addEventListener: (_event: string, callback: (event: { url: string }) => void) => { adapters.link = callback; return { remove() {} }; },
}));
vi.mock('react-native', () => ({ Platform: { get OS() { return adapters.isWeb ? 'web' : 'android'; } }, AppState: { addEventListener: () => ({ remove() {} }) } }));

import { AuthProvider, useAuth } from './auth-context';
import { setInstantDemoIsolation, workspaceFetch } from '@/lib/demo-isolation';

const storedSession = { access_token: 'qa-access-token', refresh_token: 'qa-refresh-token', token_type: 'bearer', expires_at: 4102444800, expires_in: 3600, user: { id: 'retained-user', email: 'qa@example.invalid' } } as Session;
let tree: ReactTestRenderer | undefined;
let auth: ReturnType<typeof useAuth>;
let storage: Map<string, string>;
let failRemove: boolean;
let network: ReturnType<typeof vi.fn>;
function Probe() { const current = useAuth(); useEffect(() => { auth = current; }, [current]); return null; }
async function mount() { await act(async () => { tree = create(createElement(AuthProvider, null, createElement(Probe))); await new Promise(resolve => setTimeout(resolve, 0)); }); }

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.clearAllMocks();
  setInstantDemoIsolation(false);
  failRemove = false;
  adapters.isWeb = true; adapters.link = null;
  storage = new Map([['qa-auth', JSON.stringify(storedSession)], ['manager247.hr.v1.other-user', 'preserve']]);
  network = vi.fn(async (url: string) => {
    if (String(url).includes('/auth/v1/logout?scope=local')) return new Response(null, { status: 204 });
    throw new Error('Unexpected real-transport path: ' + url);
  });
  vi.stubGlobal('fetch', network);
  adapters.client = createClient('https://qa.example.invalid', 'qa-publishable', {
    global: { fetch: workspaceFetch },
    auth: { storageKey: 'qa-auth', persistSession: true, autoRefreshToken: false, detectSessionInUrl: false, storage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => { storage.set(key, value); },
      removeItem: (key: string) => { if (failRemove) throw new Error('Secure storage unavailable'); storage.delete(key); },
    } },
  });
});
afterEach(async () => {
  await act(async () => { tree?.unmount(); }); tree = undefined;
  await adapters.client.auth.stopAutoRefresh();
  setInstantDemoIsolation(false);
  vi.restoreAllMocks(); vi.unstubAllGlobals();
});

describe('production-configured instant demo session isolation', () => {
  it('ends only the retained local session before isolation and exits without another HTTP call', async () => {
    await mount(); expect(auth.user?.id).toBe('retained-user');
    await act(async () => { await auth.startDemo(); });
    expect(storage.has('qa-auth')).toBe(false);
    expect(storage.get('manager247.hr.v1.other-user')).toBe('preserve');
    expect(network).toHaveBeenCalledTimes(1);
    expect(String(network.mock.calls[0][0])).toContain('/auth/v1/logout?scope=local');
    expect(auth).toMatchObject({ isDemo: true, user: null, session: null });
    await expect(adapters.client.from('recipes').select('*').then((response: any) => { if (response.error) throw response.error; })).rejects.toBeTruthy();
    expect(network).toHaveBeenCalledTimes(1);
    await act(async () => { await auth.signOut(); });
    expect(auth).toMatchObject({ isDemo: false, user: null, session: null, isAuthenticated: false });
    expect(network).toHaveBeenCalledTimes(1);
    expect((await adapters.client.auth.getSession()).data.session).toBeNull();
  });
  it.each(['during', 'after'])('ignores a saved-session response arriving %s demo and stale auth callbacks', async (when) => {
    await adapters.client.auth.getSession();
    let finishSession!: (value: unknown) => void;
    vi.spyOn(adapters.client.auth, 'getSession').mockImplementationOnce(() => new Promise(resolve => { finishSession = resolve; }));
    const originalSubscribe = adapters.client.auth.onAuthStateChange.bind(adapters.client.auth);
    let staleCallback: (event: string, session: Session | null) => void = () => undefined;
    vi.spyOn(adapters.client.auth, 'onAuthStateChange').mockImplementation((callback: any) => { staleCallback = callback; return originalSubscribe(callback); });
    await mount();
    await act(async () => { await auth.startDemo(); });
    await act(async () => {
      if (when === 'during') finishSession({ data: { session: storedSession }, error: null });
      staleCallback('TOKEN_REFRESHED', storedSession);
    });
    expect(auth).toMatchObject({ isDemo: true, user: null });
    await act(async () => {
      await auth.signOut();
      if (when === 'after') finishSession({ data: { session: storedSession }, error: null });
      staleCallback('SIGNED_IN', storedSession);
    });
    expect(auth).toMatchObject({ isDemo: false, user: null, isAuthenticated: false });
  });
  it('does not enter demo when local credential cleanup fails and allows retry', async () => {
    await mount(); failRemove = true;
    await act(async () => { await expect(auth.startDemo()).rejects.toThrow('Secure storage unavailable'); });
    expect(auth.isDemo).toBe(false); expect(adapters.seed).not.toHaveBeenCalled();
    expect(storage.get('manager247.hr.v1.other-user')).toBe('preserve');
    failRemove = false;
    await act(async () => { await auth.startDemo(); });
    expect(auth.isDemo).toBe(true); expect(storage.has('qa-auth')).toBe(false);
  });
  it('allows logged-out demo without a logout request and accepts an explicit new login afterward', async () => {
    await adapters.client.auth.getSession();
    await adapters.client.auth.signOut({ scope: 'local' }); network.mockClear();
    await mount();
    await act(async () => { await auth.startDemo(); });
    await act(async () => { await auth.signOut(); });
    expect(network).not.toHaveBeenCalled();
    adapters.verifyCode.mockResolvedValue({ ...storedSession, user: { ...storedSession.user, id: 'new-user' } });
    await act(async () => { await auth.requestAccess('new@example.invalid'); await auth.verifyCode('new@example.invalid','123456'); });
    expect(adapters.requestCode).toHaveBeenCalled(); expect(auth.user?.id).toBe('new-user');
  });
  it('cancels pending demo entry when an explicit sign-out happens before seeding finishes', async () => {
    await mount();
    let finishSeed!: () => void;
    adapters.seed.mockImplementationOnce(() => new Promise<void>(resolve => { finishSeed = resolve; }));
    let entry!: Promise<void>;
    await act(async () => { entry = auth.startDemo(); await new Promise(resolve => setTimeout(resolve, 0)); });
    await act(async () => { await auth.signOut(); });
    await act(async () => { finishSeed(); await entry; });
    expect(auth).toMatchObject({ isDemo: false, user: null, isAuthenticated: false });
  });
  it('accepts Auth events from an explicit access link after leaving demo', async () => {
    const originalSubscribe = adapters.client.auth.onAuthStateChange.bind(adapters.client.auth);
    let callback: (event: string, session: Session) => void = () => undefined;
    vi.spyOn(adapters.client.auth, 'onAuthStateChange').mockImplementation((value: any) => { callback = value; return originalSubscribe(value); });
    await mount();
    await act(async () => { await auth.startDemo(); });
    await act(async () => { await auth.signOut(); });
    const next = { ...storedSession, user: { ...storedSession.user, id: 'link-user' } };
    vi.spyOn(adapters.client.auth, 'setSession').mockImplementation(async () => { callback('SIGNED_IN', next); return { data: { session: next, user: next.user }, error: null }; });
    await act(async () => { await auth.verifyLink('https://qa.example.invalid/#access_token=qa-next&refresh_token=qa-next-refresh'); });
    expect(auth.user?.id).toBe('link-user');
  });
  it('handles a new native email link after exit while ignoring links received inside demo', async () => {
    adapters.isWeb = false;
    const originalSubscribe = adapters.client.auth.onAuthStateChange.bind(adapters.client.auth);
    let callback: (event: string, session: Session) => void = () => undefined;
    vi.spyOn(adapters.client.auth, 'onAuthStateChange').mockImplementation((value: any) => { callback = value; return originalSubscribe(value); });
    const next = { ...storedSession, user: { ...storedSession.user, id: 'native-link-user' } };
    const exchange = vi.spyOn(adapters.client.auth, 'exchangeCodeForSession').mockImplementation(async () => { callback('SIGNED_IN', next); return { data: { session: next, user: next.user }, error: null }; });
    await mount();
    await act(async () => { await auth.startDemo(); });
    await act(async () => { adapters.link?.({ url: 'manager247://auth/callback?code=inside-demo' }); });
    expect(exchange).not.toHaveBeenCalled();
    await act(async () => { await auth.signOut(); });
    await act(async () => { adapters.link?.({ url: 'manager247://auth/callback?code=fresh-code' }); });
    expect(exchange).toHaveBeenCalledWith('fresh-code');
    expect(auth.user?.id).toBe('native-link-user');
  });
  it.each(['signOut', 'startDemo'] as const)('keeps normal Auth events enabled when %s fails before cleanup', async (action) => {
    const originalSubscribe = adapters.client.auth.onAuthStateChange.bind(adapters.client.auth);
    let callback: (event: string, session: Session) => void = () => undefined;
    vi.spyOn(adapters.client.auth, 'onAuthStateChange').mockImplementation((value: any) => { callback = value; return originalSubscribe(value); });
    await mount();
    vi.spyOn(adapters.client.auth, 'signOut').mockResolvedValueOnce({ error: new Error('cleanup unavailable') });
    await act(async () => { await expect(auth[action]()).rejects.toThrow('cleanup unavailable'); });
    const updated = { ...storedSession, user: { ...storedSession.user, email: 'updated@example.invalid' } };
    await act(async () => { callback('USER_UPDATED', updated); });
    expect(auth.user?.email).toBe('updated@example.invalid');
    expect(auth.isDemo).toBe(false);
  });
});
