import type { Locale } from '@/i18n/translations';

export const TRIAL_PRODUCT_ID = 'manager247_trial_10d';
export const TRIAL_LEGAL_VERSION = '2026-11-01';
export type TrialRegistration = {
  registered: boolean;
  eligible: boolean;
  restaurant_name: string | null;
  started_at: string | null;
  expires_at: string | null;
  registered_at: string | null;
  last_sign_in_at: string | null;
  location_id: string | null;
  terms_version: string | null;
  privacy_version: string | null;
  marketing_opt_in: boolean;
};
export type TrialRpcClient = { rpc: (name: string, args?: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }> };

function registrationFromResponse(data: unknown): TrialRegistration {
  const value = Array.isArray(data) && data.length === 1 ? data[0] : data;
  if (!value || typeof value !== 'object') throw new Error('invalid-trial-response');
  const row = value as Record<string, unknown>;
  if (typeof row.registered !== 'boolean' || typeof row.eligible !== 'boolean') throw new Error('invalid-trial-response');
  const nullableText = (field: string) => typeof row[field] === 'string' ? row[field] as string : null;
  // Registered trials must carry server dates. Missing dates never create access.
  if (row.registered && row.eligible && (!Number.isFinite(Date.parse(String(row.started_at)))
    || !Number.isFinite(Date.parse(String(row.expires_at))))) throw new Error('invalid-trial-response');
  return {
    registered: row.registered, eligible: row.eligible,
    restaurant_name: nullableText('restaurant_name'), started_at: nullableText('started_at'),
    expires_at: nullableText('expires_at'), registered_at: nullableText('registered_at'),
    last_sign_in_at: nullableText('last_sign_in_at'), location_id: nullableText('location_id'),
    terms_version: nullableText('terms_version'), privacy_version: nullableText('privacy_version'),
    marketing_opt_in: row.marketing_opt_in === true,
  };
}

export async function getTrialRegistration(client: TrialRpcClient): Promise<TrialRegistration> {
  const { data, error } = await client.rpc('get_my_trial_registration');
  if (error) throw error;
  return registrationFromResponse(data);
}

export async function completeTrialRegistration(client: TrialRpcClient, restaurant: string, accepted: boolean, locale: Locale): Promise<TrialRegistration> {
  const name = restaurant.trim();
  if (!name || name.length > 120 || /[\u0000-\u001f\u007f]/.test(name) || !accepted) throw new Error('trial-registration-required');
  const { data, error } = await client.rpc('complete_my_trial_registration', {
    p_restaurant_name: name, p_terms_version: TRIAL_LEGAL_VERSION,
    p_privacy_version: TRIAL_LEGAL_VERSION, p_marketing_opt_in: false, p_locale: locale,
  });
  if (error) throw error;
  return registrationFromResponse(data);
}

export function trialLegalUrl(kind: 'terms' | 'privacy', locale: Locale): string {
  const path = locale === 'en'
    ? (kind === 'terms' ? '/en/terms' : '/en/privacy-policy')
    : (kind === 'terms' ? '/termeni-si-conditii' : '/politica-de-confidentialitate');
  return `https://www.paradim.ro${path}#trial-manager`;
}
