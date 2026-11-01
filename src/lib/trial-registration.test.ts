import { describe, expect, it } from 'vitest';
import { completeTrialRegistration, getTrialRegistration } from './trial-registration';

const row = { registered: true, eligible: true, restaurant_name: 'Bistro Test', started_at: '2026-11-01T12:00:00Z', expires_at: '2026-11-11T12:00:00Z', registered_at: '2026-11-01T12:02:00Z', last_sign_in_at: '2026-11-01T12:00:00Z', location_id: 'location', terms_version: '2026-11-01', privacy_version: '2026-11-01', marketing_opt_in: false };

describe('individual trial registration API', () => {
  it('submits acknowledgement versions and a normalized restaurant without a caller-selected identity or clock', async () => {
    let submitted: unknown;
    const client = { rpc: async (name: string, args?: unknown) => {
      submitted = { name, args }; return { data: row, error: null };
    } };
    const result = await completeTrialRegistration(client, '  Bistro Test  ', true, 'en');
    expect(submitted).toEqual({ name: 'complete_my_trial_registration', args: { p_restaurant_name: 'Bistro Test', p_terms_version: '2026-11-01', p_privacy_version: '2026-11-01', p_marketing_opt_in: false, p_locale: 'en' } });
    expect(result.expires_at).toBe('2026-11-11T12:00:00Z');
  });
  it.each([['', true], ['   ', true], ['a'.repeat(121), true], ['Bistro\nName', true], ['Bistro', false]])('rejects incomplete acknowledgement or restaurant before granting access', async (restaurant, accepted) => {
    let requests = 0;
    await expect(completeTrialRegistration({ rpc: async () => { requests++; return { data: row, error: null }; } }, restaurant as string, accepted as boolean, 'ro')).rejects.toThrow();
    expect(requests).toBe(0);
  });
  it('fails closed on a malformed registration response', async () => {
    await expect(getTrialRegistration({ rpc: async () => ({ data: { registered: 'yes', eligible: true }, error: null }) })).rejects.toThrow();
  });
  it('preserves server refusal without manufacturing a new trial', async () => {
    await expect(getTrialRegistration({ rpc: async () => ({ data: null, error: new Error('Authentication required') }) })).rejects.toThrow('Authentication required');
  });
});
