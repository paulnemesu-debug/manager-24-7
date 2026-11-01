import { describe, expect, it } from 'vitest';

import { listAdminTrialUsers, TRIAL_USERS_PAGE_SIZE } from '@/lib/trial-admin';

const row = {
  user_id: 'tester-a', verified_email: 'tester@example.com', restaurant_name: 'Restaurant A',
  started_at: '2026-11-01T12:00:00Z', expires_at: '2026-11-11T12:00:00Z',
  registered_at: '2026-11-01T12:01:00Z', last_sign_in_at: '2026-11-02T12:00:00Z',
  marketing_opt_in: false, status: 'active',
};

describe('restricted trial user listings', () => {
  it('returns the server identity and dates without retaining unrelated fields', async () => {
    const client = { rpc: async () => ({ data: [{ ...row, ip_address: 'not-for-display', otp: 'secret' }], error: null }) };
    const result = await listAdminTrialUsers(client, 0);
    expect(result).toEqual([row]);
    expect(result[0]).not.toHaveProperty('ip_address');
    expect(result[0]).not.toHaveProperty('otp');
  });

  it('passes bounded pagination to the server and accepts a JSON array result', async () => {
    let actual: unknown;
    const client = { rpc: async (name: string, args: unknown) => {
      actual = { name, args };
      return { data: JSON.stringify([row]), error: null };
    } };
    expect(await listAdminTrialUsers(client, 50)).toEqual([row]);
    expect(actual).toEqual({ name: 'admin_list_trial_users', args: { p_limit: TRIAL_USERS_PAGE_SIZE, p_offset: 50 } });
  });

  it('surfaces authorization failures without treating them as an empty successful page', async () => {
    const error = { message: 'Administrator access required', code: '42501' };
    await expect(listAdminTrialUsers({ rpc: async () => ({ data: null, error }) }, 0)).rejects.toEqual(error);
  });

  it('rejects malformed responses and invalid offsets', async () => {
    await expect(listAdminTrialUsers({ rpc: async () => ({ data: [{ ...row, verified_email: null }], error: null }) }, 0)).rejects.toThrow('invalid-trial-users');
    await expect(listAdminTrialUsers({ rpc: async () => ({ data: [row], error: null }) }, -1)).rejects.toThrow('invalid-trial-offset');
  });
});
