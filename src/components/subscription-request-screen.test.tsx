import React from 'react';
import { act, create } from 'react-test-renderer';
import { beforeEach, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ platform: 'web', locale: 'en' as 'en' | 'ro', links: [] as string[], browsers: [] as string[] }));
vi.mock('react-native', () => ({
  Text: 'Text', View: 'View', Alert: { alert: vi.fn() }, StyleSheet: { create: (value: unknown) => value },
  Platform: { get OS() { return state.platform; }, select: (value: { default: unknown }) => value.default },
  Linking: { openURL: async (url: string) => { state.links.push(url); } },
}));
vi.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }));
vi.mock('expo-linear-gradient', () => ({ LinearGradient: 'LinearGradient' }));
vi.mock('expo-router', () => ({ Redirect: 'Redirect', useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));
vi.mock('expo-web-browser', () => ({ openBrowserAsync: async (url: string) => { state.browsers.push(url); } }));
vi.mock('@/components/ui', () => ({ AppButton: 'AppButton', BrandHeader: 'BrandHeader', Card: 'Card', Screen: 'Screen', Subtitle: 'Subtitle', Title: 'Title' }));
vi.mock('@/contexts/auth-context', () => ({ useAuth: () => ({ isAuthenticated: true, isLoading: false, user: { id: 'trial-user', email: 'private-tester@example.invalid' }, signOut: async () => {} }) }));
vi.mock('@/contexts/subscription-context', () => ({ useSubscription: () => ({ isLoading: false, hasAccess: false, refresh: async () => {} }) }));
vi.mock('@/hooks/use-billing', async () => await import('@/hooks/use-billing.web'));
vi.mock('@/contexts/locale-context', async () => {
  const { translate } = await import('@/i18n/translations');
  return { useI18n: () => ({ locale: state.locale, t: (key: Parameters<typeof translate>[1], values?: Record<string, string | number>) => translate(state.locale, key, values) }) };
});
import PaywallScreen from '@/app/paywall';
beforeEach(() => { vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); state.platform = 'web'; state.locale = 'en'; state.links = []; state.browsers = []; });
it.each(['web', 'android', 'ios'])('opens only the fixed subscription-request mail composer on %s without exposing the signed-in email', async (platform) => {
  state.platform = platform;
  let tree: ReturnType<typeof create>;
  await act(async () => { tree = create(<PaywallScreen />); });
  const request = tree!.root.findAllByType('AppButton' as never).find((button) => button.props.icon === 'open-outline')!;
  await act(async () => { request.props.onPress(); });
  expect(state.links).toEqual(['mailto:admin@paradimoperations.com?subject=Manager24%2F7%20subscription%20request']);
  expect(state.links[0]).not.toContain('private-tester');
  expect(state.links[0]).not.toContain('email=');
  expect(state.links[0]).not.toContain('foodcost-pro');
  expect(state.browsers).toEqual([]);
  await act(async () => tree!.unmount());
});
it.each(['ro', 'en'] as const)('shows an honest manual-request CTA and no normal-web Google Play error in %s', async (locale) => {
  state.locale = locale;
  let tree: ReturnType<typeof create>;
  await act(async () => { tree = create(<PaywallScreen />); });
  const request = tree!.root.findAllByType('AppButton' as never).find((button) => button.props.icon === 'open-outline')!;
  expect(request.props.label).toBe(locale === 'ro' ? 'Solicită abonament' : 'Request subscription');
  const output = JSON.stringify(tree!.toJSON());
  expect(output).not.toContain('Google Play');
  expect(output).toContain(locale === 'ro' ? 'activarea procesatorului' : 'processor is activated');
  expect(output).toContain('99');
  expect(output).toContain('990');
  await act(async () => tree!.unmount());
});
