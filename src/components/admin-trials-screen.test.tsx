import React from 'react';
import { act, create } from 'react-test-renderer';
import { beforeEach, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  user: { id: 'owner-a' } as { id: string } | null,
  authenticated: true, isAdmin: true, loading: false,
  rpc: vi.fn(),
}));
vi.mock('expo-router', () => ({ Redirect: 'Redirect', useRouter: () => ({ back: vi.fn(), replace: vi.fn() }) }));
vi.mock('react-native', () => ({ Text: 'Text', View: 'View', StyleSheet: { create: (x: unknown) => x }, Platform: { select: (options: { default: string }) => options.default } }));
vi.mock('@/components/ui', () => ({ AppButton: 'AppButton', Body: 'Body', BrandHeader: 'BrandHeader', Card: 'Card', Screen: 'Screen', Title: 'Title', LoadingState: 'LoadingState' }));
vi.mock('@/contexts/auth-context', () => ({ useAuth: () => ({ user: state.user, isAuthenticated: state.authenticated, isDemo: false, isLoading: state.loading }) }));
vi.mock('@/contexts/subscription-context', () => ({ useSubscription: () => ({ isAdmin: state.isAdmin, isLoading: false }) }));
vi.mock('@/contexts/locale-context', () => ({ useI18n: () => ({ locale: 'en' }) }));
vi.mock('@/lib/supabase', () => ({ supabase: { rpc: state.rpc } }));

import AdminTrialsScreen from '@/app/admin-trials';

beforeEach(() => {
  state.user = { id: 'owner-a' }; state.authenticated = true; state.isAdmin = true; state.loading = false;
  state.rpc.mockReset();
  state.rpc.mockResolvedValue({ data: [], error: null });
});

const tester = (email: string) => ({ user_id: email, verified_email: email, restaurant_name: 'Restaurant', started_at: '2026-11-01T12:00:00Z', expires_at: '2026-11-11T12:00:00Z', registered_at: null, last_sign_in_at: '2026-11-02T12:00:00Z', marketing_opt_in: false, status: 'active' });

it('does not mount the private data fetch for signed-out or non-admin users', async () => {
  for (const authorized of [false, true]) {
    state.authenticated = authorized; state.isAdmin = false;
    let tree: ReturnType<typeof create>;
    await act(async () => { tree = create(<AdminTrialsScreen />); });
    expect(tree!.toJSON()).toMatchObject({ type: 'Redirect', props: { href: authorized ? '/account' : '/sign-in' } });
    await act(async () => tree!.unmount());
  }
  expect(state.rpc).not.toHaveBeenCalled();
});

it('displays verified addresses and server authorization failures', async () => {
  state.rpc.mockResolvedValueOnce({ data: [tester('verified@example.com')], error: null });
  let tree: ReturnType<typeof create>;
  await act(async () => { tree = create(<AdminTrialsScreen />); });
  expect(JSON.stringify(tree!.toJSON())).toContain('verified@example.com');
  const refresh = tree!.root.findAll(node => node.props.label === 'Refresh')[0];
  state.rpc.mockResolvedValueOnce({ data: null, error: { message: 'Administrator access required' } });
  await act(async () => refresh.props.onPress());
  const output = JSON.stringify(tree!.toJSON());
  expect(output).toContain('Unable to load trial users');
  expect(output).not.toContain('verified@example.com');
  await act(async () => tree!.unmount());
});

it('clears old owner data immediately and ignores late responses when accounts change', async () => {
  let resolveOld!: (value: unknown) => void;
  state.rpc.mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; }));
  let tree: ReturnType<typeof create>;
  await act(async () => { tree = create(<AdminTrialsScreen />); });
  state.user = { id: 'owner-b' };
  state.rpc.mockResolvedValueOnce({ data: [tester('new-owner-data@example.com')], error: null });
  await act(async () => tree!.update(<AdminTrialsScreen />));
  await act(async () => resolveOld({ data: [tester('old-owner-data@example.com')], error: null }));
  const output = JSON.stringify(tree!.toJSON());
  expect(output).toContain('new-owner-data@example.com');
  expect(output).not.toContain('old-owner-data@example.com');
  await act(async () => tree!.unmount());
});

it('requests the next and previous pages without mixing rows', async () => {
  state.rpc.mockResolvedValueOnce({ data: Array.from({ length: 50 }, (_, index) => tester(`first-${index}@example.com`)), error: null });
  let tree: ReturnType<typeof create>;
  await act(async () => { tree = create(<AdminTrialsScreen />); });
  const next = tree!.root.findAll(node => node.props.label === 'Next')[0];
  expect(next.props.disabled).toBe(false);
  state.rpc.mockResolvedValueOnce({ data: [tester('next-page@example.com')], error: null });
  await act(async () => next.props.onPress());
  expect(state.rpc).toHaveBeenLastCalledWith('admin_list_trial_users', { p_limit: 50, p_offset: 50 });
  expect(JSON.stringify(tree!.toJSON())).toContain('next-page@example.com');
  expect(JSON.stringify(tree!.toJSON())).not.toContain('first-0@example.com');
  const previous = tree!.root.findAll(node => node.props.label === 'Previous')[0];
  await act(async () => previous.props.onPress());
  expect(state.rpc).toHaveBeenLastCalledWith('admin_list_trial_users', { p_limit: 50, p_offset: 0 });
  await act(async () => tree!.unmount());
});
