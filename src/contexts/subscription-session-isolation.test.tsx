import React from 'react';
import { act, create } from 'react-test-renderer';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import type { EntitlementSnapshot } from '@/lib/subscription-cache';

const state = vi.hoisted(() => ({
  user: null as { id: string; email: string } | null,
  readCache: vi.fn<(userId: string) => Promise<EntitlementSnapshot | null>>(),
  writeCache: vi.fn<(userId: string, snapshot: EntitlementSnapshot) => Promise<void>>(),
  rpc: vi.fn<(name: string) => Promise<{ data: boolean; error: Error | null }>>(),
  reads: [] as { table: string; userId: string | undefined }[],
  persisted: new Map<string, EntitlementSnapshot>(),
}));

vi.mock('@/contexts/auth-context', () => ({
  useAuth: () => ({ user: state.user, isAuthenticated: Boolean(state.user), isDemo: false }),
}));
vi.mock('@/lib/subscription-cache', async (original) => ({
  ...await original<object>(),
  readEntitlementSnapshot: (userId: string) => state.readCache(userId),
  writeEntitlementSnapshot: (userId: string, snapshot: EntitlementSnapshot) => state.writeCache(userId, snapshot),
}));
vi.mock('@/lib/supabase', () => ({ isDemoMode: false, supabase: {
  rpc: (name: string) => state.rpc(name),
  from: (table: string) => {
    let userId: string | undefined;
    const query = {
      select: () => query,
      eq: (key: string, value: string) => {
        if (key === 'user_id' || key === 'member_user_id') userId = value;
        return query;
      },
      limit: () => query,
      maybeSingle: async () => {
        state.reads.push({ table, userId });
        const data = table === 'subscriptions'
          ? { status: 'active', product_id: `plan-${userId}`, current_period_end: null }
          : table === 'profiles' ? { role: userId === 'account-A' ? 'admin' : 'owner' } : null;
        return { data, error: null };
      },
    };
    return query;
  },
} }));

import { SubscriptionProvider, useSubscription } from '@/contexts/subscription-context';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

const trees: ReturnType<typeof create>[] = [];
const cachedGrant: EntitlementSnapshot = {
  status: 'active', isAdmin: true, isViewer: false, productId: 'cached-plan', periodEnd: null,
  checkedAt: new Date().toISOString(), serverAllowed: true,
};
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  state.user = { id: 'account-A', email: 'a@example.invalid' };
  state.reads = [];
  state.persisted.clear();
  state.readCache.mockReset().mockResolvedValue(null);
  state.writeCache.mockReset().mockImplementation(async (userId, snapshot) => {
    state.persisted.set(userId, snapshot);
  });
  state.rpc.mockReset().mockImplementation(async () => ({ data: state.user?.id === 'account-A', error: null }));
});
afterEach(async () => {
  await act(async () => { for (const tree of trees.splice(0)) tree.unmount(); });
  vi.unstubAllGlobals();
});

async function renderSubscription() {
  let actual: ReturnType<typeof useSubscription>;
  const observed: ReturnType<typeof useSubscription>[] = [];
  function Probe() { actual = useSubscription(); observed.push(actual); return null; }
  const element = () => <SubscriptionProvider><Probe /></SubscriptionProvider>;
  let tree!: ReturnType<typeof create>;
  await act(async () => { tree = create(element()); trees.push(tree); });
  return {
    current: () => actual!,
    observed,
    rerender: async () => { await act(async () => { tree.update(element()); }); },
    unmount: async () => { await act(async () => { tree.unmount(); }); trees.splice(trees.indexOf(tree), 1); },
  };
}

it.each(['account-B', null])('hides the old grant immediately when switching to %s before the next cache resolves', async (nextUserId) => {
  const view = await renderSubscription();
  expect(view.current()).toMatchObject({ isAdmin: true, hasAccess: true, productId: 'plan-account-A' });
  const nextCache = deferred<EntitlementSnapshot | null>();
  state.readCache.mockImplementation(() => nextCache.promise);
  state.user = nextUserId ? { id: nextUserId, email: 'b@example.invalid' } : null;
  const firstNextRender = view.observed.length;
  await view.rerender();
  for (const value of view.observed.slice(firstNextRender)) {
    expect(value).toMatchObject({ isAdmin: false, hasAccess: false, plan: 'free', productId: null });
  }
  if (nextUserId) expect(view.current().isLoading).toBe(true);
  await act(async () => { nextCache.resolve(null); });
});

it('ignores a cache read from the previous account before starting its network checks', async () => {
  const oldCache = deferred<EntitlementSnapshot | null>();
  state.readCache.mockImplementationOnce(() => oldCache.promise);
  const view = await renderSubscription();
  state.user = { id: 'account-B', email: 'b@example.invalid' };
  await view.rerender();
  state.rpc.mockClear();
  state.reads = [];
  state.writeCache.mockClear();
  await act(async () => {
    oldCache.resolve({ status: 'active', isAdmin: true, isViewer: false, productId: 'old-plan', periodEnd: null, checkedAt: new Date().toISOString(), serverAllowed: true });
  });
  expect(view.current()).toMatchObject({ isAdmin: false, hasAccess: false, productId: 'plan-account-B' });
  expect(state.rpc).not.toHaveBeenCalled();
  expect(state.reads).toEqual([]);
  expect(state.writeCache).not.toHaveBeenCalled();
});

it.each(['account-B', null])('ignores a previous account response after switching to %s', async (nextUserId) => {
  const oldAccess = deferred<{ data: boolean; error: null }>();
  state.rpc.mockImplementationOnce(() => oldAccess.promise);
  const view = await renderSubscription();
  state.user = nextUserId ? { id: nextUserId, email: 'b@example.invalid' } : null;
  await view.rerender();
  state.reads = [];
  state.writeCache.mockClear();
  await act(async () => { oldAccess.resolve({ data: true, error: null }); });
  expect(view.current()).toMatchObject({ isAdmin: false, hasAccess: false, plan: 'free' });
  expect(state.reads).toEqual([]);
  expect(state.writeCache).not.toHaveBeenCalled();
});

it('does not activate a previous demo account after its access check finishes', async () => {
  state.user = { id: 'account-A', email: 'demo@paradim.ro' };
  const oldAccess = deferred<{ data: boolean; error: null }>();
  state.rpc.mockImplementationOnce(() => oldAccess.promise);
  const view = await renderSubscription();
  state.user = { id: 'account-B', email: 'b@example.invalid' };
  await view.rerender();
  state.rpc.mockClear();
  await act(async () => { oldAccess.resolve({ data: false, error: null }); });
  expect(state.rpc).not.toHaveBeenCalled();
  expect(view.current().hasAccess).toBe(false);
});

it('keeps the newest refresh denial when an older grant finishes later', async () => {
  const oldAccess = deferred<{ data: boolean; error: null }>();
  state.rpc.mockImplementationOnce(() => oldAccess.promise);
  const view = await renderSubscription();
  state.rpc.mockResolvedValue({ data: false, error: null });
  await act(async () => { await view.current().refresh(); });
  state.writeCache.mockClear();
  state.reads = [];
  await act(async () => { oldAccess.resolve({ data: true, error: null }); });
  expect(view.current()).toMatchObject({ isAdmin: false, hasAccess: false, plan: 'free' });
  expect(state.persisted.get('account-A')?.serverAllowed).toBe(false);
  expect(state.writeCache).not.toHaveBeenCalled();
  expect(state.reads).toEqual([]);
});

it('persists a newer denial after an older grant write already in progress', async () => {
  const oldWrite = deferred<void>();
  state.writeCache.mockImplementationOnce(async (userId, snapshot) => {
    await oldWrite.promise;
    state.persisted.set(userId, snapshot);
  });
  const view = await renderSubscription();
  expect(view.current().hasAccess).toBe(true);
  state.rpc.mockResolvedValue({ data: false, error: null });
  let latestRefresh!: Promise<void>;
  await act(async () => { latestRefresh = view.current().refresh(); });
  expect(view.current().hasAccess).toBe(false);
  await act(async () => { oldWrite.resolve(); await latestRefresh; });
  expect(state.persisted.get('account-A')?.serverAllowed).toBe(false);
  expect(view.current().hasAccess).toBe(false);
});

it('keeps a validated denial ahead of old cache while persistence waits and another refresh fails', async () => {
  state.readCache.mockResolvedValue(cachedGrant);
  const oldWrite = deferred<void>();
  state.writeCache.mockImplementationOnce(async (userId, snapshot) => {
    await oldWrite.promise;
    state.persisted.set(userId, snapshot);
  });
  const view = await renderSubscription();
  state.rpc.mockResolvedValue({ data: false, error: null });
  let denialRefresh!: Promise<void>;
  await act(async () => { denialRefresh = view.current().refresh(); });
  expect(view.current().hasAccess).toBe(false);
  state.rpc.mockResolvedValue({ data: false, error: new Error('offline') });
  await act(async () => { await view.current().refresh(); });
  const afterOffline = view.current();
  await act(async () => { oldWrite.resolve(); await denialRefresh; });
  expect(afterOffline).toMatchObject({ isAdmin: false, hasAccess: false, plan: 'free' });
  expect(state.persisted.get('account-A')?.serverAllowed).toBe(false);
});

it('does not restore an old cached grant after denial persistence fails and the next refresh is offline', async () => {
  state.readCache.mockResolvedValue(cachedGrant);
  state.rpc.mockResolvedValue({ data: false, error: null });
  state.writeCache.mockRejectedValueOnce(new Error('device storage failed'));
  const view = await renderSubscription();
  expect(view.current().hasAccess).toBe(false);
  state.rpc.mockResolvedValue({ data: false, error: new Error('offline') });
  await act(async () => { await view.current().refresh(); });
  expect(view.current()).toMatchObject({ isAdmin: false, hasAccess: false, plan: 'free' });
});

it('retains an accepted server grant when the initial cache is empty and persistence fails', async () => {
  state.writeCache.mockRejectedValueOnce(new Error('device storage failed'));
  const view = await renderSubscription();
  expect(view.current()).toMatchObject({ isAdmin: true, hasAccess: true, plan: 'pro', productId: 'plan-account-A' });
});

it('ignores pending work and retained refresh callbacks after unmount', async () => {
  const oldAccess = deferred<{ data: boolean; error: null }>();
  state.rpc.mockImplementationOnce(() => oldAccess.promise);
  const view = await renderSubscription();
  const retainedRefresh = view.current().refresh;
  await view.unmount();
  state.reads = [];
  state.writeCache.mockClear();
  await act(async () => { oldAccess.resolve({ data: true, error: null }); });
  expect(state.reads).toEqual([]);
  expect(state.writeCache).not.toHaveBeenCalled();
  state.readCache.mockClear();
  state.rpc.mockClear();
  await retainedRefresh();
  expect(state.readCache).not.toHaveBeenCalled();
  expect(state.rpc).not.toHaveBeenCalled();
});
