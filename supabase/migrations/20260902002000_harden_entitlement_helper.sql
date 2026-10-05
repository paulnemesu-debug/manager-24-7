begin;

-- The helper only reads the caller's own profile/subscription through RLS, so
-- SECURITY INVOKER is sufficient and avoids an unnecessary elevated RPC.
alter function public.has_professional_access() security invoker;

create index if not exists subscription_access_audit_user_id_idx
  on private.subscription_access_audit (user_id);

commit;
