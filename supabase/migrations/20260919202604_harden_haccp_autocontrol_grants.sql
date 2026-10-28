begin;

-- TRUNCATE is not governed by row-level security. Supabase projects can have
-- broad default privileges for newly created public tables, so revoke them
-- explicitly before granting only the operations used by the mobile client.
revoke all on table public.haccp_autocontrol_events from anon;
revoke all on table public.haccp_autocontrol_events from authenticated;
grant select, insert, update, delete on table public.haccp_autocontrol_events to authenticated;

commit;
