begin;

-- Acces beta 1.0: orice cont autentificat își poate folosi propriile date.
-- Politicile RLS păstrează izolarea strictă pe auth.uid(); monetizarea va
-- reactiva verificarea abonamentului într-o migrare separată.
create or replace function public.has_professional_access()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select auth.uid() is not null;
$$;

revoke all on function public.has_professional_access() from public, anon;
grant execute on function public.has_professional_access() to authenticated;

-- Locații și roluri operaționale. owner_user_id rămâne proprietarul datelor;
-- location_id permite separarea prețurilor și rapoartelor fără baze distincte.
create table if not exists public.business_locations (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 120),
  address text check (address is null or length(address) <= 300),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_user_id, name)
);

alter table public.workspace_members drop constraint if exists workspace_members_role_check;
alter table public.workspace_members add constraint workspace_members_role_check
  check (role in ('manager', 'head_chef', 'viewer'));
alter table public.workspace_members add column if not exists location_id uuid
  references public.business_locations(id) on delete set null;

create table if not exists public.inventory_counts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  location_id uuid references public.business_locations(id) on delete set null,
  counted_at date not null default current_date,
  status text not null default 'draft' check (status in ('draft', 'confirmed')),
  lines jsonb not null default '[]'::jsonb
    check (jsonb_typeof(lines) = 'array' and jsonb_array_length(lines) <= 2000),
  total_value numeric(14,2) not null default 0 check (total_value >= 0),
  notes text check (notes is null or length(notes) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sales_imports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  location_id uuid references public.business_locations(id) on delete set null,
  period_start date not null,
  period_end date not null check (period_end >= period_start),
  source_name text not null default 'CSV' check (length(source_name) <= 160),
  column_mapping jsonb not null default '{}'::jsonb,
  rows jsonb not null default '[]'::jsonb
    check (jsonb_typeof(rows) = 'array' and jsonb_array_length(rows) <= 10000),
  total_revenue numeric(14,2) not null default 0 check (total_revenue >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.labor_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  location_id uuid references public.business_locations(id) on delete set null,
  work_date date not null default current_date,
  employee_name text not null check (length(btrim(employee_name)) between 1 and 160),
  role text check (role is null or length(role) <= 100),
  hours numeric(8,2) not null check (hours between 0 and 24),
  hourly_cost numeric(12,2) not null check (hourly_cost >= 0),
  total_cost numeric(12,2) generated always as (round(hours * hourly_cost, 2)) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.product_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  event_name text not null check (event_name ~ '^[a-z0-9_]{2,80}$'),
  app_version text not null check (length(app_version) <= 30),
  platform text not null check (platform in ('android','ios','web')),
  properties jsonb not null default '{}'::jsonb check (pg_column_size(properties) <= 4096),
  created_at timestamptz not null default now()
);

create index if not exists business_locations_owner_idx on public.business_locations(owner_user_id, active);
create index if not exists inventory_counts_user_date_idx on public.inventory_counts(user_id, counted_at desc);
create index if not exists sales_imports_user_period_idx on public.sales_imports(user_id, period_end desc);
create index if not exists labor_entries_user_date_idx on public.labor_entries(user_id, work_date desc);
create index if not exists product_events_user_date_idx on public.product_events(user_id, created_at desc);

do $$
declare table_name text;
begin
  foreach table_name in array array['business_locations','inventory_counts','sales_imports','labor_entries','product_events'] loop
    execute format('alter table public.%I enable row level security', table_name);
  end loop;
end $$;

drop policy if exists business_locations_owner_all on public.business_locations;
create policy business_locations_owner_all on public.business_locations for all to authenticated
  using ((select auth.uid()) = owner_user_id) with check ((select auth.uid()) = owner_user_id);

drop policy if exists inventory_counts_owner_all on public.inventory_counts;
create policy inventory_counts_owner_all on public.inventory_counts for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists sales_imports_owner_all on public.sales_imports;
create policy sales_imports_owner_all on public.sales_imports for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists labor_entries_owner_all on public.labor_entries;
create policy labor_entries_owner_all on public.labor_entries for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists product_events_insert_own on public.product_events;
create policy product_events_insert_own on public.product_events for insert to authenticated
  with check ((select auth.uid()) = user_id);
drop policy if exists product_events_select_own on public.product_events;
create policy product_events_select_own on public.product_events for select to authenticated
  using ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.business_locations,
  public.inventory_counts, public.sales_imports, public.labor_entries to authenticated;
grant select, insert on public.product_events to authenticated;

drop trigger if exists business_locations_set_updated_at on public.business_locations;
create trigger business_locations_set_updated_at before update on public.business_locations
  for each row execute function private.set_updated_at();
drop trigger if exists inventory_counts_set_updated_at on public.inventory_counts;
create trigger inventory_counts_set_updated_at before update on public.inventory_counts
  for each row execute function private.set_updated_at();
drop trigger if exists sales_imports_set_updated_at on public.sales_imports;
create trigger sales_imports_set_updated_at before update on public.sales_imports
  for each row execute function private.set_updated_at();
drop trigger if exists labor_entries_set_updated_at on public.labor_entries;
create trigger labor_entries_set_updated_at before update on public.labor_entries
  for each row execute function private.set_updated_at();

commit;
