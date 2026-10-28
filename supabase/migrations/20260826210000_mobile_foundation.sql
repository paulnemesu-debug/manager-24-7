begin;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text,
  business_name text,
  role text not null default 'owner'
    check (role in ('owner', 'manager', 'chef', 'consultant')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.subscriptions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  platform text not null default 'google_play'
    check (platform = 'google_play'),
  product_id text not null,
  purchase_token_hash text not null unique,
  status text not null default 'none'
    check (status in ('active', 'trialing', 'grace_period', 'paused', 'canceled', 'expired', 'refunded', 'none')),
  google_order_id text,
  current_period_start timestamptz,
  current_period_end timestamptz,
  auto_renew boolean not null default false,
  last_verified_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ingredient_catalog (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (length(btrim(name)) > 0),
  normalized_name text not null check (length(btrim(normalized_name)) > 0),
  purchase_price numeric not null default 0 check (purchase_price >= 0),
  price_unit text not null default 'kg'
    check (price_unit in ('kg', 'l', 'buc')),
  supplier text,
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, normalized_name)
);

alter table public.recipe_ingredients
  add column if not exists ingredient_catalog_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'recipe_ingredients_catalog_fk'
      and conrelid = 'public.recipe_ingredients'::regclass
  ) then
    alter table public.recipe_ingredients
      add constraint recipe_ingredients_catalog_fk
      foreign key (ingredient_catalog_id)
      references public.ingredient_catalog(id)
      on delete set null;
  end if;
end
$$;

create index if not exists recipes_user_updated_idx
  on public.recipes (user_id, updated_at desc);
create index if not exists recipe_ingredients_recipe_idx
  on public.recipe_ingredients (recipe_id);
create index if not exists ingredient_catalog_user_name_idx
  on public.ingredient_catalog (user_id, normalized_name);
create index if not exists subscriptions_status_idx
  on public.subscriptions (status, current_period_end);

create or replace function private.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (user_id, email)
  values (new.id, new.email)
  on conflict (user_id) do update set email = excluded.email;
  return new;
end;
$$;

revoke all on function private.set_updated_at() from public, anon, authenticated;
revoke all on function private.handle_new_user() from public, anon, authenticated;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function private.set_updated_at();

drop trigger if exists subscriptions_set_updated_at on public.subscriptions;
create trigger subscriptions_set_updated_at
  before update on public.subscriptions
  for each row execute function private.set_updated_at();

drop trigger if exists ingredient_catalog_set_updated_at on public.ingredient_catalog;
create trigger ingredient_catalog_set_updated_at
  before update on public.ingredient_catalog
  for each row execute function private.set_updated_at();

alter table public.profiles enable row level security;
alter table public.subscriptions enable row level security;
alter table public.ingredient_catalog enable row level security;

drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own on public.profiles
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists subscriptions_select_own on public.subscriptions;
create policy subscriptions_select_own on public.subscriptions
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists ingredient_catalog_select_own on public.ingredient_catalog;
create policy ingredient_catalog_select_own on public.ingredient_catalog
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists ingredient_catalog_insert_own on public.ingredient_catalog;
create policy ingredient_catalog_insert_own on public.ingredient_catalog
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists ingredient_catalog_update_own on public.ingredient_catalog;
create policy ingredient_catalog_update_own on public.ingredient_catalog
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists ingredient_catalog_delete_own on public.ingredient_catalog;
create policy ingredient_catalog_delete_own on public.ingredient_catalog
  for delete to authenticated
  using ((select auth.uid()) = user_id);

revoke all on table public.profiles, public.subscriptions, public.ingredient_catalog,
  public.recipes, public.recipe_ingredients from anon, authenticated;

grant select, insert, update on table public.profiles to authenticated;
grant select on table public.subscriptions to authenticated;
grant select, insert, update, delete on table public.ingredient_catalog to authenticated;
grant select, insert, update, delete on table public.recipes, public.recipe_ingredients to authenticated;

commit;
