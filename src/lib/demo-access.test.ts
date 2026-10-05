/**
 * MANAGER 24/7™ by PARADIM — proprietary software.
 * Copyright © 2026 PARADIM Operations SRL. All rights reserved.
 * Concept author and product director: Marius Paul Nemeșu.
 * See LICENSE-PROPRIETARY.md.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';

import { DEMO_ACCOUNT_EMAIL, extendOtpDemoAccess, isOtpDemoAccount } from './demo-access';

describe('OTP demo access', () => {
  it('recognizes only the dedicated demo address', () => {
    expect(isOtpDemoAccount(`  ${DEMO_ACCOUNT_EMAIL.toUpperCase()}  `)).toBe(true);
    expect(isOtpDemoAccount('paul.nemesu@gmail.com')).toBe(false);
    expect(isOtpDemoAccount(undefined)).toBe(false);
  });

  it('asks the server to consume the fresh OTP proof', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{ status: 'trialing', current_period_end: '2026-09-29T06:11:44.906Z' }],
      error: null,
    });
    const client = { rpc } as unknown as SupabaseClient;

    await expect(extendOtpDemoAccess(client)).resolves.toEqual({
      status: 'trialing',
      current_period_end: '2026-09-29T06:11:44.906Z',
    });
    expect(rpc).toHaveBeenCalledExactlyOnceWith('extend_my_demo_after_otp');
  });

  it('treats a committed one-use OTP retry as idempotent', async () => {
    const client = {
      rpc: vi.fn().mockResolvedValue({
        data: null,
        error: { message: 'This OTP was already used for an extension' },
      }),
    } as unknown as SupabaseClient;
    await expect(extendOtpDemoAccess(client)).resolves.toBeNull();
  });

  it('does not hide a rejected or stale OTP proof', async () => {
    const failure = { message: 'A fresh email OTP is required' };
    const client = {
      rpc: vi.fn().mockResolvedValue({ data: null, error: failure }),
    } as unknown as SupabaseClient;
    await expect(extendOtpDemoAccess(client)).rejects.toBe(failure);
  });
});
