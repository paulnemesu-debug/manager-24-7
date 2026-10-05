begin;

create table if not exists public.stock_policies (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  location_id uuid references public.business_locations(id) on delete cascade,
  catalog_id uuid not null references public.ingredient_catalog(id) on delete cascade,
  minimum_quantity numeric(14,3) not null default 0 check (minimum_quantity >= 0),
  target_quantity numeric(14,3) not null default 0 check (target_quantity >= minimum_quantity),
  storage_zone text not null default '' check (length(storage_zone) <= 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique nulls not distinct (user_id, location_id, catalog_id)
);

create table if not exists public.supplier_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  location_id uuid references public.business_locations(id) on delete set null,
  supplier text not null check (length(btrim(supplier)) between 1 and 160),
  order_date date not null default current_date,
  status text not null default 'draft' check (status in ('draft', 'sent', 'received', 'cancelled')),
  lines jsonb not null default '[]'::jsonb check (jsonb_typeof(lines) = 'array' and jsonb_array_length(lines) <= 1000),
  total_estimated numeric(14,2) not null default 0 check (total_estimated >= 0),
  notes text not null default '' check (length(notes) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.waste_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  location_id uuid references public.business_locations(id) on delete set null,
  event_date date not null default current_date,
  catalog_id uuid references public.ingredient_catalog(id) on delete set null,
  item_name text not null check (length(btrim(item_name)) between 1 and 180),
  quantity numeric(14,3) not null check (quantity > 0),
  unit text not null check (unit in ('g','kg','ml','l','buc')),
  unit_cost numeric(14,4) not null default 0 check (unit_cost >= 0),
  reason text not null check (reason in ('expired','preparation','overproduction','quality','plate','other')),
  notes text not null default '' check (length(notes) <= 2000),
  waste_value numeric(14,2) generated always as (round(quantity * unit_cost, 2)) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.inventory_schedules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  location_id uuid references public.business_locations(id) on delete cascade,
  frequency text not null check (frequency in ('weekly','monthly')),
  weekday smallint check (weekday between 0 and 6),
  month_day smallint check (month_day between 1 and 28),
  enabled boolean not null default true,
  next_due_date date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique nulls not distinct (user_id, location_id)
);

create index if not exists stock_policies_location_idx on public.stock_policies(user_id, location_id, storage_zone);
create index if not exists stock_policies_catalog_idx on public.stock_policies(catalog_id);
create index if not exists supplier_orders_user_date_idx on public.supplier_orders(user_id, order_date desc);
create index if not exists supplier_orders_location_idx on public.supplier_orders(location_id);
create index if not exists waste_entries_user_date_idx on public.waste_entries(user_id, event_date desc);
create index if not exists waste_entries_catalog_idx on public.waste_entries(catalog_id);
create index if not exists waste_entries_location_idx on public.waste_entries(location_id);
create index if not exists inventory_schedules_due_idx on public.inventory_schedules(user_id, enabled, next_due_date);
create index if not exists inventory_schedules_location_idx on public.inventory_schedules(location_id);

do $$
declare table_name text;
begin
  foreach table_name in array array['stock_policies','supplier_orders','waste_entries','inventory_schedules'] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all on table public.%I from anon, authenticated', table_name);
    execute format('grant select, insert, update, delete on table public.%I to authenticated', table_name);
    execute format('drop policy if exists %I on public.%I', table_name || '_owner_all', table_name);
    execute format(
      'create policy %I on public.%I for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)',
      table_name || '_owner_all', table_name
    );
    execute format('drop trigger if exists %I on public.%I', table_name || '_set_updated_at', table_name);
    execute format(
      'create trigger %I before update on public.%I for each row execute function private.set_updated_at()',
      table_name || '_set_updated_at', table_name
    );
  end loop;
end $$;

commit;
