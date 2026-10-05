begin;

-- Facturile exprimă frecvent prețul pe bax, sac sau recipient. Păstrăm atât
-- valorile facturii, cât și purchase_price calculat per kg/l/buc, pentru ca
-- rețetele și importurile vechi să rămână compatibile.
alter table public.ingredient_catalog
  add column if not exists package_quantity numeric,
  add column if not exists package_price numeric;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'ingredient_catalog_package_quantity_check'
      and conrelid = 'public.ingredient_catalog'::regclass
  ) then
    alter table public.ingredient_catalog
      add constraint ingredient_catalog_package_quantity_check
      check (package_quantity is null or package_quantity > 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'ingredient_catalog_package_price_check'
      and conrelid = 'public.ingredient_catalog'::regclass
  ) then
    alter table public.ingredient_catalog
      add constraint ingredient_catalog_package_price_check
      check (package_price is null or package_price >= 0);
  end if;
end
$$;

-- Valuta și TVA-ul implicit sunt preferințe ale contului, nu constante ale
-- aplicației. TVA-ul rețetei rămâne salvat separat, astfel încât istoricul nu
-- se modifică retroactiv când utilizatorul schimbă valoarea implicită.
create table if not exists public.user_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  currency text not null default 'RON'
    check (currency in ('RON', 'EUR', 'GBP', 'USD', 'HUF', 'PLN', 'BGN')),
  default_vat_percent numeric not null default 11
    check (default_vat_percent >= 0 and default_vat_percent <= 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists user_preferences_set_updated_at on public.user_preferences;
create trigger user_preferences_set_updated_at
  before update on public.user_preferences
  for each row execute function private.set_updated_at();

alter table public.user_preferences enable row level security;

drop policy if exists user_preferences_select_own on public.user_preferences;
create policy user_preferences_select_own on public.user_preferences
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists user_preferences_insert_own on public.user_preferences;
create policy user_preferences_insert_own on public.user_preferences
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists user_preferences_update_own on public.user_preferences;
create policy user_preferences_update_own on public.user_preferences
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists user_preferences_delete_own on public.user_preferences;
create policy user_preferences_delete_own on public.user_preferences
  for delete to authenticated
  using ((select auth.uid()) = user_id);

revoke all on table public.user_preferences from anon, authenticated;
grant select, insert, update, delete on table public.user_preferences to authenticated;

commit;
