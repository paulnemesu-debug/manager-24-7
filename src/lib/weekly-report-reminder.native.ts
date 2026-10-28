/**
 * MANAGER 24/7™ by PARADIM — proprietary software.
 * Copyright © 2026 PARADIM Operations SRL. All rights reserved.
 * Concept author and product director: Marius Paul Nemeșu.
 * See LICENSE-PROPRIETARY.md.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

import type { Locale } from '@/i18n/translations';

const CHANNEL_ID = 'weekly-manager-report';
const WEEKS_AHEAD = 12;
const keyFor = (userId: string) => `manager247.weekly_report_reminders.v1.${userId}`;
const enabledKeyFor = (userId: string) => `manager247.weekly_report_reminders.enabled.v1.${userId}`;
type NotificationsModule = typeof import('expo-notifications');

// Încărcarea modulului nativ este intenționat amânată până la apăsarea
// butonului de activare. Pe unele dispozitive Samsung/Android 16,
// inițializarea lui în primul cadru autentificat poate închide activitatea.
async function loadNotifications(): Promise<NotificationsModule> {
  return import('expo-notifications');
}

async function cancelExisting(userId: string, Notifications: NotificationsModule) {
  const raw = await AsyncStorage.getItem(keyFor(userId));
  const ids = raw ? JSON.parse(raw) as unknown : [];
  if (Array.isArray(ids)) {
    await Promise.all(ids.filter((id): id is string => typeof id === 'string')
      .map((id) => Notifications.cancelScheduledNotificationAsync(id).catch(() => undefined)));
  }
}

function nextMondayMorning(from: Date) {
  const result = new Date(from);
  const days = (8 - result.getDay()) % 7 || 7;
  result.setDate(result.getDate() + days);
  result.setHours(9, 0, 0, 0);
  return result;
}

export async function enableWeeklyReportReminder(userId: string, locale: Locale): Promise<boolean> {
  try {
    const Notifications = await loadNotifications();
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
        name: locale === 'ro' ? 'Raport managerial săptămânal' : 'Weekly management report',
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }
    let permission = await Notifications.getPermissionsAsync();
    if (!permission.granted) permission = await Notifications.requestPermissionsAsync();
    if (!permission.granted) {
      await AsyncStorage.removeItem(enabledKeyFor(userId));
      return false;
    }

    await cancelExisting(userId, Notifications);
    const first = nextMondayMorning(new Date());
    const ids: string[] = [];
    for (let week = 0; week < WEEKS_AHEAD; week += 1) {
      const target = new Date(first);
      target.setDate(first.getDate() + week * 7);
      ids.push(await Notifications.scheduleNotificationAsync({
        content: {
          title: locale === 'ro' ? 'Raportul Manager 24/7 este gata' : 'Your Manager 24/7 report is ready',
          body: locale === 'ro'
            ? 'Vezi costurile, rețetele peste țintă și trimite raportul pe WhatsApp.'
            : 'Review costs and recipes over target, then share the report on WhatsApp.',
          data: { route: '/(app)' },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: target,
          channelId: CHANNEL_ID,
        },
      }));
    }
    await Promise.all([
      AsyncStorage.setItem(keyFor(userId), JSON.stringify(ids)),
      AsyncStorage.setItem(enabledKeyFor(userId), 'true'),
    ]);
    return true;
  } catch {
    await AsyncStorage.removeItem(enabledKeyFor(userId)).catch(() => undefined);
    return false;
  }
}

export async function areProductNotificationsEnabled(userId: string): Promise<boolean> {
  // Citirea stării locale nu pornește modulul nativ în traseul post-login.
  return (await AsyncStorage.getItem(enabledKeyFor(userId)).catch(() => null)) === 'true';
}
