-- Manager 24/7 0.6: documente operaționale pentru bonuri de consum și loturi bulk.
-- Liniile rămân JSONB deoarece documentele trebuie păstrate exact cum au fost
-- confirmate la momentul producției, chiar dacă ulterior se schimbă catalogul.

create table if not exists public.consumption_vouchers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  document_date date not null default current_date,
  reference text not null default '' check (length(reference) <= 160),
  source text not null default 'manual'
    check (source in ('manual', 'file_import', 'production_plan', 'bulk_recipe')),
  source_reference text check (source_reference is null or length(source_reference) <= 500),
  notes text check (notes is null or length(notes) <= 2000),
  lines jsonb not null default '[]'::jsonb
    check (jsonb_typeof(lines) = 'array' and jsonb_array_length(lines) <= 500),
  total_cost numeric(14, 4) not null default 0
    check (total_cost >= 0 and total_cost < 1000000000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.consumption_vouchers is
  'Bonuri de consum zilnice create sau importate în Manager 24/7.';

create index if not exists consumption_vouchers_user_date_idx
  on public.consumption_vouchers (user_id, document_date desc, updated_at desc);

drop trigger if exists consumption_vouchers_set_updated_at on public.consumption_vouchers;
create trigger consumption_vouchers_set_updated_at
  before update on public.consumption_vouchers
  for each row execute function private.set_updated_at();

alter table public.consumption_vouchers enable row level security;

drop policy if exists "consumption_vouchers_select_own" on public.consumption_vouchers;
create policy "consumption_vouchers_select_own"
  on public.consumption_vouchers for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "consumption_vouchers_insert_own" on public.consumption_vouchers;
create policy "consumption_vouchers_insert_own"
  on public.consumption_vouchers for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "consumption_vouchers_update_own" on public.consumption_vouchers;
create policy "consumption_vouchers_update_own"
  on public.consumption_vouchers for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "consumption_vouchers_delete_own" on public.consumption_vouchers;
create policy "consumption_vouchers_delete_own"
  on public.consumption_vouchers for delete
  to authenticated
  using ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.consumption_vouchers to authenticated;

create table if not exists public.bulk_batches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  -- Identificator informativ al rețetei-sursă. Lotul este un snapshot și nu
  -- trebuie șters sau blocat dacă rețeta este eliminată ulterior.
  recipe_id uuid,
  batch_date date not null default current_date,
  title text not null check (length(btrim(title)) between 1 and 180),
  source text not null default 'manual'
    check (source in ('manual', 'file_import', 'consumption_voucher')),
  source_reference text check (source_reference is null or length(source_reference) <= 500),
  lines jsonb not null default '[]'::jsonb
    check (jsonb_typeof(lines) = 'array' and jsonb_array_length(lines) <= 500),
  final_weight_grams numeric(14, 3) not null default 0
    check (final_weight_grams >= 0 and final_weight_grams < 1000000000),
  portions numeric(12, 3) not null default 1
    check (portions > 0 and portions < 10000000),
  sale_price_gross numeric(14, 4) not null default 0
    check (sale_price_gross >= 0 and sale_price_gross < 1000000000),
  vat_percent numeric(6, 3) not null default 11
    check (vat_percent >= 0 and vat_percent <= 100),
  total_cost numeric(14, 4) not null default 0
    check (total_cost >= 0 and total_cost < 1000000000),
  portion_cost numeric(14, 4) not null default 0
    check (portion_cost >= 0 and portion_cost < 1000000000),
  cost_per_kg numeric(14, 4)
    check (cost_per_kg is null or (cost_per_kg >= 0 and cost_per_kg < 1000000000)),
  food_cost_percent numeric(9, 4)
    check (food_cost_percent is null or (food_cost_percent >= 0 and food_cost_percent < 100000)),
  notes text check (notes is null or length(notes) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.bulk_batches is
  'Loturi bulk cântărite și calculate în Manager 24/7.';

create index if not exists bulk_batches_user_date_idx
  on public.bulk_batches (user_id, batch_date desc, updated_at desc);
create index if not exists bulk_batches_recipe_id_idx
  on public.bulk_batches (recipe_id)
  where recipe_id is not null;

drop trigger if exists bulk_batches_set_updated_at on public.bulk_batches;
create trigger bulk_batches_set_updated_at
  before update on public.bulk_batches
  for each row execute function private.set_updated_at();

alter table public.bulk_batches enable row level security;

drop policy if exists "bulk_batches_select_own" on public.bulk_batches;
create policy "bulk_batches_select_own"
  on public.bulk_batches for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "bulk_batches_insert_own" on public.bulk_batches;
create policy "bulk_batches_insert_own"
  on public.bulk_batches for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "bulk_batches_update_own" on public.bulk_batches;
create policy "bulk_batches_update_own"
  on public.bulk_batches for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "bulk_batches_delete_own" on public.bulk_batches;
create policy "bulk_batches_delete_own"
  on public.bulk_batches for delete
  to authenticated
  using ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.bulk_batches to authenticated;

comment on table public.haccp_documents is
  'Formulare HACCP completate și exportate din Manager 24/7.';
