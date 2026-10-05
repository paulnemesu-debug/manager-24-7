begin;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- Additive compatibility layer. Some early builds used yield_quantity and
-- sub_recipe_id; the production costing engine uses output_quantity and
-- subrecipe_id. Keeping the old columns avoids breaking an installed client.
alter table public.recipes
  add column if not exists is_sub_recipe boolean not null default false,
  add column if not exists manual_allergens text[] not null default '{}',
  add column if not exists output_quantity numeric,
  add column if not exists output_unit text not null default 'buc',
  add column if not exists allergens text[] not null default '{}',
  add column if not exists allergens_confirmed boolean not null default false,
  add column if not exists calculation_error text;

alter table public.recipe_ingredients
  add column if not exists subrecipe_id uuid,
  add column if not exists position integer not null default 0,
  add column if not exists allergens text[] not null default '{}',
  add column if not exists allergens_confirmed boolean not null default false;

alter table public.ingredient_catalog
  add column if not exists default_loss_percent numeric not null default 0,
  add column if not exists allergens text[] not null default '{}',
  add column if not exists allergens_confirmed boolean not null default false;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'recipes_manual_allergens_valid'
      and conrelid = 'public.recipes'::regclass
  ) then
    alter table public.recipes
      add constraint recipes_manual_allergens_valid
      check (manual_allergens <@ array[
        'gluten','crustaceans','eggs','fish','peanuts','soy','milk','nuts',
        'celery','mustard','sesame','sulphites','lupin','molluscs'
      ]::text[]);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'ingredient_catalog_default_loss_percent_check'
      and conrelid = 'public.ingredient_catalog'::regclass
  ) then
    alter table public.ingredient_catalog
      add constraint ingredient_catalog_default_loss_percent_check
      check (default_loss_percent >= 0 and default_loss_percent <= 99);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'recipes_output_quantity_compat_check'
      and conrelid = 'public.recipes'::regclass
  ) then
    alter table public.recipes
      add constraint recipes_output_quantity_compat_check
      check (output_quantity is null or (output_quantity > 0 and output_quantity < 1000000000));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'recipes_output_unit_compat_check'
      and conrelid = 'public.recipes'::regclass
  ) then
    alter table public.recipes
      add constraint recipes_output_unit_compat_check
      check (output_unit in ('kg', 'l', 'buc'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'recipes_allergens_valid'
      and conrelid = 'public.recipes'::regclass
  ) then
    alter table public.recipes
      add constraint recipes_allergens_valid
      check (allergens <@ array[
        'gluten','crustaceans','eggs','fish','peanuts','soy','milk','nuts',
        'celery','mustard','sesame','sulphites','lupin','molluscs'
      ]::text[]);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'recipe_ingredients_subrecipe_owner_fk'
      and conrelid = 'public.recipe_ingredients'::regclass
  ) then
    alter table public.recipe_ingredients
      add constraint recipe_ingredients_subrecipe_owner_fk
      foreign key (subrecipe_id, user_id)
      references public.recipes(id, user_id)
      on delete restrict;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'recipe_ingredients_not_self'
      and conrelid = 'public.recipe_ingredients'::regclass
  ) then
    alter table public.recipe_ingredients
      add constraint recipe_ingredients_not_self
      check (subrecipe_id is distinct from recipe_id);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'recipe_ingredients_single_source'
      and conrelid = 'public.recipe_ingredients'::regclass
  ) then
    alter table public.recipe_ingredients
      add constraint recipe_ingredients_single_source
      check (subrecipe_id is null or ingredient_catalog_id is null);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'recipe_ingredients_allergens_valid'
      and conrelid = 'public.recipe_ingredients'::regclass
  ) then
    alter table public.recipe_ingredients
      add constraint recipe_ingredients_allergens_valid
      check (allergens <@ array[
        'gluten','crustaceans','eggs','fish','peanuts','soy','milk','nuts',
        'celery','mustard','sesame','sulphites','lupin','molluscs'
      ]::text[]);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'ingredient_catalog_allergens_valid'
      and conrelid = 'public.ingredient_catalog'::regclass
  ) then
    alter table public.ingredient_catalog
      add constraint ingredient_catalog_allergens_valid
      check (allergens <@ array[
        'gluten','crustaceans','eggs','fish','peanuts','soy','milk','nuts',
        'celery','mustard','sesame','sulphites','lupin','molluscs'
      ]::text[]);
  end if;
end
$$;

create index if not exists recipe_ingredients_subrecipe_owner_idx
  on public.recipe_ingredients (subrecipe_id, user_id)
  where subrecipe_id is not null;

create or replace function public.foodcost_normalize_name(p_name text)
returns text
language sql
immutable
strict
security invoker
set search_path = ''
as $$
  select lower(regexp_replace(
    translate(btrim(p_name), 'ăâîșşțţĂÂÎȘŞȚŢ', 'aaissttAAISSTT'),
    '\s+', ' ', 'g'
  ));
$$;

create or replace function private.foodcost_check_cycle()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.subrecipe_id is not null and exists (
    with recursive descendants(id) as (
      select new.subrecipe_id
      union
      select i.subrecipe_id
      from public.recipe_ingredients i
      join descendants d on i.recipe_id = d.id
      where i.user_id = new.user_id
        and i.subrecipe_id is not null
        and i.id <> new.id
    )
    select 1 from descendants where id = new.recipe_id
  ) then
    raise exception 'SUBRECIPE_CYCLE';
  end if;
  return new;
end
$$;

drop trigger if exists foodcost_no_cycles on public.recipe_ingredients;
create trigger foodcost_no_cycles
  before insert or update of subrecipe_id, recipe_id
  on public.recipe_ingredients
  for each row execute function private.foodcost_check_cycle();

create or replace function public.foodcost_recalculate(p_user_id uuid default auth.uid())
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  done uuid[] := '{}';
  r record;
  progress boolean;
  total numeric;
  portion numeric;
  net numeric;
  recnet numeric;
  effective numeric;
  invalid text;
  declared text[];
  confirmed boolean;
  previous_busy text := current_setting('foodcost.recalc_busy', true);
begin
  if p_user_id is null or (
    auth.uid() is distinct from p_user_id
    and current_user not in ('postgres', 'service_role', 'supabase_admin')
  ) then
    raise exception 'AUTH_REQUIRED';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 314159));
  perform set_config('foodcost.recalc_busy', '1', true);

  update public.recipe_ingredients i
  set ingredient_name = c.name,
      normalized_name = c.normalized_name,
      purchase_price = c.purchase_price,
      price_unit = c.price_unit,
      allergens = c.allergens,
      allergens_confirmed = c.allergens_confirmed
  from public.ingredient_catalog c
  where i.user_id = p_user_id
    and c.user_id = p_user_id
    and i.ingredient_catalog_id = c.id;

  loop
    progress := false;

    for r in
      select x.*
      from public.recipes x
      where x.user_id = p_user_id
        and not (x.id = any(done))
        and not exists (
          select 1
          from public.recipe_ingredients i
          where i.recipe_id = x.id
            and i.subrecipe_id is not null
            and not (i.subrecipe_id = any(done))
        )
    loop
      update public.recipe_ingredients i
      set ingredient_name = c.title,
          normalized_name = public.foodcost_normalize_name(c.title),
          purchase_price = c.total_cost / coalesce(
            c.output_quantity,
            greatest(0.01, round(greatest(1, c.servings) * (1 - c.cooking_loss_percent / 100), 2))
          ),
          price_unit = case when c.output_quantity is null then 'buc' else c.output_unit end,
          allergens = c.allergens,
          allergens_confirmed = c.allergens_confirmed
      from public.recipes c
      where i.recipe_id = r.id
        and i.user_id = p_user_id
        and i.subrecipe_id = c.id
        and c.user_id = p_user_id;

      invalid := null;
      if not exists (
        select 1 from public.recipe_ingredients where recipe_id = r.id
      ) then
        invalid := 'ingredients';
      end if;

      if exists (
        select 1
        from public.recipe_ingredients i
        where i.recipe_id = r.id
          and not (
            (i.unit in ('g', 'kg') and i.price_unit = 'kg')
            or (i.unit in ('ml', 'l') and i.price_unit = 'l')
            or (i.unit = 'buc' and i.price_unit = 'buc')
          )
      ) then
        invalid := 'unit';
      end if;

      if exists (
        select 1
        from public.recipe_ingredients i
        join public.recipes c on i.subrecipe_id = c.id
        where i.recipe_id = r.id
          and c.calculation_error is not null
      ) then
        invalid := 'invalidRecipe';
      end if;

      update public.recipe_ingredients i
      set purchase_quantity = (
            case
              when (unit = 'g' and price_unit = 'kg')
                or (unit = 'ml' and price_unit = 'l') then quantity_net / 1000
              when unit = price_unit then quantity_net
              else 0
            end
          ) / greatest(0.01, 1 - loss_percent / 100),
          line_cost = round((
            case
              when (unit = 'g' and price_unit = 'kg')
                or (unit = 'ml' and price_unit = 'l') then quantity_net / 1000
              when unit = price_unit then quantity_net
              else 0
            end
          ) / greatest(0.01, 1 - loss_percent / 100) * purchase_price, 2)
      where i.recipe_id = r.id
        and i.user_id = p_user_id;

      select coalesce(sum(line_cost), 0),
             coalesce(bool_and(allergens_confirmed), false)
      into total, confirmed
      from public.recipe_ingredients
      where recipe_id = r.id
        and user_id = p_user_id;

      select coalesce(
        array_agg(collected.allergen order by collected.allergen),
        '{}'::text[]
      )
      into declared
      from (
        select unnest(coalesce(r.manual_allergens, '{}'::text[])) as allergen
        union
        select unnest(coalesce(i.allergens, '{}'::text[])) as allergen
        from public.recipe_ingredients i
        where i.recipe_id = r.id
          and i.user_id = p_user_id
      ) collected;

      effective := greatest(
        0.01,
        round(greatest(1, r.servings) * (1 - r.cooking_loss_percent / 100), 2)
      );
      portion := round(total / effective, 2);
      net := round(coalesce(r.sale_price_gross, 0) / (1 + r.vat_percent / 100), 2);
      recnet := round(portion / (r.target_food_cost / 100), 2);

      update public.recipes
      set total_cost = total,
          portion_cost = portion,
          sale_price_net = net,
          food_cost_percent = case
            when net > 0 and invalid is null then round(portion / net * 100, 1)
            else 0
          end,
          contribution_margin = case
            when net > 0 and invalid is null then net - portion
            else 0
          end,
          contribution_margin_percent = case
            when net > 0 and invalid is null then round((net - portion) / net * 100, 1)
            else 0
          end,
          recommended_price_net = recnet,
          recommended_price_gross = round(recnet * (1 + r.vat_percent / 100), 2),
          allergens = declared,
          allergens_confirmed = confirmed,
          calculation_error = invalid
      where id = r.id
        and user_id = p_user_id;

      done := array_append(done, r.id);
      progress := true;
    end loop;

    exit when not exists (
      select 1
      from public.recipes
      where user_id = p_user_id
        and not (id = any(done))
    );

    if not progress then
      raise exception 'SUBRECIPE_CYCLE_OR_MISSING_REFERENCE';
    end if;
  end loop;

  perform set_config('foodcost.recalc_busy', coalesce(previous_busy, ''), true);
end
$$;

create or replace function private.foodcost_refresh_totals()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if auth.uid() is not null
    and coalesce(current_setting('foodcost.recalc_busy', true), '') <> '1'
    and coalesce(current_setting('foodcost.defer_recalc', true), '') <> '1' then
    perform public.foodcost_recalculate(auth.uid());
  end if;
  return null;
end
$$;

create or replace function public.foodcost_save_recipe(p_recipe jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  rid uuid;
  item jsonb;
  pos bigint;
  result_error text;
  requested_manual_allergens text[];
begin
  if uid is null then
    raise exception 'AUTH_REQUIRED';
  end if;
  if jsonb_typeof(p_recipe -> 'ingredients') <> 'array'
    or jsonb_array_length(p_recipe -> 'ingredients') not between 1 and 500 then
    raise exception 'INVALID_INGREDIENTS';
  end if;
  if length(btrim(p_recipe ->> 'title')) not between 1 and 200 then
    raise exception 'INVALID_TITLE';
  end if;

  requested_manual_allergens := array(
    select jsonb_array_elements_text(coalesce(p_recipe -> 'manual_allergens', '[]'::jsonb))
  );

  perform pg_advisory_xact_lock(hashtextextended(uid::text, 314159));
  perform set_config('foodcost.defer_recalc', '1', true);
  rid := nullif(p_recipe ->> 'id', '')::uuid;

  if rid is not null then
    perform 1 from public.recipes where id = rid and user_id = uid;
    if not found then
      raise exception 'RECIPE_NOT_FOUND';
    end if;

    update public.recipes
    set title = btrim(p_recipe ->> 'title'),
        category = nullif(p_recipe ->> 'category', ''),
        servings = (p_recipe ->> 'servings')::numeric,
        cooking_method = p_recipe ->> 'cooking_method',
        cooking_loss_percent = (p_recipe ->> 'cooking_loss_percent')::numeric,
        sale_price_gross = (p_recipe ->> 'sale_price_gross')::numeric,
        vat_percent = (p_recipe ->> 'vat_percent')::numeric,
        target_food_cost = (p_recipe ->> 'target_food_cost')::numeric,
        is_sub_recipe = coalesce((p_recipe ->> 'is_sub_recipe')::boolean, false),
        output_quantity = (p_recipe ->> 'output_quantity')::numeric,
        output_unit = coalesce(p_recipe ->> 'output_unit', 'buc'),
        manual_allergens = requested_manual_allergens,
        updated_at = now()
    where id = rid and user_id = uid;
  else
    insert into public.recipes (
      user_id, title, category, servings, cooking_method,
      cooking_loss_percent, sale_price_gross, vat_percent, target_food_cost,
      is_sub_recipe, output_quantity, output_unit, manual_allergens
    ) values (
      uid,
      btrim(p_recipe ->> 'title'),
      nullif(p_recipe ->> 'category', ''),
      (p_recipe ->> 'servings')::numeric,
      p_recipe ->> 'cooking_method',
      (p_recipe ->> 'cooking_loss_percent')::numeric,
      (p_recipe ->> 'sale_price_gross')::numeric,
      (p_recipe ->> 'vat_percent')::numeric,
      (p_recipe ->> 'target_food_cost')::numeric,
      coalesce((p_recipe ->> 'is_sub_recipe')::boolean, false),
      (p_recipe ->> 'output_quantity')::numeric,
      coalesce(p_recipe ->> 'output_unit', 'buc'),
      requested_manual_allergens
    ) returning id into rid;
  end if;

  delete from public.recipe_ingredients
  where recipe_id = rid and user_id = uid;

  for item, pos in
    select value, ordinality
    from jsonb_array_elements(p_recipe -> 'ingredients') with ordinality
  loop
    if length(btrim(item ->> 'name')) not between 1 and 200
      or (item ->> 'quantity')::numeric not between 0.000001 and 1000000000
      or (item ->> 'purchase_price')::numeric not between 0 and 1000000000 then
      raise exception 'INVALID_INGREDIENT';
    end if;

    insert into public.recipe_ingredients (
      recipe_id, user_id, ingredient_catalog_id, subrecipe_id,
      ingredient_name, normalized_name, quantity_net, unit,
      purchase_price, price_unit, loss_percent, position,
      allergens, allergens_confirmed
    ) values (
      rid,
      uid,
      (item ->> 'catalog_id')::uuid,
      (item ->> 'subrecipe_id')::uuid,
      btrim(item ->> 'name'),
      public.foodcost_normalize_name(item ->> 'name'),
      (item ->> 'quantity')::numeric,
      item ->> 'unit',
      (item ->> 'purchase_price')::numeric,
      item ->> 'price_unit',
      (item ->> 'loss_percent')::numeric,
      pos,
      array(select jsonb_array_elements_text(coalesce(item -> 'allergens', '[]'::jsonb))),
      coalesce((item ->> 'allergens_confirmed')::boolean, false)
    );
  end loop;

  perform set_config('foodcost.defer_recalc', '', true);
  perform public.foodcost_recalculate(uid);

  select calculation_error into result_error
  from public.recipes
  where id = rid and user_id = uid;

  if result_error is not null then
    raise exception 'INVALID_RECIPE: %', result_error;
  end if;

  return rid;
end
$$;

drop trigger if exists foodcost_refresh_lines on public.recipe_ingredients;
create trigger foodcost_refresh_lines
  after insert or update or delete on public.recipe_ingredients
  for each statement execute function private.foodcost_refresh_totals();

drop trigger if exists foodcost_refresh_catalog on public.ingredient_catalog;
create trigger foodcost_refresh_catalog
  after insert or update or delete on public.ingredient_catalog
  for each statement execute function private.foodcost_refresh_totals();

drop trigger if exists foodcost_refresh_recipe_fields on public.recipes;
create trigger foodcost_refresh_recipe_fields
  after insert or delete or update of
    title, servings, cooking_loss_percent, sale_price_gross,
    vat_percent, target_food_cost, output_quantity, output_unit, manual_allergens
  on public.recipes
  for each statement execute function private.foodcost_refresh_totals();

revoke all on function private.foodcost_check_cycle(),
  private.foodcost_refresh_totals() from public, anon, authenticated;
revoke all on function public.foodcost_normalize_name(text) from public, anon;
revoke all on function public.foodcost_recalculate(uuid),
  public.foodcost_save_recipe(jsonb) from public, anon;
grant execute on function public.foodcost_normalize_name(text) to authenticated, service_role;
grant execute on function public.foodcost_recalculate(uuid),
  public.foodcost_save_recipe(jsonb) to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
