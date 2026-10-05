begin;

-- Release 0.5: fotografii private, oferte multiple de furnizor, importuri de
-- vanzari si versiuni de reteta. Toate randurile sunt izolate pe proprietar;
-- membrii workspace-ului primesc doar SELECT, la fel ca pentru retete.

alter table public.recipes
  add column if not exists photo_path text;

alter table public.ingredient_catalog
  add column if not exists price_source text,
  add column if not exists price_source_date date;

alter table public.ingredient_price_history
  add column if not exists source text,
  add column if not exists source_date date,
  add column if not exists supplier text;

create table if not exists public.ingredient_supplier_offers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  catalog_id uuid not null references public.ingredient_catalog(id) on delete cascade,
  supplier_name text not null check (length(btrim(supplier_name)) between 1 and 160),
  unit_price numeric not null check (unit_price >= 0 and unit_price < 1000000000),
  price_unit text not null check (price_unit in ('kg', 'l', 'buc')),
  package_quantity numeric check (package_quantity is null or package_quantity > 0),
  package_price numeric check (package_price is null or package_price >= 0),
  source text,
  source_date date,
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists supplier_offers_catalog_idx
  on public.ingredient_supplier_offers (catalog_id, unit_price);
create unique index if not exists supplier_offers_one_active_idx
  on public.ingredient_supplier_offers (catalog_id)
  where is_active;

drop trigger if exists supplier_offers_set_updated_at on public.ingredient_supplier_offers;
create trigger supplier_offers_set_updated_at
  before update on public.ingredient_supplier_offers
  for each row execute function private.set_updated_at();

alter table public.ingredient_supplier_offers enable row level security;

drop policy if exists supplier_offers_select_entitled on public.ingredient_supplier_offers;
create policy supplier_offers_select_entitled on public.ingredient_supplier_offers
  for select to authenticated
  using (
    ((select auth.uid()) = user_id and (select public.has_professional_access()))
    or (select public.is_active_viewer_of(user_id))
  );

drop policy if exists supplier_offers_insert_own on public.ingredient_supplier_offers;
create policy supplier_offers_insert_own on public.ingredient_supplier_offers
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists supplier_offers_update_own on public.ingredient_supplier_offers;
create policy supplier_offers_update_own on public.ingredient_supplier_offers
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists supplier_offers_delete_own on public.ingredient_supplier_offers;
create policy supplier_offers_delete_own on public.ingredient_supplier_offers
  for delete to authenticated
  using ((select auth.uid()) = user_id);

revoke all on table public.ingredient_supplier_offers from anon, authenticated;
grant select, insert, update, delete on table public.ingredient_supplier_offers to authenticated;

-- Importul de vanzari ramane auditabil pe luna si sursa. Upsert-ul pe
-- (user, reteta, perioada) face reimportul aceluiasi raport idempotent.
create table if not exists public.menu_sales (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  recipe_id uuid not null references public.recipes(id) on delete cascade,
  period_start date not null,
  portions numeric not null default 0 check (portions >= 0),
  source text not null default 'manual',
  source_reference text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, recipe_id, period_start)
);

create index if not exists menu_sales_user_period_idx
  on public.menu_sales (user_id, period_start desc);

drop trigger if exists menu_sales_set_updated_at on public.menu_sales;
create trigger menu_sales_set_updated_at
  before update on public.menu_sales
  for each row execute function private.set_updated_at();

alter table public.menu_sales enable row level security;

drop policy if exists menu_sales_select_entitled on public.menu_sales;
create policy menu_sales_select_entitled on public.menu_sales
  for select to authenticated
  using (
    ((select auth.uid()) = user_id and (select public.has_professional_access()))
    or (select public.is_active_viewer_of(user_id))
  );
drop policy if exists menu_sales_insert_own on public.menu_sales;
create policy menu_sales_insert_own on public.menu_sales
  for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists menu_sales_update_own on public.menu_sales;
create policy menu_sales_update_own on public.menu_sales
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
drop policy if exists menu_sales_delete_own on public.menu_sales;
create policy menu_sales_delete_own on public.menu_sales
  for delete to authenticated using ((select auth.uid()) = user_id);

revoke all on table public.menu_sales from anon, authenticated;
grant select, insert, update, delete on table public.menu_sales to authenticated;

-- Snapshot-ul este creat explicit de client chiar inaintea unei salvari.
-- Functia reciteste starea de pe server: clientul nu poate falsifica jurnalul.
create table if not exists public.recipe_versions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  recipe_id uuid not null references public.recipes(id) on delete cascade,
  version_number integer not null check (version_number > 0),
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object'),
  changed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (recipe_id, version_number)
);

create index if not exists recipe_versions_recipe_idx
  on public.recipe_versions (recipe_id, version_number desc);
alter table public.recipe_versions enable row level security;

drop policy if exists recipe_versions_select_entitled on public.recipe_versions;
create policy recipe_versions_select_entitled on public.recipe_versions
  for select to authenticated
  using (
    ((select auth.uid()) = user_id and (select public.has_professional_access()))
    or (select public.is_active_viewer_of(user_id))
  );

revoke all on table public.recipe_versions from anon, authenticated;
grant select on table public.recipe_versions to authenticated;

create or replace function public.foodcost_capture_recipe_version(p_recipe_id uuid)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  version_id uuid;
begin
  if uid is null then raise exception 'AUTH_REQUIRED'; end if;
  if not exists (
    select 1 from public.recipes r where r.id = p_recipe_id and r.user_id = uid
  ) then raise exception 'RECIPE_NOT_FOUND'; end if;

  perform pg_advisory_xact_lock(hashtextextended(p_recipe_id::text, 271828));

  insert into public.recipe_versions (
    user_id, recipe_id, version_number, snapshot, changed_by
  )
  select
    r.user_id,
    r.id,
    coalesce((select max(v.version_number) from public.recipe_versions v where v.recipe_id = r.id), 0) + 1,
    to_jsonb(r) || jsonb_build_object(
      'ingredients', coalesce((
        select jsonb_agg(to_jsonb(i) order by i.position, i.created_at)
        from public.recipe_ingredients i
        where i.recipe_id = r.id and i.user_id = r.user_id
      ), '[]'::jsonb)
    ),
    uid
  from public.recipes r
  where r.id = p_recipe_id and r.user_id = uid
  returning id into version_id;

  return version_id;
end
$$;

revoke all on function public.foodcost_capture_recipe_version(uuid) from public, anon;
grant execute on function public.foodcost_capture_recipe_version(uuid) to authenticated, service_role;

-- Istoricul de pret pastreaza si provenienta curenta a pretului.
create or replace function private.log_catalog_price_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.purchase_price is distinct from old.purchase_price then
    insert into public.ingredient_price_history (
      user_id, catalog_id, old_price, new_price, delta_percent,
      source, source_date, supplier
    ) values (
      new.user_id,
      new.id,
      old.purchase_price,
      new.purchase_price,
      case
        when old.purchase_price is not null and old.purchase_price > 0
          then round(((new.purchase_price - old.purchase_price) / old.purchase_price) * 1000) / 10
        else null
      end,
      new.price_source,
      new.price_source_date,
      new.supplier
    );
  end if;
  return new;
end
$$;

-- Bucket privat. Cheia obiectului incepe obligatoriu cu UUID-ul contului;
-- membrii activi ai acelui workspace pot doar citi fotografia.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'recipe-images', 'recipe-images', false, 5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists recipe_images_select_entitled on storage.objects;
create policy recipe_images_select_entitled on storage.objects
  for select to authenticated
  using (
    bucket_id = 'recipe-images'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or exists (
        select 1 from public.workspace_members wm
        where wm.owner_user_id::text = (storage.foldername(name))[1]
          and wm.member_user_id = (select auth.uid())
          and wm.status = 'active'
      )
    )
  );

drop policy if exists recipe_images_insert_own on storage.objects;
create policy recipe_images_insert_own on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'recipe-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists recipe_images_update_own on storage.objects;
create policy recipe_images_update_own on storage.objects
  for update to authenticated
  using (
    bucket_id = 'recipe-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'recipe-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists recipe_images_delete_own on storage.objects;
create policy recipe_images_delete_own on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'recipe-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

notify pgrst, 'reload schema';

commit;
