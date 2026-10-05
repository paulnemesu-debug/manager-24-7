/**
 * MANAGER 24/7™ by PARADIM — proprietary software.
 * Copyright © 2026 PARADIM Operations SRL. All rights reserved.
 * Concept author and product director: Marius Paul Nemeșu.
 * See LICENSE-PROPRIETARY.md.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

import type { Locale } from '@/i18n/translations';
import type { HaccpAutocontrolEvent, HaccpAutocontrolType } from '@/types/haccp-autocontrol';

const CHANNEL_ID = 'haccp-autocontrol';
const MAX_SCHEDULED = 64;
const keyFor = (userId: string) => `manager247.haccp_autocontrol.notifications.v1.${userId}`;
type NotificationsModule = typeof import('expo-notifications');
type ScheduledEntry = { eventId: string; reminderAt: string; notificationId: string };

const LABELS: Record<Locale, Record<HaccpAutocontrolType, string>> = {
  ro: { food_sample: 'Probă alimentară', hygiene_test: 'Test de igienă', water_test: 'Test de apă' },
  en: { food_sample: 'Food sample', hygiene_test: 'Hygiene test', water_test: 'Water test' },
};

async function loadNotifications(): Promise<NotificationsModule> {
  return import('expo-notifications');
}

async function readEntries(userId: string): Promise<ScheduledEntry[]> {
  try {
    const value = await AsyncStorage.getItem(keyFor(userId));
    const parsed = value ? JSON.parse(value) as unknown : [];
    return Array.isArray(parsed) ? parsed.filter((entry): entry is ScheduledEntry => (
      Boolean(entry && typeof entry === 'object'
        && typeof (entry as ScheduledEntry).eventId === 'string'
        && typeof (entry as ScheduledEntry).reminderAt === 'string'
        && typeof (entry as ScheduledEntry).notificationId === 'string')
    )) : [];
  } catch {
    return [];
  }
}

async function configure(Notifications: NotificationsModule, locale: Locale) {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: locale === 'ro' ? 'Calendar autocontrol HACCP' : 'HACCP self-check calendar',
      importance: Notifications.AndroidImportance.HIGH,
      sound: 'default',
    });
  }
}

export async function syncAutocontrolNotifications(
  userId: string,
  events: readonly HaccpAutocontrolEvent[],
  locale: Locale,
  requestPermission = false,
) {
  const candidates = events
    .filter((event) => event.status === 'scheduled' && event.reminderAt)
    .filter((event) => new Date(event.reminderAt!).getTime() > Date.now())
    .sort((left, right) => left.reminderAt!.localeCompare(right.reminderAt!))
    .slice(0, MAX_SCHEDULED);
  const saved = await readEntries(userId);
  if (!candidates.length && !saved.length) return true;

  const Notifications = await loadNotifications();
  await configure(Notifications, locale);
  let permission = await Notifications.getPermissionsAsync();
  if (!permission.granted && requestPermission) permission = await Notifications.requestPermissionsAsync();
  if (!permission.granted) return false;

  const desired = new Map(candidates.map((event) => [event.id, event]));
  const retained: ScheduledEntry[] = [];
  for (const entry of saved) {
    const event = desired.get(entry.eventId);
    if (!event || event.reminderAt !== entry.reminderAt) {
      await Notifications.cancelScheduledNotificationAsync(entry.notificationId).catch(() => undefined);
    } else {
      retained.push(entry);
      desired.delete(entry.eventId);
    }
  }

  for (const event of desired.values()) {
    const reminder = new Date(event.reminderAt!);
    const notificationId = await Notifications.scheduleNotificationAsync({
      content: {
        title: LABELS[locale][event.controlType],
        body: locale === 'ro'
          ? `${event.title} · termen ${new Date(event.scheduledAt).toLocaleString('ro-RO')}`
          : `${event.title} · due ${new Date(event.scheduledAt).toLocaleString('en-GB')}`,
        data: { route: '/(app)/haccp', autocontrolEventId: event.id },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: reminder,
        channelId: CHANNEL_ID,
      },
    });
    retained.push({ eventId: event.id, reminderAt: event.reminderAt!, notificationId });
  }

  await AsyncStorage.setItem(keyFor(userId), JSON.stringify(retained));
  return true;
}
