begin;

-- Compatibility for the already-installed 0.1.3 APK. The current server
-- model uses output_quantity/subrecipe_id; the legacy APK sends
-- yield_quantity/sub_recipe_id.
alter table public.recipes
  add column if not exists yield_quantity numeric,
  add column if not exists yield_unit text;

alter table public.recipe_ingredients
  add column if not exists kind text not null default 'product',
  add column if not exists sub_recipe_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'recipes_yield_quantity_legacy_check'
      and conrelid = 'public.recipes'::regclass
  ) then
    alter table public.recipes
      add constraint recipes_yield_quantity_legacy_check
      check (yield_quantity is null or yield_quantity > 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'recipes_yield_unit_legacy_check'
      and conrelid = 'public.recipes'::regclass
  ) then
    alter table public.recipes
      add constraint recipes_yield_unit_legacy_check
      check (yield_unit is null or yield_unit in ('kg', 'l', 'buc'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'recipe_ingredients_kind_legacy_check'
      and conrelid = 'public.recipe_ingredients'::regclass
  ) then
    alter table public.recipe_ingredients
      add constraint recipe_ingredients_kind_legacy_check
      check (kind in ('product', 'sub_recipe'));
  end if;
end
$$;

update public.recipes
set yield_quantity = output_quantity,
    yield_unit = output_unit
where yield_quantity is null;

update public.recipe_ingredients
set sub_recipe_id = subrecipe_id,
    kind = case when subrecipe_id is null then 'product' else 'sub_recipe' end
where sub_recipe_id is distinct from subrecipe_id;

create or replace function private.foodcost_sync_recipe_legacy_fields()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.yield_quantity is not null then
      new.output_quantity := new.yield_quantity;
      new.output_unit := coalesce(new.yield_unit, new.output_unit, 'buc');
    else
      new.yield_quantity := new.output_quantity;
      new.yield_unit := new.output_unit;
    end if;
  elsif new.yield_quantity is distinct from old.yield_quantity
    or new.yield_unit is distinct from old.yield_unit then
    new.output_quantity := new.yield_quantity;
    new.output_unit := coalesce(new.yield_unit, new.output_unit, 'buc');
  elsif new.output_quantity is distinct from old.output_quantity
    or new.output_unit is distinct from old.output_unit then
    new.yield_quantity := new.output_quantity;
    new.yield_unit := new.output_unit;
  end if;
  return new;
end
$$;

create or replace function private.foodcost_sync_ingredient_legacy_fields()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.sub_recipe_id is not null then
      new.subrecipe_id := new.sub_recipe_id;
    else
      new.sub_recipe_id := new.subrecipe_id;
    end if;
  elsif new.sub_recipe_id is distinct from old.sub_recipe_id then
    new.subrecipe_id := new.sub_recipe_id;
  elsif new.subrecipe_id is distinct from old.subrecipe_id then
    new.sub_recipe_id := new.subrecipe_id;
  end if;

  new.kind := case when new.subrecipe_id is null then 'product' else 'sub_recipe' end;
  return new;
end
$$;

create or replace function private.foodcost_validate_subrecipe_owner()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.subrecipe_id is not null and not exists (
    select 1 from public.recipes r
    where r.id = new.subrecipe_id
      and r.user_id = new.user_id
  ) then
    raise exception 'SUBRECIPE_NOT_FOUND_OR_FORBIDDEN'
      using errcode = '23503';
  end if;
  return new;
end
$$;

create or replace function private.foodcost_restrict_subrecipe_delete()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.recipe_ingredients i
    where i.subrecipe_id = old.id
      and i.user_id = old.user_id
  ) then
    raise exception 'SUBRECIPE_IN_USE'
      using errcode = '23503';
  end if;
  return old;
end
$$;

drop trigger if exists foodcost_00_sync_recipe_legacy_fields on public.recipes;
create trigger foodcost_00_sync_recipe_legacy_fields
  before insert or update of yield_quantity, yield_unit, output_quantity, output_unit
  on public.recipes
  for each row execute function private.foodcost_sync_recipe_legacy_fields();

drop trigger if exists foodcost_00_sync_ingredient_legacy_fields on public.recipe_ingredients;
create trigger foodcost_00_sync_ingredient_legacy_fields
  before insert or update of sub_recipe_id, subrecipe_id, kind
  on public.recipe_ingredients
  for each row execute function private.foodcost_sync_ingredient_legacy_fields();

drop trigger if exists foodcost_10_validate_subrecipe_owner on public.recipe_ingredients;
create trigger foodcost_10_validate_subrecipe_owner
  before insert or update of subrecipe_id, user_id
  on public.recipe_ingredients
  for each row execute function private.foodcost_validate_subrecipe_owner();

drop trigger if exists foodcost_10_restrict_subrecipe_delete on public.recipes;
create trigger foodcost_10_restrict_subrecipe_delete
  before delete on public.recipes
  for each row execute function private.foodcost_restrict_subrecipe_delete();

-- PostgREST cannot infer an unqualified embedded relation when two foreign
-- keys connect the same tables. Equivalent ownership/restrict checks remain
-- enforced by the two triggers above, while legacy `recipe_ingredients(*)`
-- reads become unambiguous.
alter table public.recipe_ingredients
  drop constraint if exists recipe_ingredients_subrecipe_owner_fk;

revoke all on function private.foodcost_sync_recipe_legacy_fields(),
  private.foodcost_sync_ingredient_legacy_fields(),
  private.foodcost_validate_subrecipe_owner(),
  private.foodcost_restrict_subrecipe_delete()
  from public, anon, authenticated;

notify pgrst, 'reload schema';

commit;
