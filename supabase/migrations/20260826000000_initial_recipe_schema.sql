begin;

-- The first production version of MANAGER 24/7 created these two tables from
-- the dashboard, before versioned migrations were introduced. Keep that
-- historical prerequisite explicit so a new project can be built from zero.
create table if not exists public.recipes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  category text,
  servings numeric not null check (servings > 0),
  sale_price_gross numeric check (sale_price_gross is null or sale_price_gross >= 0),
  vat_percent numeric not null default 19 check (vat_percent >= 0 and vat_percent <= 100),
  target_food_cost numeric not null default 30 check (target_food_cost > 0 and target_food_cost < 100),
  total_cost numeric not null default 0 check (total_cost >= 0),
  portion_cost numeric not null default 0 check (portion_cost >= 0),
  sale_price_net numeric not null default 0 check (sale_price_net >= 0),
  food_cost_percent numeric not null default 0 check (food_cost_percent >= 0),
  contribution_margin numeric not null default 0,
  contribution_margin_percent numeric not null default 0,
  recommended_price_net numeric not null default 0 check (recommended_price_net >= 0),
  recommended_price_gross numeric not null default 0 check (recommended_price_gross >= 0),
  contribution_consent boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);

create table if not exists public.recipe_ingredients (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  ingredient_name text not null,
  normalized_name text,
  quantity_net numeric not null check (quantity_net >= 0),
  unit text not null check (unit in ('g', 'kg', 'ml', 'l', 'buc')),
  purchase_price numeric not null check (purchase_price >= 0),
  price_unit text not null check (price_unit in ('kg', 'l', 'buc')),
  loss_percent numeric not null default 0 check (loss_percent >= 0 and loss_percent < 100),
  purchase_quantity numeric not null default 0 check (purchase_quantity >= 0),
  line_cost numeric not null default 0 check (line_cost >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint recipe_ingredients_recipe_owner_fk
    foreign key (recipe_id, user_id)
    references public.recipes(id, user_id)
    on delete cascade
);

create index if not exists recipes_user_id_idx on public.recipes (user_id);
create index if not exists recipes_created_at_idx on public.recipes (created_at desc);
create index if not exists recipe_ingredients_recipe_id_idx
  on public.recipe_ingredients (recipe_id);
create index if not exists recipe_ingredients_user_id_idx
  on public.recipe_ingredients (user_id);

alter table public.recipes enable row level security;
alter table public.recipe_ingredients enable row level security;

drop policy if exists recipes_select_own on public.recipes;
create policy recipes_select_own on public.recipes
  for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists recipes_insert_own on public.recipes;
create policy recipes_insert_own on public.recipes
  for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists recipes_update_own on public.recipes;
create policy recipes_update_own on public.recipes
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
drop policy if exists recipes_delete_own on public.recipes;
create policy recipes_delete_own on public.recipes
  for delete to authenticated using ((select auth.uid()) = user_id);

drop policy if exists recipe_ingredients_select_own on public.recipe_ingredients;
create policy recipe_ingredients_select_own on public.recipe_ingredients
  for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists recipe_ingredients_insert_own on public.recipe_ingredients;
create policy recipe_ingredients_insert_own on public.recipe_ingredients
  for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists recipe_ingredients_update_own on public.recipe_ingredients;
create policy recipe_ingredients_update_own on public.recipe_ingredients
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
drop policy if exists recipe_ingredients_delete_own on public.recipe_ingredients;
create policy recipe_ingredients_delete_own on public.recipe_ingredients
  for delete to authenticated using ((select auth.uid()) = user_id);

revoke all on table public.recipes, public.recipe_ingredients from anon, authenticated;
grant select, insert, update, delete on table public.recipes, public.recipe_ingredients
  to authenticated;

commit;
