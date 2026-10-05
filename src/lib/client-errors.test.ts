import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ storage: new Map<string, string>(), userId: 'one', fail: false, rows: [] as unknown[] }));
vi.mock('@react-native-async-storage/async-storage', () => ({ default: {
  getItem: async (key: string) => state.storage.get(key) ?? null,
  setItem: async (key: string, value: string) => { state.storage.set(key, value); },
  removeItem: async (key: string) => { state.storage.delete(key); },
} }));
vi.mock('expo-constants', () => ({ default: { expoConfig: { version: '1.5.3' } } }));
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
  it('strips message data, URLs and stack arguments', () => {
    const error = new TypeError('private ingredient price and access-token');
    error.stack = 'TypeError: private-message\n at RecipeEditor (https://example.com/?token=secret:1:2)\n at calculateCost (name=private)';
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
