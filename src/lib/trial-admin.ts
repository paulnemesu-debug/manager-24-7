export const TRIAL_USERS_PAGE_SIZE = 50;

export type AdminTrialUser = {
  user_id: string;
  verified_email: string;
  restaurant_name: string | null;
  started_at: string | null;
  expires_at: string | null;
  registered_at: string | null;
  last_sign_in_at: string | null;
  marketing_opt_in: boolean;
  status: string;
};

type AdminTrialClient = {
  rpc: (name: 'admin_list_trial_users', params: { p_limit: number; p_offset: number }) => PromiseLike<{ data: unknown; error: unknown }>;
};

/** The server authorizes this RPC; a client-side administrator badge is never authority. */
export async function listAdminTrialUsers(client: AdminTrialClient, offset = 0): Promise<AdminTrialUser[]> {
  if (!Number.isSafeInteger(offset) || offset < 0) throw new Error('invalid-trial-offset');
  const { data, error } = await client.rpc('admin_list_trial_users', { p_limit: TRIAL_USERS_PAGE_SIZE, p_offset: offset });
  if (error) throw error;
  let rows: unknown = data;
  if (typeof rows === 'string') {
    try { rows = JSON.parse(rows); } catch { throw new Error('invalid-trial-users'); }
  }
  if (!Array.isArray(rows) || rows.length > TRIAL_USERS_PAGE_SIZE) throw new Error('invalid-trial-users');
  return rows.map((value: unknown): AdminTrialUser => {
    if (!value || typeof value !== 'object') throw new Error('invalid-trial-users');
    const row = value as Record<string, unknown>;
    if (typeof row.user_id !== 'string' || typeof row.verified_email !== 'string' || typeof row.status !== 'string'
      || typeof row.marketing_opt_in !== 'boolean') throw new Error('invalid-trial-users');
    const nullable = (field: string) => {
      const result = row[field];
      if (result !== null && typeof result !== 'string') throw new Error('invalid-trial-users');
      return result;
    };
    return {
      user_id: row.user_id, verified_email: row.verified_email, status: row.status,
      restaurant_name: nullable('restaurant_name'), started_at: nullable('started_at'), expires_at: nullable('expires_at'),
      registered_at: nullable('registered_at'), last_sign_in_at: nullable('last_sign_in_at'), marketing_opt_in: row.marketing_opt_in,
    };
  });
}
