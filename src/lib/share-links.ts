/**
 * MANAGER 24/7™ by PARADIM — proprietary software.
 * Copyright © 2026 PARADIM Operations SRL. All rights reserved.
 * Concept author and product director: Marius Paul Nemeșu.
 * See LICENSE-PROPRIETARY.md.
 */

import { Linking } from 'react-native';

import { buildEmailShareUrl, buildWhatsAppShareUrl } from '@/lib/share-urls';

export { buildEmailShareUrl, buildWhatsAppShareUrl } from '@/lib/share-urls';

export async function shareOnWhatsApp(message: string): Promise<void> {
  await Linking.openURL(buildWhatsAppShareUrl(message));
}

export async function shareByEmail(subject: string, message: string): Promise<void> {
  await Linking.openURL(buildEmailShareUrl(subject, message));
}
