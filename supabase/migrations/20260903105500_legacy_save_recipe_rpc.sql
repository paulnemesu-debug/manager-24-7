begin;

-- APK 0.1.3 called save_recipe(recipe, ingredients). Keep that public API
-- temporarily and translate its legacy payload to the canonical atomic RPC.
-- Client-provided user_id and calculated totals are deliberately ignored.
create or replace function public.save_recipe(recipe jsonb, ingredients jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  canonical_ingredients jsonb;
begin
  if jsonb_typeof(ingredients) <> 'array' then
    raise exception 'INVALID_INGREDIENTS';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'catalog_id', item -> 'ingredient_catalog_id',
    'subrecipe_id', coalesce(item -> 'subrecipe_id', item -> 'sub_recipe_id'),
    'name', item -> 'ingredient_name',
    'quantity', item -> 'quantity_net',
    'unit', item -> 'unit',
    'purchase_price', item -> 'purchase_price',
    'price_unit', item -> 'price_unit',
    'loss_percent', item -> 'loss_percent',
    'allergens', coalesce(item -> 'allergens', '[]'::jsonb),
    'allergens_confirmed', coalesce(item -> 'allergens_confirmed', 'false'::jsonb)
  ) order by ordinality), '[]'::jsonb)
  into canonical_ingredients
  from jsonb_array_elements(ingredients) with ordinality as rows(item, ordinality);

  return public.foodcost_save_recipe(
    recipe || jsonb_build_object(
      'output_quantity', coalesce(
        recipe -> 'output_quantity',
        recipe -> 'yield_quantity',
        '1'::jsonb
      ),
      'output_unit', coalesce(
        recipe -> 'output_unit',
        recipe -> 'yield_unit',
        '"buc"'::jsonb
      ),
      'ingredients', canonical_ingredients
    )
  );
end
$$;

revoke all on function public.save_recipe(jsonb, jsonb) from public, anon;
grant execute on function public.save_recipe(jsonb, jsonb) to authenticated, service_role;

comment on function public.save_recipe(jsonb, jsonb) is
  'Temporary compatibility adapter for Professional FoodCost APK 0.1.3.';

notify pgrst, 'reload schema';

commit;
