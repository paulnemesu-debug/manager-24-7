/**
 * MANAGER 24/7™ by PARADIM — proprietary software.
 * Copyright © 2026 PARADIM Operations SRL. All rights reserved.
 * Concept author and product director: Marius Paul Nemeșu.
 * See LICENSE-PROPRIETARY.md.
 */

import type { Locale } from '@/i18n/translations';
import type { HaccpAutocontrolEvent } from '@/types/haccp-autocontrol';

export async function syncAutocontrolNotifications(
  _userId: string,
  _events: readonly HaccpAutocontrolEvent[],
  _locale: Locale,
  _requestPermission = false,
) {
  return false;
}
