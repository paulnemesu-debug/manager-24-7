import { createClient } from 'npm:@supabase/supabase-js@2.112.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
};

type ServiceAccount = {
  client_email: string;
  private_key: string;
  private_key_id?: string;
};

type SubscriptionLineItem = {
  productId?: string;
  expiryTime?: string;
  latestSuccessfulOrderId?: string;
  autoRenewingPlan?: { autoRenewEnabled?: boolean };
  offerPhase?: { freeTrial?: Record<string, never> };
};

type GoogleSubscription = {
  startTime?: string;
  subscriptionState?: string;
  acknowledgementState?: string;
  latestOrderId?: string;
  linkedPurchaseToken?: string;
  externalAccountIdentifiers?: { obfuscatedExternalAccountId?: string };
  lineItems?: SubscriptionLineItem[];
};

type AppStatus =
  | 'active'
  | 'trialing'
  | 'grace_period'
  | 'paused'
  | 'canceled'
  | 'expired'
  | 'none';

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function requiredEnv(name: string) {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`Missing server configuration: ${name}`);
  return value;
}

function serverKey() {
  const keys = Deno.env.get('SUPABASE_SECRET_KEYS');
  if (keys) {
    const parsed = JSON.parse(keys) as Record<string, string>;
    if (parsed.default) return parsed.default;
  }
  return requiredEnv('SUPABASE_SERVICE_ROLE_KEY');
}

function base64Url(bytes: Uint8Array) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function encodeJson(value: unknown) {
  return base64Url(new TextEncoder().encode(JSON.stringify(value)));
}

async function importPrivateKey(pem: string) {
  const encoded = pem
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\s/g, '');
  const binary = atob(encoded);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return crypto.subtle.importKey(
    'pkcs8',
    bytes,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
}

async function googleAccessToken(serviceAccount: ServiceAccount) {
  const issuedAt = Math.floor(Date.now() / 1000);
  const header = encodeJson({
    alg: 'RS256',
    typ: 'JWT',
    ...(serviceAccount.private_key_id ? { kid: serviceAccount.private_key_id } : {}),
  });
  const claims = encodeJson({
    iss: serviceAccount.client_email,
    scope: 'https://www.googleapis.com/auth/androidpublisher',
    aud: 'https://oauth2.googleapis.com/token',
    iat: issuedAt,
    exp: issuedAt + 3600,
  });
  const unsigned = `${header}.${claims}`;
  const key = await importPrivateKey(serviceAccount.private_key);
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    new TextEncoder().encode(unsigned),
  );
  const assertion = `${unsigned}.${base64Url(new Uint8Array(signature))}`;

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });
  if (!response.ok) throw new Error(`Google OAuth failed (${response.status})`);
  const data = await response.json() as { access_token?: string };
  if (!data.access_token) throw new Error('Google OAuth returned no access token');
  return data.access_token;
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function mapStatus(state: string | undefined, lineItem: SubscriptionLineItem): AppStatus {
  if (state === 'SUBSCRIPTION_STATE_ACTIVE') {
    return lineItem.offerPhase?.freeTrial ? 'trialing' : 'active';
  }
  if (state === 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD') return 'grace_period';
  if (state === 'SUBSCRIPTION_STATE_CANCELED') return 'canceled';
  if (state === 'SUBSCRIPTION_STATE_PAUSED' || state === 'SUBSCRIPTION_STATE_ON_HOLD') return 'paused';
  if (state === 'SUBSCRIPTION_STATE_EXPIRED' || state === 'SUBSCRIPTION_STATE_PENDING_PURCHASE_CANCELED') return 'expired';
  return 'none';
}

async function readGoogleSubscription(
  accessToken: string,
  packageName: string,
  purchaseToken: string,
) {
  const url = 'https://androidpublisher.googleapis.com/androidpublisher/v3/applications/'
    + `${encodeURIComponent(packageName)}/purchases/subscriptionsv2/tokens/`
    + encodeURIComponent(purchaseToken);
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
  });
  if (!response.ok) throw new Error(`Google Play verification failed (${response.status})`);
  return response.json() as Promise<GoogleSubscription>;
}

async function acknowledgeSubscription(
  accessToken: string,
  packageName: string,
  productId: string,
  purchaseToken: string,
) {
  const url = 'https://androidpublisher.googleapis.com/androidpublisher/v3/applications/'
    + `${encodeURIComponent(packageName)}/purchases/subscriptions/`
    + `${encodeURIComponent(productId)}/tokens/${encodeURIComponent(purchaseToken)}:acknowledge`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: '{}',
  });
  if (!response.ok) throw new Error(`Google Play acknowledgement failed (${response.status})`);
}

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ valid: false, message: 'Method not allowed' }, 405);

  try {
    const authorization = request.headers.get('Authorization');
    const token = authorization?.replace(/^Bearer\s+/i, '');
    if (!token) return json({ valid: false, message: 'Authentication required' }, 401);

    const supabase = createClient(requiredEnv('SUPABASE_URL'), serverKey(), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: authData, error: authError } = await supabase.auth.getUser(token);
    if (authError || !authData.user) return json({ valid: false, message: 'Invalid session' }, 401);

    const body = await request.json() as {
      packageName?: string;
      productId?: string;
      purchaseToken?: string;
    };
    const packageName = requiredEnv('GOOGLE_PLAY_PACKAGE_NAME');
    const productId = requiredEnv('GOOGLE_PLAY_SUBSCRIPTION_ID');
    if (body.packageName !== packageName || body.productId !== productId || !body.purchaseToken) {
      return json({ valid: false, message: 'Purchase data does not match this application' }, 400);
    }

    const credentials = JSON.parse(requiredEnv('GOOGLE_PLAY_SERVICE_ACCOUNT_JSON')) as ServiceAccount;
    if (!credentials.client_email || !credentials.private_key) {
      throw new Error('Google Play service account is incomplete');
    }

    const accessToken = await googleAccessToken(credentials);
    const purchase = await readGoogleSubscription(accessToken, packageName, body.purchaseToken);
    const lineItem = purchase.lineItems?.find((item) => item.productId === productId);
    if (!lineItem) return json({ valid: false, message: 'Subscription product was not found' }, 403);

    const expectedAccountId = await sha256(authData.user.id);
    const googleAccountId = purchase.externalAccountIdentifiers?.obfuscatedExternalAccountId;
    if (!googleAccountId || googleAccountId !== expectedAccountId) {
      return json({ valid: false, message: 'Purchase belongs to another application account' }, 403);
    }

    const purchaseTokenHash = await sha256(body.purchaseToken);
    const { data: existingOwner } = await supabase
      .from('subscriptions')
      .select('user_id')
      .eq('purchase_token_hash', purchaseTokenHash)
      .maybeSingle();
    if (existingOwner && existingOwner.user_id !== authData.user.id) {
      return json({ valid: false, message: 'Purchase is already linked to another account' }, 409);
    }

    const status = mapStatus(purchase.subscriptionState, lineItem);
    const periodEnd = lineItem.expiryTime ?? null;
    const periodIsFuture = periodEnd ? new Date(periodEnd).getTime() > Date.now() : false;
    const hasEntitlement = status === 'active'
      || status === 'trialing'
      || status === 'grace_period'
      || (status === 'canceled' && periodIsFuture);

    if (purchase.linkedPurchaseToken) {
      const linkedHash = await sha256(purchase.linkedPurchaseToken);
      await supabase
        .from('subscriptions')
        .update({ status: 'expired', current_period_end: new Date().toISOString() })
        .eq('purchase_token_hash', linkedHash);
    }

    const { error: writeError } = await supabase.from('subscriptions').upsert({
      user_id: authData.user.id,
      platform: 'google_play',
      product_id: productId,
      purchase_token_hash: purchaseTokenHash,
      status,
      google_order_id: purchase.latestOrderId ?? lineItem.latestSuccessfulOrderId ?? null,
      current_period_start: purchase.startTime ?? null,
      current_period_end: periodEnd,
      auto_renew: lineItem.autoRenewingPlan?.autoRenewEnabled ?? false,
      last_verified_at: new Date().toISOString(),
    }, { onConflict: 'user_id' });
    if (writeError) throw writeError;

    if (
      hasEntitlement
      && purchase.acknowledgementState === 'ACKNOWLEDGEMENT_STATE_PENDING'
    ) {
      await acknowledgeSubscription(accessToken, packageName, productId, body.purchaseToken);
    }

    return json({
      valid: hasEntitlement,
      status,
      currentPeriodEnd: periodEnd,
      message: hasEntitlement ? 'Subscription verified' : 'Subscription is not active',
    }, hasEntitlement ? 200 : 403);
  } catch (caught) {
    console.error(caught instanceof Error ? caught.message : 'Unknown verification error');
    return json({ valid: false, message: 'Purchase verification is temporarily unavailable' }, 500);
  }
});
