begin;

alter table public.ingredient_catalog
  drop constraint if exists ingredient_catalog_id_user_key;
alter table public.ingredient_catalog
  add constraint ingredient_catalog_id_user_key unique (id, user_id);

alter table public.recipe_ingredients
  drop constraint if exists recipe_ingredients_catalog_fk;
alter table public.recipe_ingredients
  add constraint recipe_ingredients_catalog_owner_fk
  foreign key (ingredient_catalog_id, user_id)
  references public.ingredient_catalog(id, user_id)
  on delete set null (ingredient_catalog_id);

drop index if exists public.recipe_ingredients_catalog_id_idx;
create index if not exists recipe_ingredients_catalog_user_idx
  on public.recipe_ingredients (ingredient_catalog_id, user_id);

commit;
