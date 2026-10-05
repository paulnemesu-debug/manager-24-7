/**
 * MANAGER 24/7™ by PARADIM — proprietary software.
 * Copyright © 2026 PARADIM Operations SRL. All rights reserved.
 * Concept author and product director: Marius Paul Nemeșu.
 * See LICENSE-PROPRIETARY.md.
 */

import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

import { authErrorKey, isAcceptedOtpLength, isValidEmail, normalizeEmail, OTP_RESEND_SECONDS, parseOtpInput, requestEmailCode, resendSeconds, verifyEmailCode } from './email-otp';

const email = 'paul.nemesu@paradim.ro';
const session = { user: { id: 'same-user-on-web-and-android', email }, access_token: 'test-only' };

function client() {
  const send = vi.fn().mockResolvedValue({ error: null, data: { user: null, session: null } });
  const verify = vi.fn().mockResolvedValue({ error: null, data: { session, user: session.user } });
  return { send, verify, auth: { signInWithOtp: send, verifyOtp: verify } as unknown as SupabaseClient['auth'] };
}

describe('email OTP', () => {
  it('normalizes email addresses without changing account identity', () => {
    expect(normalizeEmail('  PAUL.NEMESU@PARADIM.RO  ')).toBe(email);
    expect(isValidEmail(email)).toBe(true);
    for (const invalid of ['a@', 'a@b', 'one two@example.com', 'a@@example.com']) expect(isValidEmail(invalid)).toBe(false);
  });

  it('preserves leading zeroes and accepts pasted spacing', () => {
    expect(parseOtpInput(' 012 345\n')).toBe('012345');
    expect(parseOtpInput('')).toBe('');
    expect(parseOtpInput('012')).toBe('012');
  });

  it.each(['12345678901', 'abc123456', 'https://paradim.ro/?code=123456', '123-456'])(
    'does not silently truncate or extract digits from %s', (value) => expect(parseOtpInput(value)).toBeNull(),
  );

  it('accepts both the requested 6-digit setting and the current 8-digit server setting', () => {
    expect(isAcceptedOtpLength('123456')).toBe(true);
    expect(isAcceptedOtpLength('12345678')).toBe(true);
    expect(isAcceptedOtpLength('12345')).toBe(false);
  });

  it.each(['ro', 'en'] as const)('requests a code, no redirect or role metadata, in %s', async (locale) => {
    const mock = client();
    await requestEmailCode(mock.auth, ' PAUL.NEMESU@PARADIM.RO ', locale);
    expect(mock.send).toHaveBeenCalledExactlyOnceWith({ email, options: { shouldCreateUser: true, data: { locale } } });
    expect(mock.verify).not.toHaveBeenCalled();
  });

  it('never reports a failed send as successful', async () => {
    const mock = client();
    const failure = { code: 'over_email_send_rate_limit', status: 429 };
    mock.send.mockResolvedValue({ error: failure });
    await expect(requestEmailCode(mock.auth, email, 'ro')).rejects.toBe(failure);
    expect(authErrorKey(failure)).toBe('signIn.rateLimited');
  });

  it('explains a server-side email delivery failure', () => {
    expect(authErrorKey({ code: 'unexpected_failure', status: 500 }))
      .toBe('signIn.emailServiceUnavailable');
  });

  it('rejects invalid email before contacting the server', async () => {
    const mock = client();
    await expect(requestEmailCode(mock.auth, 'no-address', 'ro')).rejects.toThrow('invalid-email');
    expect(mock.send).not.toHaveBeenCalled();
  });

  it('verifies the code against the original email and keeps the real uid', async () => {
    const mock = client();
    await expect(verifyEmailCode(mock.auth, email, '012 345')).resolves.toBe(session);
    expect(mock.verify).toHaveBeenCalledExactlyOnceWith({ email, token: '012345', type: 'email' });
  });

  it('verifies an 8-digit code without truncating it', async () => {
    const mock = client();
    await expect(verifyEmailCode(mock.auth, email, '12262620')).resolves.toBe(session);
    expect(mock.verify).toHaveBeenCalledExactlyOnceWith({ email, token: '12262620', type: 'email' });
  });

  it('does not treat a success response without a session as a login', async () => {
    const mock = client();
    mock.verify.mockResolvedValue({ error: null, data: { session: null, user: null } });
    await expect(verifyEmailCode(mock.auth, email, '012345')).rejects.toThrow('session-missing');
  });

  it('rejects a session for a different email', async () => {
    const mock = client();
    await expect(verifyEmailCode(mock.auth, 'another@example.com', '012345')).rejects.toThrow('session-missing');
  });

  it('rejects inconsistent session/user ids', async () => {
    const mock = client();
    mock.verify.mockResolvedValue({ error: null, data: { session, user: { ...session.user, id: 'another-user' } } });
    await expect(verifyEmailCode(mock.auth, email, '012345')).rejects.toThrow('session-missing');
  });

  it('shows a translated error for an invalid or expired OTP', async () => {
    const mock = client();
    const failure = { code: 'otp_expired', message: 'Token has expired or is invalid' };
    mock.verify.mockResolvedValue({ error: failure, data: { user: null, session: null } });
    await expect(verifyEmailCode(mock.auth, email, '012345')).rejects.toBe(failure);
    expect(authErrorKey(failure)).toBe('signIn.codeRejected');
  });

  it.each(['12345', '12345678901', 'https://example.com/123456'])('does not submit invalid code %s', async (code) => {
    const mock = client();
    await expect(verifyEmailCode(mock.auth, email, code)).rejects.toThrow('invalid-code');
    expect(mock.verify).not.toHaveBeenCalled();
  });

  it('uses a 60-second timestamp cooldown even after leaving the app', () => {
    expect(OTP_RESEND_SECONDS).toBe(60);
    const deadline = 1000 + OTP_RESEND_SECONDS * 1000;
    expect(resendSeconds(deadline, 1000)).toBe(60);
    expect(resendSeconds(deadline, 59501)).toBe(2);
    expect(resendSeconds(deadline, 62000)).toBe(0);
  });
});
