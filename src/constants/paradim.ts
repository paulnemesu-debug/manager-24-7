/**
 * MANAGER 24/7™ by PARADIM — proprietary software.
 * Copyright © 2026 PARADIM Operations SRL. All rights reserved.
 * Concept author and product director: Marius Paul Nemeșu.
 * See LICENSE-PROPRIETARY.md.
 */

/**
 * Punctele de contact și adresele publice ale produsului.
 * Se schimbă doar aici, ca să nu rămână numere sau linkuri împrăștiate prin ecrane.
 */

/** Numărul de WhatsApp pentru consultanță, în format internațional, fără plus și fără spații. */
export const WHATSAPP_NUMBER = '40724661555';

/**
 * Canalul este injectat de EAS. Buildul Play nu afișează și nu deschide
 * niciun flux extern de cumpărare; APK-ul direct și web-ul pot folosi site-ul.
 */
export type DistributionChannel = 'direct' | 'play';

export function resolveDistributionChannel(value?: string): DistributionChannel {
  return value === 'play' ? 'play' : 'direct';
}

export function canUseExternalCheckout(channel: DistributionChannel): boolean {
  return channel === 'direct';
}

export const DISTRIBUTION_CHANNEL = resolveDistributionChannel(
  process.env.EXPO_PUBLIC_DISTRIBUTION_CHANNEL,
);
export const IS_PLAY_STORE_BUILD = DISTRIBUTION_CHANNEL === 'play';
export const CAN_USE_EXTERNAL_CHECKOUT = canUseExternalCheckout(DISTRIBUTION_CHANNEL);
/** Accesul este decis de funcția Supabase has_professional_access(), nu de APK. */
export const BETA_ACCESS = false;

export const SITE_URL = 'https://paradim.ro';
export const CONTACT_EMAIL = 'contact@paradim.ro';
export const CONTACT_PHONE_DISPLAY = '+40 724 661 555';
export const COMPANY_CONTACT_LINE = `paradim.ro · ${CONTACT_EMAIL} · ${CONTACT_PHONE_DISPLAY}`;

/** Aplicația web. Aceeași adresă la care este găzduit și APK-ul. */
export const APP_URL = 'https://foodcost.paradim.ro';
export const APK_URL = 'https://app.paradim.ro/manager24-7.apk';
export const INSTALL_URL = 'https://foodcost.paradim.ro/install.html';

/**
 * Linkul din email revine pe adresa aplicației web, unde se află verificatorul
 * sesiunii. Pe telefon, aplicația primește retur prin schema proprie.
 */
export const AUTH_CALLBACK_URL = 'https://foodcost.paradim.ro/auth/callback';
export const APP_SCHEME_CALLBACK = 'manager247://auth/callback';

export const CHECKOUT_URL = 'https://paradim.ro/foodcost-pro';

/** Prețurile publice pot fi schimbate din EAS fără o nouă modificare de cod. */
export const MONTHLY_PRICE_RON = process.env.EXPO_PUBLIC_MONTHLY_PRICE_RON?.trim() || '99';
export const ANNUAL_PRICE_RON = process.env.EXPO_PUBLIC_ANNUAL_PRICE_RON?.trim() || '990';

/** Țintele de food cost propuse ca butoane rapide, în ordinea afișării. */
export const FOOD_COST_TARGETS = [28, 30, 32] as const;
export const DEFAULT_FOOD_COST_TARGET = 30;

/** Pragul de la care propunem planul de consultanță. */
export const CONSULTING_MIN_RECIPES = 5;

export function whatsAppUrl(message: string): string {
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
}
