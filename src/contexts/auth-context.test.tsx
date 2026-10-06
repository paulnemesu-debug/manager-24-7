import { createElement, useEffect } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const adapters = vi.hoisted(() => ({
  locale: 'en',
  reset: vi.fn(async () => undefined),
  seed: vi.fn(async (_locale: string): Promise<void> => undefined),
  isolation: vi.fn(),
}));
vi.mock('@/contexts/locale-context', () => ({ useI18n: () => ({ locale: adapters.locale }) }));
vi.mock('@/lib/instant-demo', () => ({ resetInstantDemo: adapters.reset, seedInstantDemo: adapters.seed }));
vi.mock('@/lib/demo-isolation', () => ({ setInstantDemoIsolation: adapters.isolation }));
vi.mock('@/lib/supabase', () => ({ isDemoMode: false, isSupabaseConfigured: false, isWeb: true, supabase: null }));
vi.mock('@/lib/email-otp', () => ({ requestEmailCode: vi.fn(), verifyEmailCode: vi.fn() }));
vi.mock('expo-linking', () => ({}));
vi.mock('react-native', () => ({ Platform: { OS: 'web' }, AppState: {} }));

import { AuthProvider, useAuth } from './auth-context';

let renderer: ReactTestRenderer | undefined;
let auth: ReturnType<typeof useAuth>;
function Probe() {
  const currentAuth = useAuth();
  useEffect(() => { auth = currentAuth; }, [currentAuth]);
  return null;
}

beforeEach(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.clearAllMocks();
  adapters.locale = 'en';
  await act(async () => { renderer = create(createElement(AuthProvider, null, createElement(Probe))); });
});
afterEach(async () => {
  await act(async () => { renderer?.unmount(); });
  renderer = undefined;
  vi.unstubAllGlobals();
});

describe('instant demo authentication transition', () => {
  it('waits for localized data before entering isolated demo and restores normal mode on exit', async () => {
    let finishSeed!: () => void;
    adapters.seed.mockImplementationOnce(() => new Promise<void>((resolve) => { finishSeed = resolve; }));
    let entered!: Promise<void>;
    await act(async () => { entered = auth.startDemo(); await Promise.resolve(); });
    expect(adapters.reset).toHaveBeenCalledOnce();
    expect(adapters.seed).toHaveBeenCalledWith('en');
    expect(adapters.reset.mock.invocationCallOrder[0]).toBeLessThan(adapters.seed.mock.invocationCallOrder[0]);
    expect(adapters.isolation).not.toHaveBeenCalled();
    expect(auth.isDemo).toBe(false);
    expect(auth.isAuthenticated).toBe(false);

    await act(async () => { finishSeed(); await entered; });
    expect(adapters.isolation).toHaveBeenLastCalledWith(true);
    expect(auth.isDemo).toBe(true);
    expect(auth.user).toBeNull();
    await act(async () => { await auth.signOut(); });
    expect(adapters.isolation).toHaveBeenLastCalledWith(false);
    expect(auth.isDemo).toBe(false);
  });

  it('propagates storage failure without entering demo or changing isolation', async () => {
    adapters.seed.mockRejectedValueOnce(new Error('device full'));
    await act(async () => { await expect(auth.startDemo()).rejects.toThrow('device full'); });
    expect(adapters.isolation).not.toHaveBeenCalled();
    expect(auth.isDemo).toBe(false);
    expect(auth.isAuthenticated).toBe(false);
  });

  it('uses a language selected after the provider mounted', async () => {
    adapters.locale = 'ro';
    await act(async () => { renderer!.update(createElement(AuthProvider, null, createElement(Probe))); });
    await act(async () => { await auth.startDemo(); });
    expect(adapters.seed).toHaveBeenCalledWith('ro');
  });
});
