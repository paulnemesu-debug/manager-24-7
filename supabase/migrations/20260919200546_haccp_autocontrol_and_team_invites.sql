begin;

-- Rezultatul livrării este păstrat separat de apartenența la echipă. Astfel
-- aplicația nu mai poate afișa „invitat” când a fost creat doar un rând local.
alter table public.workspace_members
  add column if not exists invite_sent_at timestamptz,
  add column if not exists invite_delivery text,
  add column if not exists invite_error text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'workspace_members_invite_delivery_check'
      and conrelid = 'public.workspace_members'::regclass
  ) then
    alter table public.workspace_members
      add constraint workspace_members_invite_delivery_check
      check (invite_delivery is null or invite_delivery in ('resend', 'supabase_otp', 'failed'));
  end if;
end
$$;

create table if not exists public.haccp_autocontrol_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  control_type text not null
    check (control_type in ('food_sample', 'hygiene_test', 'water_test')),
  title text not null check (length(btrim(title)) between 1 and 180),
  scheduled_at timestamptz not null,
  reminder_at timestamptz,
  location text check (location is null or length(location) <= 180),
  responsible_person text check (responsible_person is null or length(responsible_person) <= 180),
  laboratory text check (laboratory is null or length(laboratory) <= 180),
  notes text check (notes is null or length(notes) <= 2000),
  result text check (result is null or length(result) <= 2000),
  status text not null default 'scheduled'
    check (status in ('scheduled', 'completed', 'cancelled')),
  source text not null default 'manual' check (source in ('manual', 'import')),
  source_file_name text check (source_file_name is null or length(source_file_name) <= 240),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists haccp_autocontrol_user_schedule_idx
  on public.haccp_autocontrol_events (user_id, scheduled_at);
create index if not exists haccp_autocontrol_user_status_idx
  on public.haccp_autocontrol_events (user_id, status, scheduled_at);

alter table public.haccp_autocontrol_events enable row level security;

drop policy if exists haccp_autocontrol_owner_all on public.haccp_autocontrol_events;
create policy haccp_autocontrol_owner_all on public.haccp_autocontrol_events
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

revoke all on table public.haccp_autocontrol_events from anon;
revoke all on table public.haccp_autocontrol_events from authenticated;
grant select, insert, update, delete on table public.haccp_autocontrol_events to authenticated;

drop trigger if exists haccp_autocontrol_set_updated_at on public.haccp_autocontrol_events;
create trigger haccp_autocontrol_set_updated_at
  before update on public.haccp_autocontrol_events
  for each row execute function private.set_updated_at();

comment on table public.haccp_autocontrol_events is
  'Calendar HACCP for food samples, hygiene tests and water tests; offline cache is maintained by the client.';

notify pgrst, 'reload schema';

commit;
