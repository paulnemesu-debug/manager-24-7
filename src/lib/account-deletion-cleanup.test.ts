import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

const state = vi.hoisted(() => ({
  storage: new Map<string, string>(), canceled: [] as string[], dismissed: [] as string[], order: [] as string[],
  cancelFails: false, markerFails: false, invokeFails: false, switchAccount: false, signedOut: [] as unknown[],
  currentUser: 'account-a', invokeOptions: null as unknown, confirmed: 0, platform: 'android',
  delayedKey: null as string | null, writeStarted: null as null | (() => void), writeGate: Promise.resolve(),
  cloudStarted: null as null | (() => void), cloudGate: Promise.resolve(),
}));
vi.mock('@react-native-async-storage/async-storage', () => ({ default: {
  getAllKeys: async () => [...state.storage.keys()],
  getItem: async (key: string) => state.storage.get(key) ?? null,
  setItem: async (key: string, value: string) => {
    if (key === state.delayedKey) {
      state.delayedKey = null; state.writeStarted?.(); await state.writeGate;
    }
    if (state.markerFails && key.startsWith('manager247.deleted-account.v1.')) throw new Error('Storage unavailable');
    state.order.push('write:' + key); state.storage.set(key, value);
  },
  multiGet: async (keys: string[]) => keys.map(key => [key, state.storage.get(key) ?? null]),
  multiRemove: async (keys: string[]) => { state.order.push('remove-local'); keys.forEach(key => state.storage.delete(key)); },
  removeItem: async (key: string) => { state.storage.delete(key); },
} }));
vi.mock('react-native', () => ({ Platform: { get OS() { return state.platform; } } }));
vi.mock('@/lib/supabase', () => ({ isDemoMode: false, isSupabaseConfigured: true, supabase: {
  from: () => ({ upsert: async () => { state.cloudStarted?.(); await state.cloudGate; return { error: null }; } }),
} }));
vi.mock('expo-notifications', () => ({
  cancelScheduledNotificationAsync: async (id: string) => { if (state.cancelFails) throw new Error('Native cancellation failed'); state.canceled.push(id); },
  dismissNotificationAsync: async (id: string) => { state.dismissed.push(id); },
}));
import { AccountCleanupError, cleanupDeletedAccountLocalData, deleteAccountAndCleanup, retryConfirmedAccountCleanup } from './account-deletion-cleanup';
import { writeWorkspaceCache } from './offline-workspace';
import { saveHaccpDocument } from './haccp-repository';
const userId = 'account-a';
const marker = `manager247.deleted-account.v1.${userId}`;
const ownKeys = [
  `professional_foodcost.workspace.v1.${userId}`, `professional_foodcost.sync_queue.v1.${userId}`,
  `professional_foodcost.entitlement.v1.${userId}`, `manager247.onboarding.v1.${userId}`,
  `manager247.production-plan.v1.${userId}`, `professional_foodcost.sales.2026-10-01.v1.${userId}`,
  `manager247.pnl_reports.recovery.v1.${userId}`,
];
const client = {
  auth: {
    getSession: async () => ({ data: { session: state.currentUser ? { user: { id: state.currentUser }, access_token: 'token-' + state.currentUser } : null }, error: null }),
    signOut: async (options: unknown) => { state.signedOut.push(options); state.currentUser = ''; return { error: null }; },
  },
  functions: { invoke: async (_name: string, options: unknown) => {
    state.order.push('remote-attempt'); state.invokeOptions = options;
    if (state.invokeFails) return { data: null, error: new Error('Remote deletion failed') };
    state.order.push('remote-confirmed'); if (state.switchAccount) state.currentUser = 'account-b';
    return { data: { success: true }, error: null };
  } },
} as unknown as SupabaseClient;
const confirmed = () => { state.confirmed++; };

beforeEach(() => {
  state.storage.clear(); state.canceled = []; state.dismissed = []; state.order = []; state.signedOut = [];
  state.cancelFails = false; state.markerFails = false; state.invokeFails = false; state.switchAccount = false; state.currentUser = userId;
  state.confirmed = 0; state.invokeOptions = null; state.platform = 'android';
  state.delayedKey = null; state.writeStarted = null; state.writeGate = Promise.resolve();
  state.cloudStarted = null; state.cloudGate = Promise.resolve();
  ownKeys.forEach(key => state.storage.set(key, 'saved-data'));
  state.storage.set('professional_foodcost.workspace.v1.account-b', 'other-account');
  state.storage.set('professional_foodcost.locale.v1', 'ro');
  state.storage.set(`professional_foodcost.haccp_reminder.entries.${userId}`, JSON.stringify([{ date: '2026-10-19', notificationId: 'own-haccp' }]));
  state.storage.set(`manager247.weekly_report_reminders.v1.${userId}`, JSON.stringify(['own-weekly']));
  state.storage.set(`manager247.haccp_autocontrol.notifications.v1.${userId}`, JSON.stringify([{ eventId: 'event-a', notificationId: 'own-auto' }]));
  state.storage.set('manager247.weekly_report_reminders.v1.account-b', JSON.stringify(['other-notification']));
});

describe('confirmed account deletion cleanup', () => {
  it('preserves all pending local data and sessions when the server does not confirm deletion', async () => {
    state.invokeFails = true; const before = [...state.storage.entries()];
    await expect(deleteAccountAndCleanup(client, userId, confirmed)).rejects.toThrow('Remote deletion failed');
    expect([...state.storage.entries()]).toEqual(before);
    expect(state.canceled).toEqual([]); expect(state.signedOut).toEqual([]); expect(state.confirmed).toBe(0);
  });
  it('cleans only the confirmed account and its notification IDs, preserving another account and app preferences', async () => {
    await deleteAccountAndCleanup(client, userId, confirmed);
    expect(ownKeys.every(key => !state.storage.has(key))).toBe(true);
    expect(state.storage.get('professional_foodcost.workspace.v1.account-b')).toBe('other-account');
    expect(state.storage.get('professional_foodcost.locale.v1')).toBe('ro');
    expect(state.storage.get('manager247.weekly_report_reminders.v1.account-b')).toBe('["other-notification"]');
    expect(state.canceled.sort()).toEqual(['own-auto', 'own-haccp', 'own-weekly']);
    expect(state.signedOut).toEqual([{ scope: 'local' }]);
    expect(state.order.indexOf('remove-local')).toBeGreaterThan(state.order.indexOf('remote-confirmed'));
    expect(state.invokeOptions).toMatchObject({ headers: { Authorization: 'Bearer token-account-a' } });
    expect(state.confirmed).toBe(1);
  });
  it('does not delete or sign out another account when the session changes before invocation', async () => {
    state.currentUser = 'account-b';
    await expect(deleteAccountAndCleanup(client, userId, confirmed)).rejects.toThrow();
    expect(state.order).toEqual([]); expect(state.signedOut).toEqual([]); expect(state.confirmed).toBe(0);
    expect(state.storage.has(ownKeys[0])).toBe(true);
  });
  it('does not sign out the new account if it changes while the server deletes the captured account', async () => {
    state.switchAccount = true;
    await deleteAccountAndCleanup(client, userId, confirmed);
    expect(state.signedOut).toEqual([]); expect(state.currentUser).toBe('account-b');
    expect(state.storage.get('professional_foodcost.workspace.v1.account-b')).toBe('other-account');
    expect(state.storage.has(ownKeys[0])).toBe(false);
  });
  it('distinguishes confirmed deletion from failed local cleanup and retries only confirmed work on startup', async () => {
    state.cancelFails = true;
    await expect(deleteAccountAndCleanup(client, userId, confirmed, 'en')).rejects.toBeInstanceOf(AccountCleanupError);
    expect(state.confirmed).toBe(1); expect(state.signedOut).toEqual([{ scope: 'local' }]);
    expect(state.storage.has(marker)).toBe(true);
    expect(state.storage.has(`professional_foodcost.haccp_reminder.entries.${userId}`)).toBe(true);
    expect(state.storage.has(ownKeys[0])).toBe(false);
    const remoteCalls = state.order.filter(x => x === 'remote-attempt').length;
    state.cancelFails = false;
    await retryConfirmedAccountCleanup(client);
    expect(state.canceled.sort()).toEqual(['own-auto', 'own-haccp', 'own-weekly']);
    expect(state.order.filter(x => x === 'remote-attempt')).toHaveLength(remoteCalls);
    expect(state.storage.has(`professional_foodcost.haccp_reminder.entries.${userId}`)).toBe(false);
  });
  it('will not clean an account without the durable server-confirmed marker', async () => {
    await expect(cleanupDeletedAccountLocalData(userId)).rejects.toThrow();
    expect(state.storage.has(ownKeys[0])).toBe(true); expect(state.canceled).toEqual([]);
  });
  it('does not promise an automatic retry if persisting the confirmation journal fails', async () => {
    state.cancelFails = true; state.markerFails = true;
    await expect(deleteAccountAndCleanup(client, userId, confirmed, 'en')).rejects.toMatchObject({
      name: 'AccountCleanupError', retryScheduled: false,
    });
    expect(state.confirmed).toBe(1); expect(state.signedOut).toEqual([{ scope: 'local' }]);
    expect(state.storage.has(marker)).toBe(false);
    expect(state.storage.has(`professional_foodcost.haccp_reminder.entries.${userId}`)).toBe(true);
  });
  it('reports incomplete cleanup if the durable tombstone cannot be saved even after data removal', async () => {
    state.markerFails = true;
    await expect(deleteAccountAndCleanup(client, userId, confirmed, 'en')).rejects.toMatchObject({
      name: 'AccountCleanupError', serverDeleted: true, retryScheduled: false,
    });
    expect(state.storage.has(ownKeys[0])).toBe(false);
    expect(state.confirmed).toBe(1);
  });
  it('does not touch native notifications on web', async () => {
    state.platform = 'web';
    await deleteAccountAndCleanup(client, userId, confirmed);
    expect(state.canceled).toEqual([]); expect(state.storage.has(ownKeys[0])).toBe(false);
  });
  it('retains deletion confirmation so a late real workspace save is cleaned on the next lifecycle retry', async () => {
    let release!: () => void;
    const started = new Promise<void>(resolve => { state.writeStarted = resolve; });
    state.writeGate = new Promise<void>(resolve => { release = resolve; });
    state.delayedKey = ownKeys[0];
    const save = writeWorkspaceCache(userId, [], []);
    await started;
    await deleteAccountAndCleanup(client, userId, confirmed);
    expect(state.storage.has(ownKeys[0])).toBe(false);
    release(); await save;
    // This is the actual repository writer completing after cleanup, not a
    // manually reinserted fixture. The account tombstone must outlive it.
    expect(state.storage.has(ownKeys[0])).toBe(true);
    await retryConfirmedAccountCleanup(client);
    expect(state.storage.has(ownKeys[0])).toBe(false);
    expect(state.storage.has(marker)).toBe(true);
    expect(state.storage.get('professional_foodcost.workspace.v1.account-b')).toBe('other-account');
    expect(state.order.filter(item => item === 'remote-attempt')).toHaveLength(1);
  });
  it('cleans a late real HACCP cloud acknowledgement after account deletion without another server request', async () => {
    let release!: () => void;
    const started = new Promise<void>(resolve => { state.cloudStarted = resolve; });
    state.cloudGate = new Promise<void>(resolve => { release = resolve; });
    const key = `professional_foodcost.haccp_documents.v1.${userId}`;
    const save = saveHaccpDocument(userId, { id: 'document-a', formCode: 'F01', headerValues: {}, rows: [],
      createdAt: '2026-10-19T00:00:00Z', updatedAt: '2026-10-19T00:00:00Z', syncState: 'pending', deletedAt: null });
    await started;
    await deleteAccountAndCleanup(client, userId, confirmed);
    release(); await save;
    expect(JSON.parse(state.storage.get(key)!)[0].syncState).toBe('synced');
    await retryConfirmedAccountCleanup(client);
    expect(state.storage.has(key)).toBe(false);
    expect(state.storage.has(marker)).toBe(true);
    expect(state.order.filter(item => item === 'remote-attempt')).toHaveLength(1);
  });
});
