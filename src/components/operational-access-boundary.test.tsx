import React from 'react';
import { act, create } from 'react-test-renderer';
import { beforeEach, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ pathname: '/tools/bulk', authenticated: true, allowed: false, loading: false, mounts: 0 }));
vi.mock('expo-router', () => ({ usePathname: () => state.pathname, Redirect: 'Redirect' }));
vi.mock('@/components/ui', () => ({ Screen: 'Screen', LoadingState: 'LoadingState' }));
vi.mock('@/contexts/auth-context', () => ({ useAuth: () => ({ isAuthenticated: state.authenticated, isLoading: state.loading }) }));
vi.mock('@/contexts/subscription-context', () => ({ useSubscription: () => ({ hasAccess: state.allowed, isLoading: false }) }));
import { OperationalAccessBoundary } from '@/components/operational-access-boundary';
beforeEach(() => { state.pathname = '/tools/bulk'; state.authenticated = true; state.allowed = false; state.loading = false; state.mounts = 0; });
async function render() {
  function Editor() { state.mounts++; return <>{'editor'}</>; }
  let tree: ReturnType<typeof create>;
  await act(async () => { tree = create(<OperationalAccessBoundary><Editor /></OperationalAccessBoundary>); });
  const result = tree!.toJSON();
  await act(async () => tree!.unmount());
  return result;
}
it('blocks expired users from every direct operational route before screen effects mount', async () => {
  for (const path of ['/tools/bulk', '/tools/hr', '/recipe/new', '/ingredient/123']) {
    state.pathname = path;
    expect(await render()).toMatchObject({ type: 'Redirect', props: { href: '/paywall' } });
  }
  expect(state.mounts).toBe(0);
});
it('blocks signed-out users and waits for access checks', async () => {
  state.authenticated = false;
  expect(await render()).toMatchObject({ props: { href: '/sign-in' } });
  state.loading = true;
  expect(await render()).toMatchObject({ type: 'Screen' });
  expect(state.mounts).toBe(0);
});
it('keeps account management reachable without a paid subscription', async () => {
  state.pathname = '/account';
  expect(await render()).toBe('editor');
});
it('mounts the operational editor for a server-authorized user', async () => {
  state.allowed = true;
  expect(await render()).toBe('editor');
});
