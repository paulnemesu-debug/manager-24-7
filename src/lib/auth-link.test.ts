/**
 * MANAGER 24/7™ by PARADIM — proprietary software.
 * Copyright © 2026 PARADIM Operations SRL. All rights reserved.
 * Concept author and product director: Marius Paul Nemeșu.
 * See LICENSE-PROPRIETARY.md.
 */

import { describe, expect, it } from 'vitest';

import { parseAuthLink } from './auth-link';

describe('linkul de acces din email', () => {
  it('citește linkul implicit Supabase', () => {
    expect(parseAuthLink(
      'https://mnaaibsmijziutxuluvv.supabase.co/auth/v1/verify?token=abc123&type=magiclink&redirect_to=https://foodcost.paradim.ro',
    )).toEqual({ kind: 'otp', tokenHash: 'abc123', type: 'magiclink' });
  });

  it('citește linkul de confirmare a contului nou', () => {
    expect(parseAuthLink('https://x.supabase.co/auth/v1/verify?token=t1&type=signup')).toEqual(
      { kind: 'otp', tokenHash: 't1', type: 'signup' },
    );
  });

  it('acceptă și forma cu token_hash', () => {
    expect(parseAuthLink('https://foodcost.paradim.ro/auth/callback?token_hash=h9&type=email')).toEqual(
      { kind: 'otp', tokenHash: 'h9', type: 'email' },
    );
  });

  it('citește sesiunea din fragmentul adresei', () => {
    expect(parseAuthLink('https://foodcost.paradim.ro/#access_token=aa&refresh_token=bb&expires_in=3600')).toEqual(
      { kind: 'session', accessToken: 'aa', refreshToken: 'bb' },
    );
  });

  it('citește codul PKCE', () => {
    expect(parseAuthLink('https://foodcost.paradim.ro/?code=xyz')).toEqual({ kind: 'code', code: 'xyz' });
  });

  it('scoate mesajul când linkul a venit cu eroare', () => {
    const parsed = parseAuthLink(
      'https://foodcost.paradim.ro/?error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired',
    );
    expect(parsed).toEqual({ kind: 'error', message: 'Email link is invalid or has expired' });
  });

  it('nu se împiedică de spații sau de text lipit din greșeală', () => {
    expect(parseAuthLink('   ')).toBeNull();
    expect(parseAuthLink('https://foodcost.paradim.ro/')).toBeNull();
  });

  it('preferă tipul necunoscut ca magic link în loc să eșueze', () => {
    expect(parseAuthLink('https://x.supabase.co/auth/v1/verify?token=t&type=ceva')).toEqual(
      { kind: 'otp', tokenHash: 't', type: 'magiclink' },
    );
  });
});
