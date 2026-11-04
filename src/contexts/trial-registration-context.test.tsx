import React from 'react';
import { act, create } from 'react-test-renderer';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({
  user: { id: 'a', email: 'a@example.invalid' }, isDemo: false,
  subscription: { isLoading: false, hasAccess: false, isAdmin: false, productId: null as string | null, refresh: async () => {} },
  requests: [] as string[],
  storage: new Map<string, string>(),
  sampleError: null as Error | null,
  rpc: async (_name: string): Promise<{ data: unknown; error: unknown }> => ({ data: { eligible: true, registered: false }, error: null }),
}));
vi.mock('@/contexts/auth-context', () => ({ useAuth: () => ({ user: state.user, isAuthenticated: true, isDemo: state.isDemo, isLoading: false }) }));
vi.mock('@/contexts/subscription-context', () => ({ useSubscription: () => state.subscription }));
vi.mock('@/contexts/locale-context', () => ({ useI18n: () => ({ locale: 'ro' }) }));
vi.mock('@/lib/supabase', () => ({ supabase: {
  rpc: (name: string) => { state.requests.push(`${state.user.id}:${name}`); return state.rpc(name); },
  from: () => ({ select: () => ({ eq: () => ({ limit: async () => ({ data: [{ user_id: state.user.id }], error: state.sampleError }) }) }) }),
} }));
vi.mock('@react-native-async-storage/async-storage', () => ({ default: {
  getItem: async (key: string) => state.storage.get(key) ?? null,
  setItem: async (key: string, value: string) => { state.storage.set(key, value); },
  removeItem: async (key: string) => { state.storage.delete(key); },
} }));
import { TrialRegistrationProvider, useTrialRegistration } from './trial-registration-context';
const trees: ReturnType<typeof create>[] = [];
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  state.user = { id: 'a', email: 'a@example.invalid' }; state.isDemo = false;
  state.subscription = { isLoading: false, hasAccess: false, isAdmin: false, productId: null, refresh: async () => {} };
  state.requests = [];
  state.storage.clear();
  state.sampleError = null;
  state.rpc = async () => ({ data: { registered: false, eligible: true }, error: null });
});
afterEach(async () => { await act(async () => { trees.splice(0).forEach((tree) => tree.unmount()); }); vi.unstubAllGlobals(); });
it('uses server registration rather than an existing local tour marker', async () => {
  let value: ReturnType<typeof useTrialRegistration>;
  function Probe() { value = useTrialRegistration(); return null; }
  await act(async () => { trees.push(create(<TrialRegistrationProvider><Probe /></TrialRegistrationProvider>)); });
  expect(value!.registration?.registered).toBe(false);
  expect(value!.registration?.eligible).toBe(true);
  expect(value!.isLoading).toBe(false);
});
it('does not display previous account eligibility while a new account check is pending', async () => {
  const responses: ((value: { data: unknown; error: null }) => void)[] = [];
  state.rpc = () => new Promise((resolve) => { responses.push(resolve); });
  let value: ReturnType<typeof useTrialRegistration>;
  const seen: (string | null)[] = [];
  function Probe() { value = useTrialRegistration(); seen.push(value.registration?.restaurant_name ?? null); return null; }
  let tree: ReturnType<typeof create>;
  await act(async () => { tree = create(<TrialRegistrationProvider><Probe /></TrialRegistrationProvider>); trees.push(tree); });
  state.user = { id: 'b', email: 'b@example.invalid' };
  await act(async () => { tree.update(<TrialRegistrationProvider><Probe /></TrialRegistrationProvider>); });
  await act(async () => { responses[0]({ data: { registered: false, eligible: false, restaurant_name: 'Account A' }, error: null }); });
  expect(value!.isLoading).toBe(true);
  expect(seen).not.toContain('Account A');
  await act(async () => { responses[1]({ data: { registered: false, eligible: true }, error: null }); });
  expect(value!.registration?.eligible).toBe(true);
});
it('keeps existing paid/admin accounts usable without the new registration service', async () => {
  state.subscription = { ...state.subscription, hasAccess: true, productId: 'paid_pro' };
  let value: ReturnType<typeof useTrialRegistration>;
  function Probe() { value = useTrialRegistration(); return null; }
  await act(async () => { trees.push(create(<TrialRegistrationProvider><Probe /></TrialRegistrationProvider>)); });
  expect(value!.isLoading).toBe(false);
  expect(value!.error).toBe(false);
  expect(value!.registration?.eligible).toBe(false);
  expect(state.requests).toHaveLength(0);
});
it('fails closed and exposes a retry if registration cannot be verified', async () => {
  state.rpc = async () => ({ data: null, error: new Error('offline') });
  let value: ReturnType<typeof useTrialRegistration>;
  function Probe() { value = useTrialRegistration(); return null; }
  await act(async () => { trees.push(create(<TrialRegistrationProvider><Probe /></TrialRegistrationProvider>)); });
  expect(value!.registration).toBe(null);
  expect(value!.error).toBe(true);
  state.rpc = async () => ({ data: { registered: false, eligible: true }, error: null });
  await act(async () => { await value.reload(); });
  expect(value!.registration?.registered).toBe(false);
  expect(value!.error).toBe(false);
});

it('restores only a previously verified active trial for the current account after an offline restart', async () => {
  let value: ReturnType<typeof useTrialRegistration>;
  function Probe() { value = useTrialRegistration(); return null; }
  const mount = async () => {
    let tree: ReturnType<typeof create>;
    await act(async () => { tree = create(<TrialRegistrationProvider><Probe /></TrialRegistrationProvider>); trees.push(tree); });
    return tree!;
  };
  state.subscription = { ...state.subscription, hasAccess: true, productId: 'manager247_trial_10d' };
  state.rpc = async () => ({ data: {
    registered: true, eligible: true, started_at: new Date(Date.now() - 60_000).toISOString(),
    expires_at: new Date(Date.now() + 60_000).toISOString(),
  }, error: null });
  const initial = await mount();
  expect(value!.registration?.registered).toBe(true);
  await act(async () => { initial.unmount(); });

  state.rpc = async () => ({ data: null, error: new Error('Network request failed') });
  const offline = await mount();
  expect(value!.registration?.registered).toBe(true);
  expect(value!.error).toBe(false);
  await act(async () => { offline.unmount(); });

  state.user = { id: 'b', email: 'b@example.invalid' };
  const otherAccount = await mount();
  expect(value!.registration).toBeNull();
  expect(value!.error).toBe(true);
  await act(async () => { otherAccount.unmount(); });

  state.user = { id: 'a', email: 'a@example.invalid' };
  state.subscription.hasAccess = false;
  const denied = await mount();
  expect(value!.registration).toBeNull();
  expect(value!.error).toBe(true);
  await act(async () => { denied.unmount(); });

  state.subscription.hasAccess = true;
  state.rpc = async () => ({ data: null, error: { code: '42501', message: 'permission denied' } });
  await mount();
  expect(value!.registration).toBeNull();
  expect(value!.error).toBe(true);
  state.rpc = async () => ({ data: null, error: new Error('Network request failed') });
  await act(async () => { await value!.reload(); });
  expect(value!.registration).toBeNull();
});

it('opens an online verified trial when an optional sample query fails', async () => {
  let value: ReturnType<typeof useTrialRegistration>;
  function Probe() { value = useTrialRegistration(); return null; }
  state.subscription = { ...state.subscription, hasAccess: true, productId: 'manager247_trial_10d' };
  state.sampleError = new Error('Network request failed');
  state.rpc = async () => ({ data: {
    registered: true, eligible: true, started_at: new Date(Date.now() - 60_000).toISOString(),
    expires_at: new Date(Date.now() + 60_000).toISOString(),
  }, error: null });
  await act(async () => { trees.push(create(<TrialRegistrationProvider><Probe /></TrialRegistrationProvider>)); });
  expect(value!.registration?.registered).toBe(true);
  expect(value!.error).toBe(false);
});

it('will not use an expired registration even if a trial entitlement is still present', async () => {
  let value: ReturnType<typeof useTrialRegistration>;
  function Probe() { value = useTrialRegistration(); return null; }
  state.subscription = { ...state.subscription, hasAccess: true, productId: 'manager247_trial_10d' };
  state.storage.set('manager247.trial-registration.v1.a', JSON.stringify({
    owner: 'a', startedAt: new Date(Date.now() - 120_000).toISOString(),
    expiresAt: new Date(Date.now() - 60_000).toISOString(),
  }));
  state.rpc = async () => ({ data: null, error: new Error('Network request failed') });
  await act(async () => { trees.push(create(<TrialRegistrationProvider><Probe /></TrialRegistrationProvider>)); });
  expect(value!.registration).toBeNull();
  expect(value!.error).toBe(true);
});
