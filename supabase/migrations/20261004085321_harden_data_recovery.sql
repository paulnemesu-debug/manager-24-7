-- Preserve legacy clients while detecting conflicting saves from version-aware clients.
CREATE OR REPLACE FUNCTION public.foodcost_save_recipe(p_recipe jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
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
    -- Lock the row and compare the version before changing headers or ingredients.
    perform 1 from public.recipes where id = rid and user_id = uid for update;
    if not found then raise exception 'RECIPE_NOT_FOUND'; end if;
    if nullif(p_recipe ->> 'expected_updated_at', '') is not null
       and not exists (
         select 1 from public.recipes
         where id = rid and user_id = uid
           and updated_at = (p_recipe ->> 'expected_updated_at')::timestamptz
       ) then
      raise exception 'RECIPE_CONFLICT' using errcode = 'P0001';
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
        final_weight_g = nullif(p_recipe ->> 'final_weight_g', '')::numeric,
        final_weight_measured = coalesce((p_recipe ->> 'final_weight_measured')::boolean, false),
        is_defrosted = coalesce((p_recipe ->> 'is_defrosted')::boolean, false),
        nutrition_notes = nullif(btrim(p_recipe ->> 'nutrition_notes'), ''),
        template_id = nullif(btrim(p_recipe ->> 'template_id'), ''),
        template_source = nullif(btrim(p_recipe ->> 'template_source'), ''),
        updated_at = now()
    where id = rid and user_id = uid;
  else
    insert into public.recipes (
      user_id, title, category, servings, cooking_method,
      cooking_loss_percent, sale_price_gross, vat_percent, target_food_cost,
      is_sub_recipe, output_quantity, output_unit, manual_allergens,
      final_weight_g, final_weight_measured, is_defrosted, nutrition_notes,
      template_id, template_source
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
      requested_manual_allergens,
      nullif(p_recipe ->> 'final_weight_g', '')::numeric,
      coalesce((p_recipe ->> 'final_weight_measured')::boolean, false),
      coalesce((p_recipe ->> 'is_defrosted')::boolean, false),
      nullif(btrim(p_recipe ->> 'nutrition_notes'), ''),
      nullif(btrim(p_recipe ->> 'template_id'), ''),
      nullif(btrim(p_recipe ->> 'template_source'), '')
    ) returning id into rid;
  end if;

  delete from public.recipe_ingredients where recipe_id = rid and user_id = uid;

  for item, pos in
    select value, ordinality
    from jsonb_array_elements(p_recipe -> 'ingredients') with ordinality
  loop
    if length(btrim(item ->> 'name')) not between 1 and 200
      or (item ->> 'quantity')::numeric not between 0.000001 and 1000000000
      or (item ->> 'purchase_price')::numeric not between 0 and 1000000000
      or jsonb_typeof(coalesce(item -> 'nutrition', '{}'::jsonb)) <> 'object' then
      raise exception 'INVALID_INGREDIENT';
    end if;

    insert into public.recipe_ingredients (
      recipe_id, user_id, ingredient_catalog_id, subrecipe_id,
      ingredient_name, normalized_name, quantity_net, unit,
      purchase_price, price_unit, loss_percent, position,
      allergens, allergens_confirmed, additives, nutrition
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
      coalesce((item ->> 'allergens_confirmed')::boolean, false),
      array(select jsonb_array_elements_text(coalesce(item -> 'additives', '[]'::jsonb))),
      coalesce(item -> 'nutrition', '{}'::jsonb)
    );
  end loop;

  perform set_config('foodcost.defer_recalc', '', true);
  perform public.foodcost_recalculate(uid);

  select calculation_error into result_error
  from public.recipes where id = rid and user_id = uid;
  if result_error is not null then raise exception 'INVALID_RECIPE: %', result_error; end if;
  return rid;
end
$function$
;

create policy document_scan_usage_service_access on private.document_scan_usage
  for all to service_role using (true) with check (true);
