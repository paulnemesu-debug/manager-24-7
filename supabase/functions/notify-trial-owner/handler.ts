type RpcResult = { data: unknown; error: unknown };
type NotificationClient = {
  auth: {
    getUser(token: string): Promise<{ data: { user: { id: string } | null }; error: unknown }>;
  };
  rpc(name: string, parameters: Record<string, unknown>): PromiseLike<RpcResult>;
};
type ClientOptions = {
  global?: { headers: { Authorization: string } };
  auth: { persistSession: false; autoRefreshToken: false };
};
type Dependencies = {
  env(name: string): string | undefined;
  createClient(url: string, key: string, options: ClientOptions): NotificationClient;
  fetch: typeof fetch;
};
type TrialNotification = {
  id: string;
  user_id: string;
  verified_email: string;
  restaurant_name: string;
  started_at: string;
  expires_at: string;
  registered_at: string;
  attempt: number;
  reserved_at: string;
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

function escapeHtml(value: string) {
  const entities: Record<string, string> = {
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;',
  };
  return value.replace(/[&<>"']/g, (character) => entities[character]);
}

function publishableKey(env: Dependencies['env']) {
  const legacy = env('SUPABASE_ANON_KEY');
  if (legacy) return legacy;
  try {
    const names = JSON.parse(env('SUPABASE_PUBLISHABLE_KEYS') ?? '{}') as Record<string, string>;
    return names.default ? env(names.default) : undefined;
  } catch {
    return undefined;
  }
}

function isNotification(value: unknown): value is TrialNotification {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  return ['id', 'user_id', 'verified_email', 'restaurant_name', 'started_at', 'expires_at', 'registered_at', 'reserved_at']
    .every((key) => typeof row[key] === 'string' && row[key].length > 0)
    && typeof row.attempt === 'number' && Number.isInteger(row.attempt) && row.attempt > 0;
}

export function createNotificationHandler({ env, createClient, fetch: send }: Dependencies) {
  return async (request: Request): Promise<Response> => {
    if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
    if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

    const authorization = request.headers.get('Authorization');
    if (!authorization || !/^Bearer\s+\S+$/i.test(authorization)) return json({ error: 'unauthorized' }, 401);
    const supabaseUrl = env('SUPABASE_URL');
    const publicKey = publishableKey(env);
    const serviceKey = env('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !publicKey || !serviceKey) return json({ error: 'notification_not_configured' }, 503);

    try {
      // Auth validates the token; the RPC separately checks confirmed Auth
      // identity and the server-controlled profile role. JWT metadata is never
      // used as an administrator claim.
      const caller = createClient(supabaseUrl, publicKey, {
        global: { headers: { Authorization: authorization } },
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { data: identity, error: identityError } = await caller.auth.getUser(authorization.replace(/^Bearer\s+/i, ''));
      if (identityError || !identity.user) return json({ error: 'unauthorized' }, 401);
      const { error: adminError } = await caller.rpc('admin_list_trial_users', { p_limit: 1, p_offset: 0 });
      if (adminError) return json({ error: 'admin_required' }, 403);

      const resendKey = env('RESEND_API_KEY');
      const fromEmail = env('INVITATION_FROM_EMAIL');
      // Do not reserve work when delivery is unavailable. There is deliberately
      // no OTP fallback: these are owner notices, never sign-in emails.
      if (!resendKey || !fromEmail) return json({ error: 'delivery_not_configured', queued: true }, 503);

      const service = createClient(supabaseUrl, serviceKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      // A short batch keeps provider failures within the Edge runtime budget.
      const { data, error } = await service.rpc('claim_trial_owner_notifications', { p_limit: 5 });
      if (error || !Array.isArray(data) || data.length > 5 || !data.every(isNotification)) {
        return json({ error: 'notification_claim_failed' }, 500);
      }

      let sent = 0;
      let failed = 0;
      for (const notification of data) {
        let deliveryError: string | null = null;
        const details = [
          ['Email verificat', notification.verified_email],
          ['Restaurant declarat', notification.restaurant_name],
          ['Prima autentificare verificată (UTC)', notification.started_at],
          ['Expirare evaluare (UTC)', notification.expires_at],
          ['Înregistrare finalizată (UTC)', notification.registered_at],
        ];
        try {
          const response = await send('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${resendKey}`,
              'Content-Type': 'application/json',
              'Idempotency-Key': `manager247-trial-owner:${notification.id}`,
            },
            signal: AbortSignal.timeout(15_000),
            body: JSON.stringify({
              from: fromEmail,
              to: ['admin@paradimoperations.com'],
              subject: 'Manager 24/7 — evaluare nouă înregistrată',
              text: `Manager 24/7 — evaluare de 10 zile\n\n${details.map(([label, value]) => `${label}: ${value}`).join('\n')}`,
              html: `<div style="font-family:Arial,sans-serif;color:#062544;max-width:600px;margin:auto"><h2>Manager 24/7 — evaluare nouă</h2>${details.map(([label, value]) => `<p><strong>${label}:</strong> ${escapeHtml(value)}</p>`).join('')}<p>Notificare operațională pentru administrator.</p></div>`,
            }),
          });
          // Never persist or return the provider's response body: it may contain
          // address details or provider configuration information.
          if (!response.ok) deliveryError = `resend_${response.status}`;
        } catch {
          deliveryError = 'provider_unavailable';
        }

        const { data: acknowledged, error: statusError } = await service.rpc('finish_trial_owner_notification', {
          p_id: notification.id,
          p_reserved_at: notification.reserved_at,
          p_delivered: deliveryError === null,
          p_error: deliveryError,
        });
        if (statusError || acknowledged !== true) return json({ error: 'notification_status_failed' }, 500);
        if (deliveryError) failed += 1;
        else sent += 1;
      }
      return failed
        ? json({ error: 'email_delivery_failed', sent, failed }, 502)
        : json({ sent, failed, delivery: 'resend' });
    } catch {
      return json({ error: 'notification_unavailable' }, 503);
    }
  };
}
