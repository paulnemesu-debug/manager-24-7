/**
 * MANAGER 24/7™ by PARADIM — proprietary software.
 * Copyright © 2026 PARADIM Operations SRL. All rights reserved.
 * Concept author and product director: Marius Paul Nemeșu.
 * See LICENSE-PROPRIETARY.md.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

import type { Locale } from '@/i18n/translations';
import type { HaccpDocument } from '@/types/haccp';

const CHANNEL_ID = 'haccp-daily';
const DAYS_AHEAD = 30;
const DEFAULT_REMINDER_TIME = '20:00';

type ReminderEntry = { date: string; notificationId: string };
type NotificationsModule = typeof import('expo-notifications');

const enabledKey = (userId: string) => `professional_foodcost.haccp_reminder.enabled.${userId}`;
const entriesKey = (userId: string) => `professional_foodcost.haccp_reminder.entries.${userId}`;
const settingsKey = (userId: string) => `manager247.haccp_reminder.settings.v2.${userId}`;

export type HaccpReminderSettings = {
  enabled: boolean;
  time: string;
};

function validTime(value: string) {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  return Boolean(match && Number(match[1]) <= 23 && Number(match[2]) <= 59);
}

function localIsoDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

async function readEntries(userId: string): Promise<ReminderEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(entriesKey(userId));
    const parsed = raw ? JSON.parse(raw) as ReminderEntry[] : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function loadNotifications(): Promise<NotificationsModule> {
  return import('expo-notifications');
}

async function configureChannel(Notifications: NotificationsModule) {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: 'Verificări HACCP',
    importance: Notifications.AndroidImportance.HIGH,
    sound: 'default',
  });
}

export async function configureHaccpNotificationHandler() {
  const Notifications = await loadNotifications();
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

export async function isHaccpReminderEnabled(userId: string) {
  return (await getHaccpReminderSettings(userId)).enabled;
}

export async function getHaccpReminderSettings(userId: string): Promise<HaccpReminderSettings> {
  try {
    const raw = await AsyncStorage.getItem(settingsKey(userId));
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<HaccpReminderSettings>;
      return {
        enabled: parsed.enabled === true,
        time: typeof parsed.time === 'string' && validTime(parsed.time)
          ? parsed.time
          : DEFAULT_REMINDER_TIME,
      };
    }
  } catch {
    // Compatibilitate cu setarea veche de la 20:00.
  }
  return {
    enabled: (await AsyncStorage.getItem(enabledKey(userId))) === 'true',
    time: DEFAULT_REMINDER_TIME,
  };
}

async function cancelSavedEntries(userId: string, Notifications: NotificationsModule) {
  const saved = await readEntries(userId);
  await Promise.all(saved.map((entry) => (
    Notifications.cancelScheduledNotificationAsync(entry.notificationId).catch(() => undefined)
  )));
  await AsyncStorage.removeItem(entriesKey(userId));
}

export async function setHaccpReminderTime(userId: string, time: string) {
  if (!validTime(time)) throw new Error('invalid-reminder-time');
  // Încărcăm și configurăm notificările numai când utilizatorul activează
  // funcția. Modulul nativ nu mai face parte din traseul critic de pornire.
  const Notifications = await loadNotifications();
  await configureHaccpNotificationHandler();
  await configureChannel(Notifications);
  let permission = await Notifications.getPermissionsAsync();
  if (!permission.granted) permission = await Notifications.requestPermissionsAsync();
  if (!permission.granted) return false;
  await cancelSavedEntries(userId, Notifications);
  await Promise.all([
    AsyncStorage.setItem(enabledKey(userId), 'true'),
    AsyncStorage.setItem(settingsKey(userId), JSON.stringify({ enabled: true, time })),
  ]);
  return true;
}

export async function enableHaccpReminder(userId: string, time?: string) {
  const settings = await getHaccpReminderSettings(userId);
  return setHaccpReminderTime(userId, time ?? settings.time);
}

function completedDates(documents: readonly HaccpDocument[]) {
  return new Set(documents.map((document) => (
    document.headerValues.form_date || localIsoDate(new Date(document.updatedAt))
  )));
}

export async function syncHaccpReminders(
  userId: string,
  documents: readonly HaccpDocument[],
  locale: Locale,
) {
  if (!await isHaccpReminderEnabled(userId)) return;
  const settings = await getHaccpReminderSettings(userId);
  const [hour, minute] = settings.time.split(':').map(Number);
  const Notifications = await loadNotifications();
  await configureHaccpNotificationHandler();
  await configureChannel(Notifications);

  const now = new Date();
  const completed = completedDates(documents);
  const saved = await readEntries(userId);
  const retained: ReminderEntry[] = [];

  for (const entry of saved) {
    const target = new Date(`${entry.date}T${settings.time}:00`);
    if (target <= now || completed.has(entry.date)) {
      await Notifications.cancelScheduledNotificationAsync(entry.notificationId).catch(() => undefined);
    } else {
      retained.push(entry);
    }
  }

  const existingDates = new Set(retained.map((entry) => entry.date));
  for (let offset = 0; offset < DAYS_AHEAD; offset += 1) {
    const target = new Date(now);
    target.setDate(now.getDate() + offset);
    target.setHours(hour, minute, 0, 0);
    const date = localIsoDate(target);
    if (target <= now || completed.has(date) || existingDates.has(date)) continue;
    const notificationId = await Notifications.scheduleNotificationAsync({
      content: {
        title: locale === 'ro' ? 'Lipsesc valorile HACCP de azi' : 'Today’s HACCP values are missing',
        body: locale === 'ro'
          ? 'Deschide modulul HACCP și completează verificările zilnice.'
          : 'Open HACCP and complete today’s checks.',
        data: { route: '/haccp', date },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: target,
        channelId: CHANNEL_ID,
      },
    });
    retained.push({ date, notificationId });
  }

  await AsyncStorage.setItem(entriesKey(userId), JSON.stringify(retained));
}
