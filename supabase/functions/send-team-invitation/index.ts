import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.112.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const allowedRoles = new Set(["manager", "head_chef", "viewer"]);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  })[character] ?? character);
}

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 254;
}

function publishableKey() {
  const legacy = Deno.env.get("SUPABASE_ANON_KEY");
  if (legacy) return legacy;
  try {
    const names = JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") ?? "{}") as Record<string, string>;
    return names.default ? Deno.env.get(names.default) : undefined;
  } catch {
    return undefined;
  }
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const publicKey = publishableKey();
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const authorization = request.headers.get("Authorization");
  if (!supabaseUrl || !publicKey || !serviceRoleKey || !authorization) {
    return json({ error: "invitation_not_configured" }, 503);
  }

  const callerClient = createClient(supabaseUrl, publicKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const token = authorization.replace(/^Bearer\s+/i, "");
  const { data: callerData, error: callerError } = await callerClient.auth.getUser(token);
  const caller = callerData.user;
  if (callerError || !caller) return json({ error: "unauthorized" }, 401);

  let payload: { email?: unknown; role?: unknown; locale?: unknown };
  try {
    payload = await request.json();
  } catch {
    return json({ error: "invalid_payload" }, 400);
  }
  const email = String(payload.email ?? "").trim().toLowerCase();
  const role = String(payload.role ?? "viewer");
  const locale = payload.locale === "en" ? "en" : "ro";
  if (!isEmail(email) || !allowedRoles.has(role)) return json({ error: "invalid_invitation" }, 400);
  if (email === caller.email?.trim().toLowerCase()) return json({ error: "cannot_invite_self" }, 400);

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: previous } = await admin
    .from("workspace_members")
    .select("id,invite_sent_at,status,member_user_id")
    .eq("owner_user_id", caller.id)
    .eq("invited_email", email)
    .maybeSingle();

  if (previous?.invite_sent_at) {
    const elapsed = Date.now() - new Date(previous.invite_sent_at).getTime();
    if (elapsed < 60_000) return json({ error: "invite_rate_limited" }, 429);
  }

  const { data: profile } = await admin
    .from("profiles")
    .select("user_id")
    .ilike("email", email)
    .maybeSingle();
  const memberUserId = profile?.user_id ?? previous?.member_user_id ?? null;

  const { data: membership, error: memberError } = await admin
    .from("workspace_members")
    .upsert({
      owner_user_id: caller.id,
      invited_email: email,
      member_user_id: memberUserId,
      role,
      status: memberUserId ? "active" : "pending",
      invite_delivery: null,
      invite_error: null,
    }, { onConflict: "owner_user_id,invited_email" })
    .select("id,status")
    .single();
  if (memberError || !membership) return json({ error: "membership_failed" }, 500);

  let delivery: "resend" | "supabase_otp";
  let deliveryError: string | null = null;
  const resendKey = Deno.env.get("RESEND_API_KEY");
  const fromEmail = Deno.env.get("INVITATION_FROM_EMAIL");
  const appUrl = Deno.env.get("APP_URL") ?? "https://app.paradim.ro";

  if (resendKey && fromEmail) {
    const sender = escapeHtml(caller.email ?? "un coleg");
    const target = escapeHtml(appUrl);
    const copy = locale === "ro"
      ? {
        subject: "Invitație în Manager 24/7",
        intro: `${sender} te-a invitat în echipa sa din Manager 24/7 by PARADIM.`,
        action: "Deschide aplicația",
        note: "Autentifică-te cu această adresă de email pentru a primi accesul atribuit.",
      }
      : {
        subject: "Manager 24/7 invitation",
        intro: `${sender} invited you to their Manager 24/7 by PARADIM workspace.`,
        action: "Open the app",
        note: "Sign in with this email address to receive the assigned access.",
      };
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [email],
        subject: copy.subject,
        html: `<div style="font-family:Arial,sans-serif;color:#062544;max-width:560px;margin:auto"><h2>Manager 24/7 by PARADIM</h2><p>${copy.intro}</p><p><a href="${target}" style="display:inline-block;background:#0b6a68;color:white;padding:12px 18px;border-radius:10px;text-decoration:none">${copy.action}</a></p><p>${copy.note}</p></div>`,
      }),
    });
    delivery = "resend";
    if (!response.ok) deliveryError = `resend_${response.status}`;
  } else {
    // Fallback fără un furnizor extern: Supabase trimite codul de acces prin
    // același canal SMTP deja folosit de ecranul de autentificare.
    const mailClient = createClient(supabaseUrl, publicKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error } = await mailClient.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: true,
        emailRedirectTo: `${appUrl}/auth/callback`,
        data: { invited_by: caller.id, workspace_role: role },
      },
    });
    delivery = "supabase_otp";
    if (error) deliveryError = error.message.slice(0, 300);
  }

  const sentAt = new Date().toISOString();
  await admin.from("workspace_members").update({
    invite_sent_at: sentAt,
    invite_delivery: deliveryError ? "failed" : delivery,
    invite_error: deliveryError,
  }).eq("id", membership.id);

  if (deliveryError) return json({ error: "email_delivery_failed" }, 502);
  return json({ memberId: membership.id, status: membership.status, delivery, sentAt });
});
