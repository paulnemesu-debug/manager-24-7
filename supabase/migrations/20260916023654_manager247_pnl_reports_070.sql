-- Manager 24/7 0.7: raport managerial P&L lunar.
-- Indicatorii derivați (marje, EBITDA, break-even) se recalculează în client;
-- tabela păstrează numai valorile introduse de manager.

create table if not exists public.pnl_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  period date not null,
  revenue_food numeric(14, 2) not null default 0 check (revenue_food between 0 and 999999999999.99),
  revenue_beverage numeric(14, 2) not null default 0 check (revenue_beverage between 0 and 999999999999.99),
  revenue_other numeric(14, 2) not null default 0 check (revenue_other between 0 and 999999999999.99),
  cogs_food numeric(14, 2) not null default 0 check (cogs_food between 0 and 999999999999.99),
  cogs_beverage numeric(14, 2) not null default 0 check (cogs_beverage between 0 and 999999999999.99),
  packaging_cost numeric(14, 2) not null default 0 check (packaging_cost between 0 and 999999999999.99),
  payroll_cost numeric(14, 2) not null default 0 check (payroll_cost between 0 and 999999999999.99),
  rent_cost numeric(14, 2) not null default 0 check (rent_cost between 0 and 999999999999.99),
  utilities_cost numeric(14, 2) not null default 0 check (utilities_cost between 0 and 999999999999.99),
  delivery_commissions numeric(14, 2) not null default 0 check (delivery_commissions between 0 and 999999999999.99),
  marketing_cost numeric(14, 2) not null default 0 check (marketing_cost between 0 and 999999999999.99),
  maintenance_cost numeric(14, 2) not null default 0 check (maintenance_cost between 0 and 999999999999.99),
  admin_software_cost numeric(14, 2) not null default 0 check (admin_software_cost between 0 and 999999999999.99),
  other_operating_cost numeric(14, 2) not null default 0 check (other_operating_cost between 0 and 999999999999.99),
  taxes_interest_depreciation numeric(14, 2) not null default 0 check (taxes_interest_depreciation between 0 and 999999999999.99),
  notes text check (notes is null or length(notes) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pnl_reports_month_start_check
    check (period = date_trunc('month', period::timestamp)::date),
  constraint pnl_reports_user_period_key unique (user_id, period)
);

comment on table public.pnl_reports is
  'Raport P&L managerial lunar introdus de utilizator în Manager 24/7; nu reprezintă o situație financiar-contabilă oficială.';

drop trigger if exists pnl_reports_set_updated_at on public.pnl_reports;
create trigger pnl_reports_set_updated_at
  before update on public.pnl_reports
  for each row execute function private.set_updated_at();

alter table public.pnl_reports enable row level security;

drop policy if exists "pnl_reports_select_own" on public.pnl_reports;
create policy "pnl_reports_select_own"
  on public.pnl_reports for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "pnl_reports_insert_own" on public.pnl_reports;
create policy "pnl_reports_insert_own"
  on public.pnl_reports for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "pnl_reports_update_own" on public.pnl_reports;
create policy "pnl_reports_update_own"
  on public.pnl_reports for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "pnl_reports_delete_own" on public.pnl_reports;
create policy "pnl_reports_delete_own"
  on public.pnl_reports for delete
  to authenticated
  using ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.pnl_reports to authenticated;
