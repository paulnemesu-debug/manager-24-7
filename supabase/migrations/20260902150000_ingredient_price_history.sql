begin;

-- ---------------------------------------------------------------------------
-- Istoric de preț: de fiecare dată când se schimbă prețul unui ingredient din
-- catalog, păstrăm o linie cu prețul vechi, cel nou și variația procentuală.
-- Populat automat de un trigger — nu necesită nicio schimbare în codul care
-- deja actualizează `ingredient_catalog.purchase_price` (import de prețuri,
-- editare manuală etc.).
-- ---------------------------------------------------------------------------

create table if not exists public.ingredient_price_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  catalog_id uuid not null references public.ingredient_catalog(id) on delete cascade,
  old_price numeric,
  new_price numeric not null check (new_price >= 0),
  delta_percent numeric,
  recorded_at timestamptz not null default now()
);

create index if not exists ingredient_price_history_catalog_idx
  on public.ingredient_price_history (catalog_id, recorded_at desc);

alter table public.ingredient_price_history enable row level security;

drop policy if exists price_history_select_own on public.ingredient_price_history;
create policy price_history_select_own on public.ingredient_price_history
  for select to authenticated
  using (
    (select auth.uid()) = user_id
    or (select public.is_active_viewer_of(user_id))
  );

-- Doar trigger-ul (security definer, mai jos) scrie aici — niciun client nu
-- inserează direct un istoric, ca să nu poată fi falsificat.
revoke all on table public.ingredient_price_history from anon, authenticated;
grant select on table public.ingredient_price_history to authenticated;

create or replace function private.log_catalog_price_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.purchase_price is distinct from old.purchase_price then
    insert into public.ingredient_price_history (
      user_id, catalog_id, old_price, new_price, delta_percent
    ) values (
      new.user_id,
      new.id,
      old.purchase_price,
      new.purchase_price,
      case
        when old.purchase_price is not null and old.purchase_price > 0
          then round(((new.purchase_price - old.purchase_price) / old.purchase_price) * 1000) / 10
        else null
      end
    );
  end if;
  return new;
end;
$$;

revoke all on function private.log_catalog_price_change() from public, anon, authenticated;

drop trigger if exists catalog_price_history on public.ingredient_catalog;
create trigger catalog_price_history
  after update of purchase_price on public.ingredient_catalog
  for each row execute function private.log_catalog_price_change();

commit;
