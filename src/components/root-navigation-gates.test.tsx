import React from 'react';
import { act, create } from 'react-test-renderer';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';

const state = vi.hoisted(() => ({
  pathname: '/', trialLoading: true, trialError: false, registered: false,
  authenticated: true, allowed: false, workspaceMounts: 0, providerMounts: 0,
  retries: 0, version: 0, redirects: 0,
  listeners: new Set<() => void>(), actions: [] as { name: string; target: string }[],
  routeRenders: [] as string[],
  navigation: null as unknown as { getRootState: () => unknown; dispatch: (action: unknown) => void },
}));
const require = createRequire(import.meta.url);
const core = require('expo-router/build/react-navigation/core');
const { StackRouter } = require('expo-router/build/react-navigation/routers');

// The path/action algorithms are real SDK57 code. Only the native entry point
// is replaced while loading them, so Node need not parse React Native Flow.
const Module = require('node:module');
const originalLoad = Module._load;
let routeInfo: (value: unknown) => { pathname: string };
try {
  Module._load = (name: string, parent: unknown, isMain: boolean) =>
    name === '../react-navigation/native' ? core : originalLoad.call(Module, name, parent, isMain);
  routeInfo = require('expo-router/build/global-state/getRouteInfoFromState').getRouteInfoFromState;
} finally {
  Module._load = originalLoad;
}

function Navigator(props: Record<string, unknown>) {
  const built = core.useNavigationBuilder(StackRouter, props);
  return React.createElement(built.NavigationContent, null,
    built.descriptors[built.state.routes[built.state.index].key].render());
}
const Outer = core.createNavigatorFactory(Navigator)();
const navigation = core.createNavigationContainerRef();

vi.mock('expo-router', async () => {
  const React = await import('react');
  const { createRequire } = await import('node:module');
  const require = createRequire(import.meta.url);
  const core = require('expo-router/build/react-navigation/core');
  const { StackRouter } = require('expo-router/build/react-navigation/routers');
  const { findDivergentState, getPayloadFromStateRoute } = require('expo-router/build/global-state/stateUtils');
  const subscribe = (listener: () => void) => { state.listeners.add(listener); return () => { state.listeners.delete(listener); }; };
  function Route() {
    const route = core.useRoute();
    state.routeRenders.push(route.name);
    return React.createElement('RouteContent', { name: route.name });
  }
  function Navigator(props: Record<string, unknown>) {
    const built = core.useNavigationBuilder(StackRouter, props);
    return React.createElement(built.NavigationContent, null,
      built.descriptors[built.state.routes[built.state.index].key].render());
  }
  const factory = core.createNavigatorFactory(Navigator)();
  function Stack(props: { children: React.ReactNode; layout?: unknown }) {
    return React.createElement(factory.Navigator, { ...props, initialRouteName: 'index' },
      React.Children.map(props.children, (child) => React.isValidElement<{ name: string }>(child)
        ? React.createElement(factory.Screen, { name: child.props.name, component: Route }) : null));
  }
  Stack.Screen = 'ScreenConfig';
  function Redirect({ href }: { href: string }) {
    React.useEffect(() => {
      // Expo queues router actions until after the navigation commit.
      let active = true;
      queueMicrotask(() => {
        if (!active) return;
        if (++state.redirects > 5) throw new Error('Unexpected redirect loop');
        const destination = { routes: [{ name: '__root', state: { routes: [{ name: href.slice(1) }] } }] };
        const split = findDivergentState(destination, state.navigation.getRootState());
        const payload = getPayloadFromStateRoute(split.actionStateRoute);
        const action = { type: 'REPLACE', target: split.navigationState.key,
          payload: { name: payload.screen, params: payload.params } };
        state.actions.push({ name: action.payload.name, target: action.target });
        state.navigation.dispatch(action);
      });
      return () => { active = false; };
    }, [href]);
    return null;
  }
  return { Stack, Redirect, usePathname: () => React.useSyncExternalStore(subscribe, () => state.pathname, () => state.pathname) };
});
vi.mock('expo-router/head', () => ({ default: () => null }));
vi.mock('expo-font', () => ({ useFonts: () => [true, null] }));
vi.mock('expo-splash-screen', () => ({ preventAutoHideAsync: async () => {}, hideAsync: async () => {} }));
vi.mock('@expo-google-fonts/manrope/400Regular', () => ({ Manrope_400Regular: 1 }));
vi.mock('@expo-google-fonts/manrope/500Medium', () => ({ Manrope_500Medium: 1 }));
vi.mock('@expo-google-fonts/manrope/600SemiBold', () => ({ Manrope_600SemiBold: 1 }));
vi.mock('@expo-google-fonts/manrope/700Bold', () => ({ Manrope_700Bold: 1 }));
vi.mock('@expo-google-fonts/manrope/800ExtraBold', () => ({ Manrope_800ExtraBold: 1 }));
vi.mock('react-native', () => ({ Appearance: {}, StyleSheet: { create: (value: unknown) => value }, View: 'View', Platform: { OS: 'android' } }));
vi.mock('react-native-gesture-handler', () => ({ GestureHandlerRootView: 'GestureRoot' }));
vi.mock('react-native-safe-area-context', () => ({ SafeAreaProvider: 'SafeAreaProvider' }));
vi.mock('@/lib/crash-reporting', () => ({ withCrashReporting: (component: unknown) => component }));
vi.mock('@/lib/client-errors', () => ({ installClientErrorHandler: () => () => {} }));
vi.mock('@/components/app-error-boundary', () => ({ AppErrorBoundary: 'ErrorBoundary' }));
vi.mock('@/components/platform-alerts', () => ({ PlatformAlerts: () => null }));
vi.mock('@/components/ui', () => ({ Screen: 'Screen', LoadingState: 'LoadingState', Card: 'Card', Body: 'Body', AppButton: 'AppButton' }));
vi.mock('@/contexts/locale-context', () => ({ LocaleProvider: 'LocaleProvider', useI18n: () => ({ locale: 'en', t: (key: string) => key }) }));
vi.mock('@/contexts/auth-context', async () => {
  const React = await import('react');
  return {
    AuthProvider: ({ children }: React.PropsWithChildren) => {
      React.useEffect(() => { state.providerMounts++; }, []);
      return children;
    },
    useAuth: () => ({ isAuthenticated: state.authenticated, isLoading: false, isDemo: false }),
  };
});
vi.mock('@/contexts/preferences-context', () => ({ PreferencesProvider: 'PreferencesProvider' }));
vi.mock('@/contexts/subscription-context', () => ({ SubscriptionProvider: 'SubscriptionProvider', useSubscription: () => ({ hasAccess: state.allowed, isLoading: false }) }));
vi.mock('@/contexts/trial-registration-context', async () => {
  const React = await import('react');
  const subscribe = (listener: () => void) => { state.listeners.add(listener); return () => { state.listeners.delete(listener); }; };
  return { TrialRegistrationProvider: 'TrialProvider', useTrialRegistration: () => {
    React.useSyncExternalStore(subscribe, () => state.version, () => state.version);
    return { isLoading: state.trialLoading, error: state.trialError,
      registration: { eligible: true, registered: state.registered },
      reload: async () => { state.retries++; } };
  } };
});
vi.mock('@/hooks/use-billing', () => ({ BillingProvider: 'BillingProvider' }));
vi.mock('@/contexts/workspace-context', () => ({ WorkspaceProvider: ({ children }: React.PropsWithChildren) => { state.workspaceMounts++; return children; } }));
import RootLayout from '@/app/_layout';

const trees: ReturnType<typeof create>[] = [];
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  Object.assign(state, { pathname: '/', trialLoading: true, trialError: false, registered: false,
    authenticated: true, allowed: false, workspaceMounts: 0, providerMounts: 0, retries: 0,
    version: 0, redirects: 0, actions: [], routeRenders: [], navigation });
  state.listeners.clear();
});
afterEach(async () => { await act(async () => trees.splice(0).forEach(tree => tree.unmount())); vi.unstubAllGlobals(); });
function notify() { state.version++; state.listeners.forEach(listener => listener()); }
function onStateChange(value: unknown) {
  const pathname = routeInfo(value).pathname;
  if (pathname !== state.pathname) { state.pathname = pathname; notify(); }
}
async function render() {
  let tree: ReturnType<typeof create>;
  const initialState = { routes: [{ name: '__root', state: { routes: [{ name: state.pathname === '/' ? 'index' : state.pathname.slice(1) }] } }] };
  await act(async () => {
    tree = create(<core.BaseNavigationContainer ref={navigation} initialState={initialState} onStateChange={onStateChange}>
      <Outer.Navigator id="__root"><Outer.Screen name="__root" component={RootLayout} /></Outer.Navigator>
    </core.BaseNavigationContainer>);
  });
  trees.push(tree!);
  return tree!;
}
const appState = () => navigation.getRootState()?.routes[0]?.state;

it('keeps the app navigator registered during trial loading inside the SDK57 outer navigator', async () => {
  const tree = await render();
  // SDK57 is ready even without the app navigator; readiness alone is insufficient.
  expect(navigation.isReady()).toBe(true);
  expect(appState()?.routeNames).toContain('trial-registration');
  expect(state.workspaceMounts).toBe(0);
  expect(tree.root.findAllByType('RouteContent' as never)).toHaveLength(0);
});
it('keeps retry available without mounting protected workspace content', async () => {
  state.trialLoading = false; state.trialError = true;
  const tree = await render();
  expect(appState()?.key).toBeTruthy();
  expect(state.workspaceMounts).toBe(0);
  await act(async () => { tree.root.findByType('AppButton' as never).props.onPress(); });
  expect(state.retries).toBe(1);
});
it('preserves the app navigator identity when trial state releases protected content', async () => {
  const tree = await render();
  const key = appState()?.key;
  expect(key).toBeTruthy();
  await act(async () => { state.trialLoading = false; state.registered = true; state.allowed = true; notify(); });
  expect(appState().key).toBe(key);
  expect(tree.root.findByType('RouteContent' as never).props.name).toBe('index');
});
it('reaches trial registration without replacing the outer root or remounting its providers', async () => {
  const tree = await render();
  const rootKey = navigation.getRootState().routes[0].key;
  const appKey = appState()?.key;
  await act(async () => { state.trialLoading = false; notify(); });
  expect(state.pathname).toBe('/trial-registration');
  expect(tree.root.findByType('RouteContent' as never).props.name).toBe('trial-registration');
  expect(state.actions).toEqual([{ name: 'trial-registration', target: appKey }]);
  expect(navigation.getRootState().routes[0].key).toBe(rootKey);
  expect(state.providerMounts).toBe(1);
  expect(state.redirects).toBe(1);
  expect(state.routeRenders).not.toContain('index');
});
it('redirects an expired operational deep link to paywall without rendering the protected screen', async () => {
  state.trialLoading = false; state.registered = true; state.pathname = '/tools/hr';
  const tree = await render();
  expect(state.pathname).toBe('/paywall');
  expect(tree.root.findByType('RouteContent' as never).props.name).toBe('paywall');
  expect(state.actions[0].name).toBe('paywall');
  expect(state.providerMounts).toBe(1);
  expect(state.routeRenders).not.toContain('tools/hr');
});

