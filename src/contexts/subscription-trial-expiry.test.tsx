import React from 'react';
import { act, create } from 'react-test-renderer';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import type { EntitlementSnapshot } from '@/lib/subscription-cache';

const state = vi.hoisted(() => ({
  user: { id: 'individual-trial-user', email: 'tester@example.com' },
  offline: false, allowed: true, calls: [] as string[],
  subscription: { status: 'trialing', product_id: 'manager247_trial_10d', current_period_end: null as string | null },
  cached: null as EntitlementSnapshot | null,
}));
vi.mock('@/contexts/auth-context', () => ({ useAuth: () => ({ user: state.user, isAuthenticated: true, isDemo: false }) }));
vi.mock('@/lib/subscription-cache', async original => ({
  ...await original<object>(),
  readEntitlementSnapshot: async () => state.cached,
  writeEntitlementSnapshot: async () => undefined,
}));
vi.mock('@/lib/supabase', () => ({ isDemoMode: false, supabase: {
  rpc: async (name: string) => {
    state.calls.push(name);
    return { data: name === 'has_professional_access' ? state.allowed : [{ status: 'trialing', current_period_end: state.subscription.current_period_end }], error: state.offline ? new Error('offline') : null };
  },
  from: (table: string) => {
    const query = { select: () => query, eq: () => query, limit: () => query, maybeSingle: async () => ({
      data: table === 'subscriptions' ? state.subscription : table === 'profiles' ? { role: 'owner' } : null,
      error: null,
    }) };
    return query;
  },
} }));

import { SubscriptionProvider, useSubscription } from '@/contexts/subscription-context';

const now = new Date('2026-11-01T12:00:00.000Z').getTime();
const trees: ReturnType<typeof create>[] = [];
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
  vi.setSystemTime(now);
  state.user = { id: 'individual-trial-user', email: 'tester@example.com' };
  state.offline = false; state.allowed = true; state.calls = [];
  state.subscription = { status: 'trialing', product_id: 'manager247_trial_10d', current_period_end: new Date(now + 1000).toISOString() };
  state.cached = {
    status: 'trialing', isAdmin: false, isViewer: false, productId: 'manager247_trial_10d',
    periodEnd: state.subscription.current_period_end, checkedAt: new Date(now).toISOString(), serverAllowed: true,
  };
});
afterEach(async () => {
  await act(async () => { for (const tree of trees.splice(0)) tree.unmount(); });
  vi.useRealTimers(); vi.unstubAllGlobals();
});

async function renderTrial() {
  let actual: ReturnType<typeof useSubscription>;
  function Probe() { actual = useSubscription(); return null; }
  await act(async () => { trees.push(create(<SubscriptionProvider><Probe /></SubscriptionProvider>)); });
  return () => actual!;
}

it.each([false, true])('revokes an open individual trial at the exact server expiry, offline=%s', async offline => {
  state.offline = offline;
  const current = await renderTrial();
  expect(current().hasAccess).toBe(true);
  await act(async () => { await vi.advanceTimersByTimeAsync(999); });
  expect(current().hasAccess).toBe(true);
  await act(async () => { await vi.advanceTimersByTimeAsync(1); });
  expect(current().hasAccess).toBe(false);
  expect(current().plan).toBe('free');
});

it.each([false, true])('never restores an already expired individual trial from a fresh cache, offline=%s', async offline => {
  state.offline = offline;
  state.subscription.current_period_end = new Date(now).toISOString();
  state.cached!.periodEnd = state.subscription.current_period_end;
  const current = await renderTrial();
  expect(current().hasAccess).toBe(false);
  expect(current().plan).toBe('free');
});

it.each([null, '', 'invalid'])('denies individual trial access with an unusable server expiry %s', async deadline => {
  state.subscription.current_period_end = deadline;
  state.cached!.periodEnd = deadline;
  expect((await renderTrial())().hasAccess).toBe(false);
});

it('revokes an offline trial when its validation lease expires before the trial end', async () => {
  state.offline = true;
  state.subscription.current_period_end = new Date(now + 10_000).toISOString();
  state.cached!.periodEnd = state.subscription.current_period_end;
  state.cached!.checkedAt = new Date(now - 7 * 24 * 60 * 60 * 1000 + 999).toISOString();
  const current = await renderTrial();
  expect(current().hasAccess).toBe(true);
  await act(async () => { await vi.advanceTimersByTimeAsync(999); });
  expect(current().hasAccess).toBe(true);
  await act(async () => { await vi.advanceTimersByTimeAsync(1); });
  expect(current().hasAccess).toBe(false);
});

it.each(['tester@example.com', 'demo@paradim.ro'])('does not activate a trial from subscription refresh for %s', async email => {
  state.user.email = email;
  state.allowed = false;
  state.cached = null;
  const current = await renderTrial();
  expect(current().hasAccess).toBe(false);
  expect(state.calls).toEqual(['has_professional_access']);
});
