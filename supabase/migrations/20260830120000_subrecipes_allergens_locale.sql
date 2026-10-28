begin;

-- ---------------------------------------------------------------------------
-- 1. Rețete: semipreparate, randament, alergeni și categorii standardizate
-- ---------------------------------------------------------------------------

alter table public.recipes
  add column if not exists is_sub_recipe boolean not null default false,
  add column if not exists yield_quantity numeric not null default 1,
  add column if not exists yield_unit text not null default 'kg',
  add column if not exists manual_allergens text[] not null default '{}',
  add column if not exists allergens text[] not null default '{}';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'recipes_yield_quantity_check'
      and conrelid = 'public.recipes'::regclass
  ) then
    alter table public.recipes
      add constraint recipes_yield_quantity_check check (yield_quantity > 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'recipes_yield_unit_check'
      and conrelid = 'public.recipes'::regclass
  ) then
    alter table public.recipes
      add constraint recipes_yield_unit_check check (yield_unit in ('kg', 'l', 'buc'));
  end if;
end
$$;

-- Categoriile erau text liber. Le mutăm pe valorile standard înainte de a le
-- restrânge, ca rețetele existente să nu rămână fără categorie.
update public.recipes
set category = case
  when lower(unaccent_fallback) like '%ciorb%' or lower(unaccent_fallback) like '%sup%'
    or lower(unaccent_fallback) like '%bors%' or lower(unaccent_fallback) like 'soup%' then 'soup'
  when lower(unaccent_fallback) like '%aperitiv%' or lower(unaccent_fallback) like '%starter%'
    or lower(unaccent_fallback) like '%gustar%' then 'starter'
  when lower(unaccent_fallback) like '%principal%' or lower(unaccent_fallback) like '%main%' then 'main'
  when lower(unaccent_fallback) like '%desert%' or lower(unaccent_fallback) like '%dessert%' then 'dessert'
  when lower(unaccent_fallback) like '%salat%' or lower(unaccent_fallback) like '%salad%' then 'salad'
  when lower(unaccent_fallback) like '%garnitur%' or lower(unaccent_fallback) like '%side%' then 'side'
  else null
end
from (
  select id as source_id, translate(coalesce(category, ''), 'ăâîșțĂÂÎȘȚ', 'aaistAAIST') as unaccent_fallback
  from public.recipes
) as normalized
where public.recipes.id = normalized.source_id
  and public.recipes.category is not null
  and public.recipes.category not in ('soup', 'starter', 'main', 'dessert', 'salad', 'side');

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'recipes_category_check'
      and conrelid = 'public.recipes'::regclass
  ) then
    alter table public.recipes
      add constraint recipes_category_check
      check (category is null or category in ('soup', 'starter', 'main', 'dessert', 'salad', 'side'));
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- 2. Rânduri de rețetă: produs cumpărat sau semipreparat propriu
-- ---------------------------------------------------------------------------

alter table public.recipe_ingredients
  add column if not exists kind text not null default 'product',
  add column if not exists sub_recipe_id uuid,
  add column if not exists allergens text[] not null default '{}';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'recipe_ingredients_kind_check'
      and conrelid = 'public.recipe_ingredients'::regclass
  ) then
    alter table public.recipe_ingredients
      add constraint recipe_ingredients_kind_check check (kind in ('product', 'sub_recipe'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'recipe_ingredients_kind_reference_check'
      and conrelid = 'public.recipe_ingredients'::regclass
  ) then
    alter table public.recipe_ingredients
      add constraint recipe_ingredients_kind_reference_check
      check ((kind = 'sub_recipe') = (sub_recipe_id is not null));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'recipe_ingredients_sub_recipe_fk'
      and conrelid = 'public.recipe_ingredients'::regclass
  ) then
    -- restrict: un semipreparat folosit într-o rețetă nu poate fi șters din greșeală
    alter table public.recipe_ingredients
      add constraint recipe_ingredients_sub_recipe_fk
      foreign key (sub_recipe_id) references public.recipes(id) on delete restrict;
  end if;
end
$$;

create index if not exists recipe_ingredients_sub_recipe_idx
  on public.recipe_ingredients (sub_recipe_id)
  where sub_recipe_id is not null;

-- ---------------------------------------------------------------------------
-- 3. Catalogul de ingrediente: alergeni și pierdere implicită
-- ---------------------------------------------------------------------------

alter table public.ingredient_catalog
  add column if not exists allergens text[] not null default '{}',
  add column if not exists default_loss_percent numeric not null default 0;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'ingredient_catalog_default_loss_check'
      and conrelid = 'public.ingredient_catalog'::regclass
  ) then
    alter table public.ingredient_catalog
      add constraint ingredient_catalog_default_loss_check
      check (default_loss_percent >= 0 and default_loss_percent <= 99);
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- 4. Protecție împotriva ciclurilor între semipreparate
-- ---------------------------------------------------------------------------

create or replace function private.assert_no_recipe_cycle()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  cycle_found boolean;
begin
  if new.sub_recipe_id is null then
    return new;
  end if;

  if new.sub_recipe_id = new.recipe_id then
    raise exception 'O rețetă nu se poate conține pe ea însăși.'
      using errcode = 'check_violation';
  end if;

  with recursive descendants as (
    select new.sub_recipe_id as recipe_id
    union
    select ri.sub_recipe_id
    from public.recipe_ingredients ri
    join descendants d on ri.recipe_id = d.recipe_id
    where ri.sub_recipe_id is not null
  )
  select exists (select 1 from descendants where recipe_id = new.recipe_id)
  into cycle_found;

  if cycle_found then
    raise exception 'Semipreparatul ales conține deja această rețetă.'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

revoke all on function private.assert_no_recipe_cycle() from public, anon, authenticated;

drop trigger if exists recipe_ingredients_no_cycle on public.recipe_ingredients;
create trigger recipe_ingredients_no_cycle
  before insert or update of sub_recipe_id, recipe_id on public.recipe_ingredients
  for each row execute function private.assert_no_recipe_cycle();

-- ---------------------------------------------------------------------------
-- 5. Preferința de limbă și plata pe site
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column if not exists locale text not null default 'ro';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_locale_check'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_locale_check check (locale in ('ro', 'en'));
  end if;
end
$$;

grant update (email, business_name, locale) on table public.profiles to authenticated;
grant insert (user_id, email, business_name, locale) on table public.profiles to authenticated;

alter table public.subscriptions
  drop constraint if exists subscriptions_platform_check;

alter table public.subscriptions
  add constraint subscriptions_platform_check
  check (platform in ('google_play', 'admin_grant', 'web'));

-- ---------------------------------------------------------------------------
-- 6. Izolarea datelor pe utilizator, declarată explicit și pentru rețete
-- ---------------------------------------------------------------------------

alter table public.recipes enable row level security;
alter table public.recipe_ingredients enable row level security;

drop policy if exists recipes_select_own on public.recipes;
create policy recipes_select_own on public.recipes
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists recipes_insert_own on public.recipes;
create policy recipes_insert_own on public.recipes
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists recipes_update_own on public.recipes;
create policy recipes_update_own on public.recipes
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists recipes_delete_own on public.recipes;
create policy recipes_delete_own on public.recipes
  for delete to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists recipe_ingredients_select_own on public.recipe_ingredients;
create policy recipe_ingredients_select_own on public.recipe_ingredients
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists recipe_ingredients_insert_own on public.recipe_ingredients;
create policy recipe_ingredients_insert_own on public.recipe_ingredients
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists recipe_ingredients_update_own on public.recipe_ingredients;
create policy recipe_ingredients_update_own on public.recipe_ingredients
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists recipe_ingredients_delete_own on public.recipe_ingredients;
create policy recipe_ingredients_delete_own on public.recipe_ingredients
  for delete to authenticated
  using ((select auth.uid()) = user_id);

commit;
