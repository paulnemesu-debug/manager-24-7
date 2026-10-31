import React from 'react';
import { act, create } from 'react-test-renderer';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import type { SubscriptionStatus } from '@/contexts/subscription-context';
import type { EntitlementSnapshot } from '@/lib/subscription-cache';

const state = vi.hoisted(() => ({
  user: { id: 'test-user', email: 'qa@example.invalid' },
  allowed: false,
  offline: false,
  profileError: true,
  subscriptionError: false,
  subscription: { status: 'expired' as SubscriptionStatus, product_id: null as string | null, current_period_end: '2020-01-01' as string | null },
  cached: null as EntitlementSnapshot | null,
  saved: vi.fn(),
}));
vi.mock('@/contexts/auth-context', () => ({ useAuth: () => ({ user: state.user, isAuthenticated: true, isDemo: false }) }));
vi.mock('@/lib/subscription-cache', async (original) => ({
  ...await original<object>(),
  readEntitlementSnapshot: async () => state.cached,
  writeEntitlementSnapshot: (...args: unknown[]) => state.saved(...args),
}));
vi.mock('@/lib/supabase', () => ({ isDemoMode: false, supabase: {
  rpc: async () => ({ data: state.allowed, error: state.offline ? new Error('offline') : null }),
  from: (table: string) => {
    const query = { select: () => query, eq: () => query, limit: () => query, maybeSingle: async () => ({
      data: table === 'subscriptions' ? state.subscription : null,
      error: (table === 'profiles' && state.profileError) || (table === 'subscriptions' && state.subscriptionError) ? new Error('metadata offline') : null,
    }) };
    return query;
  },
} }));
import { SubscriptionProvider, useSubscription } from '@/contexts/subscription-context';

const now = new Date('2026-10-31T12:00:00.000Z').getTime();
const trees: ReturnType<typeof create>[] = [];

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
  vi.setSystemTime(now);
  state.user = { id: 'test-user', email: 'qa@example.invalid' };
  state.allowed = false;
  state.offline = false;
  state.profileError = true;
  state.subscriptionError = false;
  state.subscription = { status: 'expired', product_id: null, current_period_end: '2020-01-01' };
  state.cached = {
    status: 'active', isAdmin: false, isViewer: false, productId: 'pro', periodEnd: null,
    checkedAt: new Date(now).toISOString(), serverAllowed: true,
  };
  state.saved.mockReset();
});

afterEach(async () => {
  await act(async () => { for (const tree of trees.splice(0)) tree.unmount(); });
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function renderSubscription(onRead?: (value: ReturnType<typeof useSubscription>) => void) {
  let actual: ReturnType<typeof useSubscription>;
  function Probe() { actual = useSubscription(); onRead?.(actual); return null; }
  let tree: ReturnType<typeof create>;
  await act(async () => {
    tree = create(<SubscriptionProvider><Probe /></SubscriptionProvider>);
    trees.push(tree);
  });
  return { current: () => actual!, unmount: async () => { await act(async () => tree.unmount()); trees.splice(trees.indexOf(tree), 1); } };
}

function fixedDemo(periodEnd: string | null) {
  state.user.email = 'demo@paradim.ro';
  state.allowed = true;
  state.profileError = false;
  state.subscription = { status: 'trialing', product_id: 'manager247_demo_10d', current_period_end: periodEnd };
  state.cached = { ...state.cached!, status: 'trialing', productId: 'manager247_demo_10d', periodEnd };
}

it('persists an authoritative denial even if profile or subscription metadata fails', async () => {
  expect((await renderSubscription()).current().hasAccess).toBe(false);
  expect(state.saved).toHaveBeenCalledWith('test-user', expect.objectContaining({ serverAllowed: false }));
  state.subscriptionError = true;
  expect((await renderSubscription()).current().hasAccess).toBe(false);
});

it('retains a recent server grant only during an actual access-check failure', async () => {
  state.offline = true;
  expect((await renderSubscription()).current().hasAccess).toBe(true);
});

it.each([false, true])('denies fixed demo access and Pro at expiry when offline=%s', async (offline) => {
  fixedDemo('2026-10-31T12:00:00.000Z');
  state.offline = offline;
  const view = await renderSubscription();
  expect(view.current().hasAccess).toBe(false);
  expect(view.current().plan).toBe('free');
});

it.each([null, '', 'invalid'])('denies a server-allowed fixed demo with unusable expiry %s', async (periodEnd) => {
  fixedDemo(periodEnd);
  const view = await renderSubscription();
  expect(view.current().hasAccess).toBe(false);
  expect(view.current().plan).toBe('free');
});

it.each([false, true])('revokes an open fixed demo at the exact boundary when offline=%s', async (offline) => {
  fixedDemo('2026-10-31T12:00:01.000Z');
  state.offline = offline;
  const view = await renderSubscription();
  expect(view.current().hasAccess).toBe(true);
  expect(view.current().plan).toBe('pro');
  await act(async () => { await vi.advanceTimersByTimeAsync(999); });
  expect(view.current().hasAccess).toBe(true);
  await act(async () => { await vi.advanceTimersByTimeAsync(1); });
  expect(view.current().hasAccess).toBe(false);
  expect(view.current().plan).toBe('free');
});

it('revokes an open offline demo when its seven-day validation lease ends first', async () => {
  fixedDemo('2026-10-31T12:00:10.000Z');
  state.offline = true;
  state.cached!.checkedAt = new Date(now - 7 * 24 * 60 * 60 * 1000 + 999).toISOString();
  const view = await renderSubscription();
  expect(view.current().hasAccess).toBe(true);
  await act(async () => { await vi.advanceTimersByTimeAsync(999); });
  expect(view.current().hasAccess).toBe(true);
  await act(async () => { await vi.advanceTimersByTimeAsync(1); });
  expect(view.current().hasAccess).toBe(false);
  expect(view.current().plan).toBe('free');
});

it('revokes demo access if the deadline passes before the expiry effect starts', async () => {
  fixedDemo('2026-10-31T12:00:01.000Z');
  state.offline = true;
  const view = await renderSubscription((value) => {
    if (value.hasAccess) vi.setSystemTime(now + 1000);
  });
  expect(view.current().hasAccess).toBe(false);
  expect(view.current().plan).toBe('free');
});

it('replaces the demo expiry timer after a refresh', async () => {
  fixedDemo('2026-10-31T12:00:01.000Z');
  const view = await renderSubscription();
  expect(vi.getTimerCount()).toBe(1);
  state.subscription.current_period_end = '2026-10-31T12:00:02.000Z';
  await act(async () => { await view.current().refresh(); });
  expect(vi.getTimerCount()).toBe(1);
  await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
  expect(view.current().hasAccess).toBe(true);
  await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
  expect(view.current().hasAccess).toBe(false);
  expect(view.current().plan).toBe('free');
});

it('clears an active demo expiry timer on unmount', async () => {
  fixedDemo('2026-10-31T12:00:01.000Z');
  const view = await renderSubscription();
  expect(vi.getTimerCount()).toBe(1);
  await view.unmount();
  expect(vi.getTimerCount()).toBe(0);
});

it('clears the demo timer when refreshed as a paid subscription', async () => {
  fixedDemo('2026-10-31T12:00:01.000Z');
  const view = await renderSubscription();
  state.subscription = { status: 'active', product_id: 'pro', current_period_end: null };
  await act(async () => { await view.current().refresh(); });
  expect(vi.getTimerCount()).toBe(0);
  await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
  expect(view.current().hasAccess).toBe(true);
  expect(view.current().plan).toBe('pro');
});

it('keeps paid access compatible with an absent subscription expiry', async () => {
  state.allowed = true;
  state.profileError = false;
  state.subscription = { status: 'active', product_id: 'pro', current_period_end: null };
  const view = await renderSubscription();
  expect(view.current().hasAccess).toBe(true);
  expect(view.current().plan).toBe('pro');
  expect(vi.getTimerCount()).toBe(0);
});
