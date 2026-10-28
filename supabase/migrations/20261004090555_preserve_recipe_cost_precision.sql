-- Sum exact line values and round only the final monetary total and portion.
CREATE OR REPLACE FUNCTION public.foodcost_recalculate(p_user_id uuid DEFAULT auth.uid())
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
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
          line_cost = ((
            case
              when (unit = 'g' and price_unit = 'kg')
                or (unit = 'ml' and price_unit = 'l') then quantity_net / 1000
              when unit = price_unit then quantity_net
              else 0
            end
          ) / greatest(0.01, 1 - loss_percent / 100) * purchase_price)
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
      set total_cost = round(total, 2),
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
$function$
;
