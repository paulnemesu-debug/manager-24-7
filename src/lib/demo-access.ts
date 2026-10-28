/**
 * MANAGER 24/7™ by PARADIM — proprietary software.
 * Copyright © 2026 PARADIM Operations SRL. All rights reserved.
 * Concept author and product director: Marius Paul Nemeșu.
 * See LICENSE-PROPRIETARY.md.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import { normalizeEmail } from '@/lib/email-otp';

export const DEMO_ACCOUNT_EMAIL = 'paul.nemesu@paradim.ro';

type DemoExtensionRow = {
  status: string;
  current_period_end: string | null;
};

export function isOtpDemoAccount(email: string | null | undefined): boolean {
  return normalizeEmail(email ?? '') === DEMO_ACCOUNT_EMAIL;
}

/**
 * Consumă dovada OTP proaspătă numai pe server. Filtrul de email din client
 * evită apelurile inutile; funcția SQL verifică din nou uid-ul, emailul,
 * metoda OTP, vechimea codului și folosirea unică.
 */
export async function extendOtpDemoAccess(client: SupabaseClient): Promise<DemoExtensionRow | null> {
  const { data, error } = await client.rpc('extend_my_demo_after_otp');
  if (error) {
    // Dacă răspunsul primei cereri s-a pierdut după commit, reîncercarea este
    // sigură: perioada a fost deja extinsă, iar SubscriptionProvider o recitește.
    if (/already used|deja (?:a fost )?folosit/i.test(error.message ?? '')) return null;
    throw error;
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== 'object') return null;
  const candidate = row as Partial<DemoExtensionRow>;
  return {
    status: typeof candidate.status === 'string' ? candidate.status : 'trialing',
    current_period_end: typeof candidate.current_period_end === 'string'
      ? candidate.current_period_end
      : null,
  };
}
