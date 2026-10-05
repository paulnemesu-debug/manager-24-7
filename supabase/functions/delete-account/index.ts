import { createClient } from 'npm:@supabase/supabase-js@2.112.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
};

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

function serviceRoleKey() {
  const keys = Deno.env.get('SUPABASE_SECRET_KEYS');
  if (keys) {
    const parsed = JSON.parse(keys) as Record<string, string>;
    if (parsed.default) return parsed.default;
  }
  return requiredEnv('SUPABASE_SERVICE_ROLE_KEY');
}

/**
 * Șterge definitiv contul apelantului și toate datele lui (rețete,
 * ingrediente, catalog, abonament, profil). Identitatea vine strict din
 * token-ul JWT trimis de client — niciun id nu este acceptat din corpul
 * cererii, ca să nu poată fi cerută ștergerea contului altcuiva.
 */
Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ success: false, message: 'Method not allowed' }, 405);

  try {
    const authorization = request.headers.get('Authorization');
    const token = authorization?.replace(/^Bearer\s+/i, '');
    if (!token) return json({ success: false, message: 'Authentication required' }, 401);

    const supabaseUrl = requiredEnv('SUPABASE_URL');
    const admin = createClient(supabaseUrl, serviceRoleKey(), {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // auth.getUser(token) verifică semnătura JWT-ului la nivelul serverului
    // Auth — id-ul rezultat este cel real al sesiunii, nu poate fi falsificat.
    const { data: authData, error: authError } = await admin.auth.getUser(token);
    if (authError || !authData.user) return json({ success: false, message: 'Invalid session' }, 401);

    const userId = authData.user.id;
    const email = authData.user.email ?? null;

    const { error: purgeError } = await admin.rpc('purge_own_data', {
      target_user_id: userId,
      target_email: email,
    });
    if (purgeError) throw purgeError;

    const { error: deleteError } = await admin.auth.admin.deleteUser(userId);
    if (deleteError) throw deleteError;

    return json({ success: true, message: 'Account and all associated data were deleted.' });
  } catch (caught) {
    console.error(caught instanceof Error ? caught.message : 'Unknown account deletion error');
    return json({ success: false, message: 'Account deletion is temporarily unavailable' }, 500);
  }
});
