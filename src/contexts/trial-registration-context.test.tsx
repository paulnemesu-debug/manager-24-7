import React from 'react';
import { act, create } from 'react-test-renderer';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({
  user: { id: 'a', email: 'a@example.invalid' }, isDemo: false,
  subscription: { isLoading: false, hasAccess: false, isAdmin: false, productId: null as string | null, refresh: async () => {} },
  requests: [] as string[],
  rpc: async (_name: string): Promise<{ data: unknown; error: unknown }> => ({ data: { eligible: true, registered: false }, error: null }),
}));
vi.mock('@/contexts/auth-context', () => ({ useAuth: () => ({ user: state.user, isAuthenticated: true, isDemo: state.isDemo, isLoading: false }) }));
vi.mock('@/contexts/subscription-context', () => ({ useSubscription: () => state.subscription }));
vi.mock('@/contexts/locale-context', () => ({ useI18n: () => ({ locale: 'ro' }) }));
vi.mock('@/lib/supabase', () => ({ supabase: { rpc: (name: string) => { state.requests.push(`${state.user.id}:${name}`); return state.rpc(name); } } }));
import { TrialRegistrationProvider, useTrialRegistration } from './trial-registration-context';
const trees: ReturnType<typeof create>[] = [];
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  state.user = { id: 'a', email: 'a@example.invalid' }; state.isDemo = false;
  state.subscription = { isLoading: false, hasAccess: false, isAdmin: false, productId: null, refresh: async () => {} };
  state.requests = [];
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
