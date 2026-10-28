-- MANAGER 24/7 · Modul Risipă și Redistribuire
-- Evidență operațională și documente de lucru pentru Legea 217/2016.

create table if not exists public.waste_prevention_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  location_id uuid null references public.business_locations(id) on delete set null,
  reporting_year integer not null check (reporting_year between 2024 and 2100),
  company_name text not null default '',
  company_tax_id text not null default '',
  company_address text not null default '',
  legal_representative text not null default '',
  responsible_person text not null default '',
  measures jsonb not null default '[]'::jsonb check (jsonb_typeof(measures) = 'array'),
  objectives text not null default '',
  status text not null default 'draft' check (status in ('draft','final','submitted')),
  submitted_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, location_id, reporting_year)
);

create table if not exists public.waste_receivers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  tax_id text not null default '',
  county text not null default '',
  authorization_reference text not null default '',
  contact text not null default '',
  contract_reference text not null default '',
  contract_date date null,
  notes text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.food_redistributions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  location_id uuid null references public.business_locations(id) on delete set null,
  transfer_date date not null,
  destination_type text not null check (destination_type in ('consumer','receiver')),
  receiver_id uuid null references public.waste_receivers(id) on delete set null,
  product_name text not null,
  product_category text not null default '',
  quantity numeric(14,3) not null check (quantity > 0),
  unit text not null check (unit in ('g','kg','ml','l','buc')),
  estimated_value numeric(14,2) not null default 0 check (estimated_value >= 0),
  expiry_date date null,
  consumer_count integer null check (consumer_count is null or consumer_count >= 0),
  document_reference text not null default '',
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (destination_type = 'consumer' and receiver_id is null)
    or (destination_type = 'receiver' and receiver_id is not null)
  )
);

create index if not exists waste_plans_user_year_idx on public.waste_prevention_plans(user_id, reporting_year desc);
create index if not exists waste_plans_location_idx on public.waste_prevention_plans(location_id);
create index if not exists waste_receivers_user_idx on public.waste_receivers(user_id, active);
create index if not exists food_redistributions_user_date_idx on public.food_redistributions(user_id, transfer_date desc);
create index if not exists food_redistributions_receiver_idx on public.food_redistributions(receiver_id);
create index if not exists food_redistributions_location_idx on public.food_redistributions(location_id);

alter table public.waste_prevention_plans enable row level security;
alter table public.waste_receivers enable row level security;
alter table public.food_redistributions enable row level security;

do $$
declare table_name text;
begin
  foreach table_name in array array['waste_prevention_plans','waste_receivers','food_redistributions'] loop
    execute format('drop policy if exists %I on public.%I', table_name || '_select_own', table_name);
    execute format('drop policy if exists %I on public.%I', table_name || '_insert_own', table_name);
    execute format('drop policy if exists %I on public.%I', table_name || '_update_own', table_name);
    execute format('drop policy if exists %I on public.%I', table_name || '_delete_own', table_name);
    execute format('create policy %I on public.%I for select to authenticated using ((select auth.uid()) = user_id)', table_name || '_select_own', table_name);
    execute format('create policy %I on public.%I for insert to authenticated with check ((select auth.uid()) = user_id)', table_name || '_insert_own', table_name);
    execute format('create policy %I on public.%I for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)', table_name || '_update_own', table_name);
    execute format('create policy %I on public.%I for delete to authenticated using ((select auth.uid()) = user_id)', table_name || '_delete_own', table_name);
  end loop;
end $$;

revoke all on public.waste_prevention_plans, public.waste_receivers, public.food_redistributions from anon;
grant select, insert, update, delete on public.waste_prevention_plans, public.waste_receivers, public.food_redistributions to authenticated;
grant select, insert, update, delete on public.waste_prevention_plans, public.waste_receivers, public.food_redistributions to service_role;
