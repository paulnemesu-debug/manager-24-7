/**
 * MANAGER 24/7™ by PARADIM — proprietary software.
 * Copyright © 2026 PARADIM Operations SRL. All rights reserved.
 * Concept author and product director: Marius Paul Nemeșu.
 * See LICENSE-PROPRIETARY.md.
 */

/**
 * Citește un link de acces primit pe email și scoate din el datele cu care se
 * poate deschide sesiunea. Există pentru situația în care utilizatorul are doar
 * linkul — pentru că șablonul de email nu conține încă un cod, sau pentru că
 * linkul a fost cerut din aplicație, dar deschis în browser, unde nu ajunge.
 */
const OTP_TYPES = ['magiclink', 'signup', 'invite', 'recovery', 'email'] as const;
export type OtpType = (typeof OTP_TYPES)[number];

export type ParsedAuthLink =
  | { kind: 'otp'; tokenHash: string; type: OtpType }
  | { kind: 'session'; accessToken: string; refreshToken: string }
  | { kind: 'code'; code: string }
  | { kind: 'error'; message: string };

function paramsOf(url: string): URLSearchParams {
  const merged = new URLSearchParams();

  const query = url.includes('?') ? url.slice(url.indexOf('?') + 1).split('#')[0] : '';
  const hash = url.includes('#') ? url.slice(url.indexOf('#') + 1) : '';

  for (const source of [query, hash]) {
    if (!source) continue;
    for (const [key, value] of new URLSearchParams(source)) {
      if (!merged.has(key)) merged.set(key, value);
    }
  }
  return merged;
}

export function parseAuthLink(input: string): ParsedAuthLink | null {
  const url = input.trim();
  if (!url) return null;

  const params = paramsOf(url);

  const errorDescription = params.get('error_description') ?? params.get('error');
  if (errorDescription) {
    return { kind: 'error', message: errorDescription.replace(/\+/g, ' ') };
  }

  const accessToken = params.get('access_token');
  const refreshToken = params.get('refresh_token');
  if (accessToken && refreshToken) {
    return { kind: 'session', accessToken, refreshToken };
  }

  // Linkul implicit al Supabase are forma /auth/v1/verify?token=<hash>&type=magiclink
  const tokenHash = params.get('token_hash') ?? params.get('token');
  const rawType = params.get('type') ?? 'magiclink';
  if (tokenHash) {
    const type: OtpType = (OTP_TYPES as readonly string[]).includes(rawType)
      ? (rawType as OtpType)
      : 'magiclink';
    return { kind: 'otp', tokenHash, type };
  }

  const code = params.get('code');
  if (code) return { kind: 'code', code };

  return null;
}
