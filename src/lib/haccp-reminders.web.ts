/**
 * MANAGER 24/7™ by PARADIM — proprietary software.
 * Copyright © 2026 PARADIM Operations SRL. All rights reserved.
 * Concept author and product director: Marius Paul Nemeșu.
 * See LICENSE-PROPRIETARY.md.
 */

import type { Locale } from '@/i18n/translations';
import type { HaccpDocument } from '@/types/haccp';

export function configureHaccpNotificationHandler() {}

export type HaccpReminderSettings = { enabled: boolean; time: string };

export async function getHaccpReminderSettings(_userId: string): Promise<HaccpReminderSettings> {
  return { enabled: false, time: '20:00' };
}

export async function isHaccpReminderEnabled(_userId: string) {
  return false;
}

export async function enableHaccpReminder(_userId: string, _time?: string) {
  return false;
}

export async function setHaccpReminderTime(_userId: string, _time: string) {
  return false;
}

export async function syncHaccpReminders(
  _userId: string,
  _documents: readonly HaccpDocument[],
  _locale: Locale,
) {}
