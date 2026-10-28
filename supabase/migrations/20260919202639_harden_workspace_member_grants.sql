begin;

-- TRUNCATE bypasses RLS, while REFERENCES and TRIGGER are not required by
-- the mobile client. Preserve only the CRUD privileges governed by the
-- existing owner/member policies.
revoke all on table public.workspace_members from anon;
revoke all on table public.workspace_members from authenticated;
grant select, insert, update, delete on table public.workspace_members to authenticated;

commit;
