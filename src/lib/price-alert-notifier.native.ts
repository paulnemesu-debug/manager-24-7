/**
 * MANAGER 24/7™ by PARADIM — proprietary software.
 * Copyright © 2026 PARADIM Operations SRL. All rights reserved.
 * Concept author and product director: Marius Paul Nemeșu.
 * See LICENSE-PROPRIETARY.md.
 */

import { Platform } from 'react-native';

import type { Locale } from '@/i18n/translations';
import type { PriceAlertSummary } from '@/lib/price-alerts';

const CHANNEL_ID = 'price-alerts';
type NotificationsModule = typeof import('expo-notifications');

async function loadNotifications(): Promise<NotificationsModule> {
  return import('expo-notifications');
}

export function priceAlertMessage(
  summary: PriceAlertSummary,
  locale: Locale,
  money: (value: number) => string,
) {
  const title = `${summary.ingredientName} +${Math.round(summary.deltaPercent)}%`;
  if (!summary.affectedRecipes) {
    return {
      title,
      body: locale === 'ro' ? 'Preț actualizat; ingredientul nu este încă folosit într-o rețetă.' : 'Price updated; this ingredient is not used in a recipe yet.',
    };
  }
  const target = summary.crossedTargets
    ? locale === 'ro' ? ` · ${summary.crossedTargets} au ieșit din țintă` : ` · ${summary.crossedTargets} moved over target`
    : '';
  const loss = summary.monthlyMarginLoss > 0
    ? locale === 'ro' ? `Marjă pierdută estimată: ${money(summary.monthlyMarginLoss)}/lună.` : `Estimated margin loss: ${money(summary.monthlyMarginLoss)}/month.`
    : locale === 'ro' ? `Impact mediu: ${money(summary.averagePortionLoss)}/porție.` : `Average impact: ${money(summary.averagePortionLoss)}/portion.`;
  return {
    title,
    body: locale === 'ro'
      ? `${summary.affectedRecipes} rețete afectate${target}. ${loss}`
      : `${summary.affectedRecipes} recipes affected${target}. ${loss}`,
  };
}

export async function notifyPriceAlert(
  summary: PriceAlertSummary,
  locale: Locale,
  money: (value: number) => string,
) {
  const Notifications = await loadNotifications();
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: locale === 'ro' ? 'Alerte de preț' : 'Price alerts',
      importance: Notifications.AndroidImportance.HIGH,
      sound: 'default',
    });
  }
  let permission = await Notifications.getPermissionsAsync();
  if (!permission.granted) permission = await Notifications.requestPermissionsAsync();
  if (!permission.granted) return false;
  const content = priceAlertMessage(summary, locale, money);
  await Notifications.scheduleNotificationAsync({
    content: { ...content, data: { route: '/recipes', section: 'ingredients' } },
    trigger: null,
  });
  return true;
}
