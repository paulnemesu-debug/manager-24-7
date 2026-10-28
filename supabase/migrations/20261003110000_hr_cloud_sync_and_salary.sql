-- Manager 24/7 1.4.5: HR sincronizat în cont, salarii lunare și pontaj unic pe zi.

create table if not exists public.hr_employees (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 160),
  role text not null default '' check (length(role) <= 160),
  location_id uuid,
  location_name text not null default '' check (length(location_name) <= 200),
  gross_salary numeric(12, 2) check (gross_salary is null or gross_salary between 0 and 9999999999.99),
  net_salary numeric(12, 2) check (net_salary is null or net_salary between 0 and 9999999999.99),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint hr_employees_user_id_id_key unique (user_id, id)
);

comment on table public.hr_employees is
  'Fișele de personal Manager 24/7, izolate per cont; salariile sunt valori lunare introduse de administrator.';

create table if not exists public.hr_shifts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  employee_id uuid not null,
  work_date date not null,
  planned_start text not null default '08:00'
    check (planned_start ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  planned_end text not null default '16:00'
    check (planned_end ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  actual_start text not null default ''
    check (actual_start = '' or actual_start ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  actual_end text not null default ''
    check (actual_end = '' or actual_end ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  status text not null default 'scheduled'
    check (status in ('scheduled', 'present', 'absent', 'leave', 'day_off')),
  notes text not null default '' check (length(notes) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint hr_shifts_employee_owner_fkey
    foreign key (user_id, employee_id)
    references public.hr_employees(user_id, id)
    on delete cascade,
  constraint hr_shifts_one_entry_per_day_key unique (user_id, employee_id, work_date)
);

comment on table public.hr_shifts is
  'Program și prezență; există maximum o înregistrare per angajat și zi.';

create index if not exists hr_employees_user_id_idx
  on public.hr_employees(user_id);
create index if not exists hr_shifts_user_date_idx
  on public.hr_shifts(user_id, work_date desc);
create index if not exists hr_shifts_employee_date_idx
  on public.hr_shifts(employee_id, work_date desc);

drop trigger if exists hr_employees_set_updated_at on public.hr_employees;
create trigger hr_employees_set_updated_at
  before update on public.hr_employees
  for each row execute function private.set_updated_at();

drop trigger if exists hr_shifts_set_updated_at on public.hr_shifts;
create trigger hr_shifts_set_updated_at
  before update on public.hr_shifts
  for each row execute function private.set_updated_at();

alter table public.hr_employees enable row level security;
alter table public.hr_shifts enable row level security;

drop policy if exists "hr_employees_select_own" on public.hr_employees;
create policy "hr_employees_select_own"
  on public.hr_employees for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "hr_employees_insert_own" on public.hr_employees;
create policy "hr_employees_insert_own"
  on public.hr_employees for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "hr_employees_update_own" on public.hr_employees;
create policy "hr_employees_update_own"
  on public.hr_employees for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "hr_employees_delete_own" on public.hr_employees;
create policy "hr_employees_delete_own"
  on public.hr_employees for delete to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "hr_shifts_select_own" on public.hr_shifts;
create policy "hr_shifts_select_own"
  on public.hr_shifts for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "hr_shifts_insert_own" on public.hr_shifts;
create policy "hr_shifts_insert_own"
  on public.hr_shifts for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "hr_shifts_update_own" on public.hr_shifts;
create policy "hr_shifts_update_own"
  on public.hr_shifts for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "hr_shifts_delete_own" on public.hr_shifts;
create policy "hr_shifts_delete_own"
  on public.hr_shifts for delete to authenticated
  using ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.hr_employees to authenticated;
grant select, insert, update, delete on public.hr_shifts to authenticated;

