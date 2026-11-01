import React from 'react';
import { act, create } from 'react-test-renderer';
import { beforeEach, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ pathname: '/tools/hr', registered: false, eligible: true, loading: false, error: false, mounts: 0 }));
vi.mock('expo-router', () => ({ usePathname: () => state.pathname, Redirect: 'Redirect' }));
vi.mock('@/components/ui', () => ({ Screen: 'Screen', LoadingState: 'LoadingState', Card: 'Card', Body: 'Body', AppButton: 'AppButton' }));
vi.mock('@/contexts/auth-context', () => ({ useAuth: () => ({ isAuthenticated: true, isDemo: false, isLoading: false }) }));
vi.mock('@/contexts/locale-context', () => ({ useI18n: () => ({ locale: 'en' }) }));
vi.mock('@/contexts/trial-registration-context', () => ({ useTrialRegistration: () => ({ registration: { registered: state.registered, eligible: state.eligible }, isLoading: state.loading, error: state.error, reload: async () => {} }) }));
import { TrialRegistrationBoundary } from './trial-registration-boundary';
beforeEach(() => { vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); state.pathname = '/tools/hr'; state.registered = false; state.eligible = true; state.loading = false; state.error = false; state.mounts = 0; });
async function render() {
  function Workspace() { state.mounts++; return <>{'workspace'}</>; }
  let tree: ReturnType<typeof create>;
  await act(async () => { tree = create(<TrialRegistrationBoundary><Workspace /></TrialRegistrationBoundary>); });
  const result = tree!.toJSON(); await act(async () => tree!.unmount()); return result;
}
it('blocks direct operational, home and paywall routes before registration or workspace effects', async () => {
  for (const pathname of ['/tools/hr', '/recipe/new', '/', '/paywall', '/ingredients']) {
    state.pathname = pathname;
    expect(await render()).toMatchObject({ type: 'Redirect', props: { href: '/trial-registration' } });
  }
  expect(state.mounts).toBe(0);
});
it('keeps registration, legal information and account deletion reachable', async () => {
  for (const pathname of ['/trial-registration', '/terms', '/privacy', '/account', '/sign-in']) {
    state.pathname = pathname; expect(await render()).toBe('workspace');
  }
});
it('mounts eligible registered or existing paid accounts and holds unknown state', async () => {
  state.registered = true; expect(await render()).toBe('workspace');
  state.registered = false; state.eligible = false; expect(await render()).toBe('workspace');
  state.loading = true; expect(await render()).toMatchObject({ type: 'Screen' });
});
