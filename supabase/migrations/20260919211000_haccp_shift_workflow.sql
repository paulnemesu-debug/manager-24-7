begin;

create table if not exists public.haccp_routine_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  default_location_id uuid references public.business_locations(id) on delete set null,
  default_location_name text not null default '' check (length(default_location_name) <= 120),
  responsible_name text not null default '' check (length(responsible_name) <= 160),
  shift_start_time time not null default '06:00',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.haccp_equipment (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  location_id uuid references public.business_locations(id) on delete set null,
  name text not null check (length(btrim(name)) between 1 and 120),
  kind text not null check (kind in ('cold','frozen','hot','other')),
  critical_min numeric(7,2),
  critical_max numeric(7,2),
  required_readings smallint not null default 1 check (required_readings between 1 and 3),
  reading_times jsonb not null default '[]'::jsonb check (jsonb_typeof(reading_times) = 'array' and jsonb_array_length(reading_times) <= 3),
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (critical_min is null or critical_max is null or critical_max >= critical_min),
  unique nulls not distinct (user_id, location_id, name)
);

create index if not exists haccp_equipment_user_sort_idx on public.haccp_equipment(user_id, active, sort_order);
create index if not exists haccp_equipment_location_idx on public.haccp_equipment(location_id);

alter table public.haccp_routine_profiles enable row level security;
alter table public.haccp_equipment enable row level security;

revoke all on table public.haccp_routine_profiles, public.haccp_equipment from anon, authenticated;
grant select, insert, update, delete on table public.haccp_routine_profiles, public.haccp_equipment to authenticated;

drop policy if exists haccp_routine_profiles_owner_all on public.haccp_routine_profiles;
create policy haccp_routine_profiles_owner_all on public.haccp_routine_profiles for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists haccp_equipment_owner_all on public.haccp_equipment;
create policy haccp_equipment_owner_all on public.haccp_equipment for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop trigger if exists haccp_routine_profiles_set_updated_at on public.haccp_routine_profiles;
create trigger haccp_routine_profiles_set_updated_at before update on public.haccp_routine_profiles
  for each row execute function private.set_updated_at();
drop trigger if exists haccp_equipment_set_updated_at on public.haccp_equipment;
create trigger haccp_equipment_set_updated_at before update on public.haccp_equipment
  for each row execute function private.set_updated_at();

commit;
