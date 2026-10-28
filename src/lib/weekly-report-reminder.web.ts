/**
 * MANAGER 24/7™ by PARADIM — proprietary software.
 * Copyright © 2026 PARADIM Operations SRL. All rights reserved.
 * Concept author and product director: Marius Paul Nemeșu.
 * See LICENSE-PROPRIETARY.md.
 */

import type { Locale } from '@/i18n/translations';

export async function enableWeeklyReportReminder(_userId: string, _locale: Locale): Promise<boolean> {
  return false;
}

export async function areProductNotificationsEnabled(): Promise<boolean> {
  return false;
}
