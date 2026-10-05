begin;

-- Indexăm partea care referă cheia străină. Aceste indexuri susțin atât
-- cascadele la ștergere, cât și filtrele RLS / rapoartele pe proprietar.
create index if not exists ingredient_price_history_user_idx
  on public.ingredient_price_history (user_id);
create index if not exists supplier_offers_user_idx
  on public.ingredient_supplier_offers (user_id);
create index if not exists menu_sales_recipe_idx
  on public.menu_sales (recipe_id);
create index if not exists recipe_versions_user_idx
  on public.recipe_versions (user_id);
create index if not exists recipe_versions_changed_by_idx
  on public.recipe_versions (changed_by)
  where changed_by is not null;

-- auth.uid() este evaluat o singură dată per interogare, nu pentru fiecare
-- rând. Accesul rămâne identic: proprietar cu drept Pro sau viewer activ.
drop policy if exists recipes_select_entitled on public.recipes;
create policy recipes_select_entitled on public.recipes
  for select to authenticated
  using (
    ((select auth.uid()) = user_id and (select public.has_professional_access()))
    or (select public.is_active_viewer_of(user_id))
  );

drop policy if exists recipe_ingredients_select_entitled on public.recipe_ingredients;
create policy recipe_ingredients_select_entitled on public.recipe_ingredients
  for select to authenticated
  using (
    ((select auth.uid()) = user_id and (select public.has_professional_access()))
    or (select public.is_active_viewer_of(user_id))
  );

drop policy if exists ingredient_catalog_select_entitled on public.ingredient_catalog;
create policy ingredient_catalog_select_entitled on public.ingredient_catalog
  for select to authenticated
  using (
    ((select auth.uid()) = user_id and (select public.has_professional_access()))
    or (select public.is_active_viewer_of(user_id))
  );

-- O singură politică SELECT evită evaluarea a două politici permisive.
-- Scrierea rămâne disponibilă exclusiv proprietarului listei.
drop policy if exists workspace_members_owner_all on public.workspace_members;
drop policy if exists workspace_members_self_select on public.workspace_members;

create policy workspace_members_select_related on public.workspace_members
  for select to authenticated
  using (
    (select auth.uid()) = owner_user_id
    or (select auth.uid()) = member_user_id
  );

create policy workspace_members_insert_owner on public.workspace_members
  for insert to authenticated
  with check ((select auth.uid()) = owner_user_id);

create policy workspace_members_update_owner on public.workspace_members
  for update to authenticated
  using ((select auth.uid()) = owner_user_id)
  with check ((select auth.uid()) = owner_user_id);

create policy workspace_members_delete_owner on public.workspace_members
  for delete to authenticated
  using ((select auth.uid()) = owner_user_id);

commit;
