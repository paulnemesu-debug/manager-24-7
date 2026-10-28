import React from 'react';
import { act, create } from 'react-test-renderer';
import { beforeEach, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ user: { id: 'test-user', email: 'qa@example.invalid' }, allowed: false, offline: false, profileError: true, subscriptionError: false, saved: vi.fn() }));
vi.mock('@/contexts/auth-context', () => ({ useAuth: () => ({ user: state.user, isAuthenticated: true, isDemo: false }) }));
vi.mock('@/lib/demo-access', () => ({ isOtpDemoAccount: () => false }));
vi.mock('@/lib/subscription-cache', async (original) => ({
  ...await original<object>(),
  readEntitlementSnapshot: async () => ({ status: 'active', isAdmin: false, isViewer: false, productId: 'pro', periodEnd: null, checkedAt: new Date().toISOString(), serverAllowed: true }),
  writeEntitlementSnapshot: (...args: unknown[]) => state.saved(...args),
}));
vi.mock('@/lib/supabase', () => ({ isDemoMode: false, supabase: {
  rpc: async () => ({ data: state.allowed, error: state.offline ? new Error('offline') : null }),
  from: (table: string) => {
    const query = { select: () => query, eq: () => query, limit: () => query, maybeSingle: async () => ({
      data: table === 'subscriptions' ? { status: 'expired', current_period_end: '2020-01-01' } : null,
      error: (table === 'profiles' && state.profileError) || (table === 'subscriptions' && state.subscriptionError) ? new Error('metadata offline') : null,
    }) };
    return query;
  },
} }));
import { SubscriptionProvider, useSubscription } from '@/contexts/subscription-context';

beforeEach(() => { state.allowed = false; state.offline = false; state.profileError = true; state.subscriptionError = false; state.saved.mockReset(); });
async function access() {
  let actual = false;
  function Probe() { actual = useSubscription().hasAccess; return null; }
  let tree: ReturnType<typeof create>;
  await act(async () => { tree = create(<SubscriptionProvider><Probe /></SubscriptionProvider>); });
  await act(async () => tree!.unmount());
  return actual;
}
it('persists an authoritative denial even if profile or subscription metadata fails', async () => {
  expect(await access()).toBe(false);
  expect(state.saved).toHaveBeenCalledWith('test-user', expect.objectContaining({ serverAllowed: false }));
  state.subscriptionError = true;
  expect(await access()).toBe(false);
});
it('retains a recent server grant only during an actual access-check failure', async () => {
  state.offline = true;
  expect(await access()).toBe(true);
});
