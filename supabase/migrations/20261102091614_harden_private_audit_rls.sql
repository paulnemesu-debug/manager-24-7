begin;

-- Defence in depth for server-owned audit and retired demo-extension records.
-- Existing ACLs already deny direct anon/authenticated/service_role table access.
-- Keep those ACLs unchanged: only trusted postgres-owned SECURITY DEFINER paths
-- write these tables. Do not add permissive policies or FORCE owner filtering.
alter table private.account_deletion_audit enable row level security;
alter table private.demo_otp_extensions enable row level security;
alter table private.subscription_access_audit enable row level security;

commit;
