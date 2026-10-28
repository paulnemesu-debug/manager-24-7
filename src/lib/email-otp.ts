/**
 * MANAGER 24/7™ by PARADIM — proprietary software.
 * Copyright © 2026 PARADIM Operations SRL. All rights reserved.
 * Concept author and product director: Marius Paul Nemeșu.
 * See LICENSE-PROPRIETARY.md.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import type { Locale, TranslationKey } from '../i18n/translations';

export const OTP_MIN_LENGTH = 6;
export const OTP_MAX_LENGTH = 10;
export const OTP_RESEND_SECONDS = 60;
type EmailAuth = Pick<SupabaseClient['auth'], 'signInWithOtp' | 'verifyOtp'>;

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function isValidEmail(value: string): boolean {
  return value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

/** Acceptă coduri numerice configurabile, fără a extrage cifre din linkuri. */
export function parseOtpInput(raw: string): string | null {
  const value = raw.replace(/\s/g, '');
  return new RegExp(`^\\d{0,${OTP_MAX_LENGTH}}$`).test(value) ? value : null;
}

export function isAcceptedOtpLength(value: string): boolean {
  return value.length >= OTP_MIN_LENGTH && value.length <= OTP_MAX_LENGTH;
}

export function resendSeconds(deadline: number, now = Date.now()): number {
  return Math.max(0, Math.ceil((deadline - now) / 1000));
}

export function authErrorKey(error: unknown): TranslationKey {
  const item = error as { code?: string; message?: string; status?: number } | null;
  if (item?.message === 'not-configured') return 'error.notConfigured';
  if (item?.message === 'invalid-email' || item?.code === 'email_address_invalid') return 'signIn.invalidEmailBody';
  if (item?.message === 'invalid-code') return 'signIn.invalidCodeBody';
  if (item?.status === 429 || /rate.?limit|over_.*limit/i.test(`${item?.code} ${item?.message}`)) return 'signIn.rateLimited';
  if (item?.code === 'otp_expired' || item?.code === 'otp_disabled') return 'signIn.codeRejected';
  if (item?.message === 'session-missing') return 'signIn.sessionMissing';
  if (/network|fetch|timeout|abort/i.test(`${item?.code} ${item?.message}`)) return 'signIn.networkError';
  if ((item?.status ?? 0) >= 500 || item?.code === 'unexpected_failure') return 'signIn.emailServiceUnavailable';
  return 'signIn.genericError';
}

export async function requestEmailCode(client: EmailAuth, rawEmail: string, locale: Locale): Promise<void> {
  const email = normalizeEmail(rawEmail);
  if (!isValidEmail(email)) throw new Error('invalid-email');
  const { error } = await client.signInWithOtp({
    email,
    options: {
      shouldCreateUser: true,
      // Presentation preference only: never use editable metadata to grant access.
      data: { locale },
      // No redirect. Both hosted email templates must render {{ .Token }}.
    },
  });
  if (error) throw error;
}

export async function verifyEmailCode(client: EmailAuth, rawEmail: string, rawCode: string) {
  const email = normalizeEmail(rawEmail);
  const token = parseOtpInput(rawCode);
  if (!isValidEmail(email)) throw new Error('invalid-email');
  if (!token || !isAcceptedOtpLength(token)) throw new Error('invalid-code');
  const { data, error } = await client.verifyOtp({ email, token, type: 'email' });
  if (error) throw error;
  if (!data.session || !data.user || data.session.user.id !== data.user.id
    || normalizeEmail(data.user.email ?? '') !== email) {
    throw new Error('session-missing');
  }
  return data.session;
}
