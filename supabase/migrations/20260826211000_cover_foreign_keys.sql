begin;

drop index if exists public.recipe_ingredients_recipe_idx;

create index if not exists recipe_ingredients_catalog_id_idx
  on public.recipe_ingredients (ingredient_catalog_id);

create index if not exists recipe_ingredients_recipe_user_idx
  on public.recipe_ingredients (recipe_id, user_id);

commit;
