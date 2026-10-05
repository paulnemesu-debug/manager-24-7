begin;

-- Păstrăm perechea utilizator–catalog în aceeași cheie pentru ca o potrivire
-- învățată din factură să nu poată indica ingredientul altui cont.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'ingredient_catalog_user_id_id_key'
      and conrelid = 'public.ingredient_catalog'::regclass
  ) then
    alter table public.ingredient_catalog
      add constraint ingredient_catalog_user_id_id_key unique (user_id, id);
  end if;
end
$$;

create table if not exists public.supplier_product_mappings (
  user_id uuid not null references auth.users(id) on delete cascade,
  supplier text not null check (length(btrim(supplier)) > 0),
  source_name text not null check (length(btrim(source_name)) > 0),
  normalized_name text not null check (length(btrim(normalized_name)) > 0),
  catalog_id uuid not null,
  last_confirmed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  primary key (user_id, supplier, normalized_name),
  constraint supplier_product_mappings_catalog_fk
    foreign key (user_id, catalog_id)
    references public.ingredient_catalog(user_id, id)
    on delete cascade
);

-- Indexul cheii primare acoperă filtrarea RLS după user_id; acesta acoperă
-- cascada și verificările pornite de la ingredientul din catalog.
create index if not exists supplier_product_mappings_catalog_idx
  on public.supplier_product_mappings (catalog_id);

alter table public.supplier_product_mappings enable row level security;

drop policy if exists supplier_product_mappings_select_own
  on public.supplier_product_mappings;
create policy supplier_product_mappings_select_own
  on public.supplier_product_mappings
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists supplier_product_mappings_insert_own
  on public.supplier_product_mappings;
create policy supplier_product_mappings_insert_own
  on public.supplier_product_mappings
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists supplier_product_mappings_update_own
  on public.supplier_product_mappings;
create policy supplier_product_mappings_update_own
  on public.supplier_product_mappings
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists supplier_product_mappings_delete_own
  on public.supplier_product_mappings;
create policy supplier_product_mappings_delete_own
  on public.supplier_product_mappings
  for delete to authenticated
  using ((select auth.uid()) = user_id);

revoke all on table public.supplier_product_mappings from public, anon, authenticated;
grant select, insert, update, delete on table public.supplier_product_mappings to authenticated;

commit;
