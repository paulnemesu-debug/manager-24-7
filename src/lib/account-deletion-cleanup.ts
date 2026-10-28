import AsyncStorage from '@react-native-async-storage/async-storage';
import type { SupabaseClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

import { accountLocalModule } from '@/lib/account-snapshot';
import { withStorageLock } from '@/lib/storage-lock';

const confirmationPrefix = 'manager247.deleted-account.v1.';
const confirmationKey = (userId: string) => confirmationPrefix + userId;
const validUserId = (userId: string) => Boolean(userId.trim()) && userId !== 'demo';
const notificationKeys = (userId: string) => [
  `professional_foodcost.haccp_reminder.entries.${userId}`,
  `manager247.haccp_autocontrol.notifications.v1.${userId}`,
  `manager247.weekly_report_reminders.v1.${userId}`,
];

export class AccountCleanupError extends Error {
  readonly serverDeleted = true;

  constructor(locale: 'ro' | 'en' = 'ro', readonly retryScheduled = true) {
    const detail = locale === 'ro'
      ? 'Contul a fost șters. Curățarea acestui dispozitiv nu a putut fi confirmată complet. Unele date locale sau notificări pot rămâne.'
      : 'Your account was deleted. Cleanup on this device could not be fully confirmed. Some local data or notifications may remain.';
    const retry = retryScheduled
      ? locale === 'ro'
        ? 'Curățarea va fi reîncercată la următoarea deschidere a aplicației.'
        : 'Cleanup will retry the next time you open the app.'
      : locale === 'ro'
        ? 'Reîncercarea automată nu a putut fi salvată. Contactați asistența pentru a finaliza curățarea locală.'
        : 'Automatic cleanup could not be scheduled. Contact support to finish local cleanup.';
    super(`${detail} ${retry}`);
    this.name = 'AccountCleanupError';
  }
}

async function isConfirmed(userId: string) {
  if (!validUserId(userId)) return false;
  const raw = await AsyncStorage.getItem(confirmationKey(userId));
  try { return raw !== null && JSON.parse(raw)?.confirmed === true; } catch { return false; }
}

function ownsKey(key: string, userId: string) {
  return Boolean(accountLocalModule(key, userId))
    || key === `professional_foodcost.entitlement.v1.${userId}`
    || key === `manager247.onboarding.v1.${userId}`;
}

async function performCleanup(userId: string) {
  const keys = (await AsyncStorage.getAllKeys()).filter(key => ownsKey(key, userId));
  const registryKeys = notificationKeys(userId).filter(key => keys.includes(key));
  const retained = new Set<string>();
  if (Platform.OS !== 'web' && registryKeys.length) {
    try {
      const Notifications = await import('expo-notifications');
      for (const key of registryKeys) {
        try {
          const raw = await AsyncStorage.getItem(key);
          const entries: unknown = raw === null ? [] : JSON.parse(raw);
          if (!Array.isArray(entries)) throw new Error('Invalid notification registry');
          const ids = entries.map(entry => typeof entry === 'string' ? entry
            : entry && typeof entry === 'object' && 'notificationId' in entry ? entry.notificationId : null);
          if (ids.some(id => typeof id !== 'string' || !id)) throw new Error('Invalid notification identifier');
          for (const id of new Set(ids as string[])) {
            await Notifications.cancelScheduledNotificationAsync(id);
            await Notifications.dismissNotificationAsync(id);
          }
        } catch {
          // Preserve just the failed registry so startup can retry its exact IDs.
          // Never cancel all notifications: another account may use this device.
          retained.add(key);
        }
      }
    } catch {
      registryKeys.forEach(key => retained.add(key));
    }
  }
  const removable = keys.filter(key => !retained.has(key));
  if (removable.length) await AsyncStorage.multiRemove(removable);
  if (retained.size) throw new Error('Account notification cleanup is pending');
  // Keep the confirmed-deletion tombstone. Auth changes do not cancel writes
  // already awaiting storage/network responses, and those use repository locks,
  // not this cleanup lock. A late write must still be removable on the next
  // startup/foreground retry, even when this pass removed every visible key.
}

/** This entry point cannot erase unsynced data without a prior server confirmation. */
export async function cleanupDeletedAccountLocalData(userId: string): Promise<void> {
  return withStorageLock('account-cleanup:' + userId, async () => {
    if (!await isConfirmed(userId)) throw new Error('Account deletion has not been confirmed');
    await performCleanup(userId);
  });
}

async function signOutDeletedSession(client: SupabaseClient | null | undefined, userId: string) {
  if (!client) return;
  const { data, error } = await client.auth.getSession();
  if (error) throw error;
  if (data.session?.user.id !== userId) return;
  const result = await client.auth.signOut({ scope: 'local' });
  if (result.error) throw result.error;
}

/** Retry only previously confirmed deletions; this never calls the deletion endpoint. */
export async function retryConfirmedAccountCleanup(client?: SupabaseClient | null): Promise<void> {
  const keys = await AsyncStorage.getAllKeys();
  for (const key of keys.filter(key => key.startsWith(confirmationPrefix))) {
    const userId = key.slice(confirmationPrefix.length);
    try {
      if (!await isConfirmed(userId)) continue;
      await signOutDeletedSession(client, userId);
      await cleanupDeletedAccountLocalData(userId);
    } catch {
      // Leave the confirmation and any failed notification identifiers for retry.
    }
  }
}

export async function deleteAccountAndCleanup(
  client: SupabaseClient,
  userId: string,
  confirmed: () => void,
  locale: 'ro' | 'en' = 'ro',
): Promise<void> {
  const { data: sessionData, error: sessionError } = await client.auth.getSession();
  if (sessionError) throw sessionError;
  const session = sessionData.session;
  if (!validUserId(userId) || session?.user.id !== userId || !session.access_token) throw new Error('Account session changed. Please try again.');
  const { data, error } = await client.functions.invoke<{ success: boolean; message?: string }>('delete-account', {
    // Keep this request bound to the account the user confirmed even if another
    // tab changes the current session while the network request is in flight.
    headers: { Authorization: `Bearer ${session.access_token}` },
  });
  if (error) throw error;
  if (!data?.success) throw new Error(data?.message ?? 'Account deletion was not confirmed');
  confirmed();
  const marker = JSON.stringify({ confirmed: true });
  await AsyncStorage.setItem(confirmationKey(userId), marker).catch(() => undefined);
  const results = await Promise.allSettled([
    signOutDeletedSession(client, userId),
    withStorageLock('account-cleanup:' + userId, () => performCleanup(userId)),
  ]);
  let retryScheduled = await isConfirmed(userId).catch(() => false);
  if (!retryScheduled) {
    // Cleanup may have freed enough space for a previously rejected journal write.
    await AsyncStorage.setItem(confirmationKey(userId), marker).catch(() => undefined);
    retryScheduled = await isConfirmed(userId).catch(() => false);
  }
  if (results.some(result => result.status === 'rejected') || !retryScheduled) {
    throw new AccountCleanupError(locale, retryScheduled);
  }
}
