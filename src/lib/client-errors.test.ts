import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ storage: new Map<string, string>(), userId: 'one', fail: false, rows: [] as unknown[] }));
vi.mock('@react-native-async-storage/async-storage', () => ({ default: {
  getItem: async (key: string) => state.storage.get(key) ?? null,
  setItem: async (key: string, value: string) => { state.storage.set(key, value); },
  removeItem: async (key: string) => { state.storage.delete(key); },
} }));
vi.mock('expo-constants', () => ({ default: { expoConfig: { version: '1.6.7', android: { versionCode: 69 } } } }));
vi.mock('react-native', () => ({ Platform: { OS: 'android' } }));
vi.mock('@/lib/supabase', () => ({ isDemoMode: false, supabase: {
  auth: { getSession: async () => ({ data: { session: { user: { id: state.userId } } } }) },
  from: () => ({ insert: async (rows: unknown[]) => {
    if (state.fail) return { error: new Error('offline') };
    state.rows.push(...rows); return { error: null };
  } }),
} }));
import { flushClientErrors, installClientErrorHandler, reportClientError, sanitiseClientError } from '@/lib/client-errors';

beforeEach(() => { state.storage.clear(); state.rows = []; state.fail = false; state.userId = 'one'; });

describe('central JavaScript diagnostics', () => {
  it('never treats a multiline exception message as JavaScript function frames', () => {
    const error = new Error('Service failed for account:\n at privateCustomerIdentifier (sensitive-message-content)');
    error.stack = error.name + ': ' + error.message + '\n at componentDidUpdate (bundle:1:2)';
    for (const componentStack of ['', '\n at KeyboardAvoidingView (bundle:3:4)']) {
      const result = sanitiseClientError(error, 'render', false, componentStack);
      expect(result.jsFrames).toBe('componentDidUpdate');
      expect(JSON.stringify(result)).not.toMatch(/privateCustomer|sensitive-message|Service failed/);
    }
  });
  it('does not extract frames from an unsupported JavaScript stack format', () => {
    const error = new Error('private details');
    error.stack = 'unknown heading\n at privateCustomerIdentifier (private data)';
    const result = sanitiseClientError(error, 'render');
    expect(result.jsFrames).toBe('');
    expect(result.frames).toBe('');
  });
  it.each([
    ['Maximum update depth exceeded. Private restaurant name', 'REACT_UPDATE_DEPTH'],
    ['Too many re-renders. React limits the number of renders to prevent an infinite loop.', 'REACT_RENDER_LOOP'],
    ['Attempted to navigate before mounting the Root Layout component.', 'ROUTER_NOT_MOUNTED'],
    ["Couldn't find a navigation object. Is your component inside NavigationContainer?", 'ROUTER_CONTEXT'],
    ['Expected the first route to be __root, but got private-route', 'ROUTER_ROOT_STATE'],
    ['Text strings must be rendered within a <Text> component.', 'NATIVE_TEXT_CHILD'],
    ['Exception in HostFunction: private account details', 'NATIVE_HOST_EXCEPTION'],
    ['Private restaurant name and access-token', 'UNCLASSIFIED'],
  ])('classifies a known runtime failure without exporting its message (%s)', (message, code) => {
    const result = sanitiseClientError(new Error(message), 'render');
    expect(result).toMatchObject({ code });
    expect(JSON.stringify(result)).not.toMatch(/Private|private|access-token|restaurant/);
  });
  it('retains separate JavaScript function frames and the installed build for diagnosis', async () => {
    const error = new Error('Maximum update depth exceeded. private details');
    error.stack = error.name + ': ' + error.message + '\n at checkForNestedUpdates (https://private.example/?token=secret:1:2)\n at componentDidUpdate (private=argument)';
    await reportClientError(error, 'render', false, '\n at KeyboardAvoidingView (private-path:1:2)');
    expect(state.rows).toEqual([expect.objectContaining({
      app_version: '1.6.7', properties: expect.objectContaining({
        code: 'REACT_UPDATE_DEPTH', appBuild: '69', frames: 'KeyboardAvoidingView',
        jsFrames: 'checkForNestedUpdates > componentDidUpdate',
      }),
    })]);
    expect(JSON.stringify(state.rows)).not.toMatch(/private|token|secret|https/);
  });
  it('strips message data, URLs and stack arguments', () => {
    const error = new TypeError('private ingredient price and access-token');
    error.stack = error.name + ': ' + error.message + '\n at RecipeEditor (https://example.com/?token=secret:1:2)\n at calculateCost (name=private)';
    const result = sanitiseClientError(error, 'render');
    expect(result.frames).toBe('RecipeEditor > calculateCost');
    expect(JSON.stringify(result)).not.toMatch(/private|token|https|secret/);
    expect(result.kind).toBe('TypeError');
  });
  it('retains offline errors, retries centrally and keeps other accounts separate', async () => {
    state.fail = true;
    await Promise.all([reportClientError(new Error('secret-a'), 'render'), reportClientError(new RangeError('secret-b'), 'render')]);
    expect(JSON.parse(state.storage.get('manager247.client_errors.v1.one')!)).toHaveLength(2);
    state.storage.set('manager247.client_errors.v1.two', '[{"id":"other"}]');
    state.fail = false;
    await flushClientErrors('one');
    expect(state.rows).toHaveLength(2);
    expect(JSON.stringify(state.rows)).not.toContain('secret');
    expect(state.storage.has('manager247.client_errors.v1.one')).toBe(false);
    expect(state.storage.has('manager247.client_errors.v1.two')).toBe(true);
  });
  it('preserves and restores the original JavaScript error handler', () => {
    const original = vi.fn(); let handler = original as (error: Error, fatal?: boolean) => void;
    const runtime = globalThis as typeof globalThis & { ErrorUtils?: unknown };
    runtime.ErrorUtils = { getGlobalHandler: () => handler, setGlobalHandler: (next: typeof handler) => { handler = next; } };
    const uninstall = installClientErrorHandler();
    const error = new Error('private'); handler(error, true);
    expect(original).toHaveBeenCalledWith(error, true);
    uninstall(); expect(handler).toBe(original);
    delete runtime.ErrorUtils;
  });
});
