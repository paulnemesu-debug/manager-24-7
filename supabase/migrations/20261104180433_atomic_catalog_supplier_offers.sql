create function public.foodcost_save_catalog_ingredient(p_ingredient jsonb, p_offers jsonb default null)
returns jsonb
language plpgsql security invoker set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  draft public.ingredient_catalog;
  saved public.ingredient_catalog;
  target_id uuid;
  saved_offers jsonb;
begin
  if caller is null then raise exception 'AUTH_REQUIRED'; end if;
  if public.has_professional_access() is not true then raise exception 'PROFESSIONAL_ACCESS_REQUIRED'; end if;
  if jsonb_typeof(p_ingredient) is distinct from 'object'
     or (p_offers is not null and jsonb_typeof(p_offers) not in ('array', 'null')) then
    raise exception 'INVALID_CATALOG_PAYLOAD';
  end if;

  draft := jsonb_populate_record(null::public.ingredient_catalog, p_ingredient);
  if draft.user_id is not null and draft.user_id <> caller then
    raise exception 'CATALOG_OWNER_MISMATCH';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(caller::text, 314159));
  if draft.id is not null then
    select id into target_id from public.ingredient_catalog where id = draft.id and user_id = caller for update;
    if not found then raise exception 'CATALOG_NOT_FOUND'; end if;
  else
    select id into target_id from public.ingredient_catalog
      where user_id = caller and normalized_name = draft.normalized_name for update;
  end if;

  insert into public.ingredient_catalog (
    id, user_id, name, normalized_name, purchase_price, price_unit, package_quantity, package_price,
    default_loss_percent, supplier, price_source, price_source_date, notes, allergens,
    allergens_confirmed, additives, nutrition, active
  ) values (
    coalesce(target_id, gen_random_uuid()), caller, draft.name, draft.normalized_name, draft.purchase_price,
    draft.price_unit, draft.package_quantity, draft.package_price, draft.default_loss_percent,
    draft.supplier, draft.price_source, draft.price_source_date, draft.notes, draft.allergens,
    draft.allergens_confirmed, draft.additives, draft.nutrition, draft.active
  )
  on conflict (id) do update set (
    name, normalized_name, purchase_price, price_unit, package_quantity, package_price,
    default_loss_percent, supplier, price_source, price_source_date, notes, allergens,
    allergens_confirmed, additives, nutrition, active
  ) = (
    excluded.name, excluded.normalized_name, excluded.purchase_price, excluded.price_unit,
    excluded.package_quantity, excluded.package_price, excluded.default_loss_percent,
    excluded.supplier, excluded.price_source, excluded.price_source_date, excluded.notes,
    excluded.allergens, excluded.allergens_confirmed, excluded.additives, excluded.nutrition, excluded.active
  ) where ingredient_catalog.user_id = caller
  returning * into saved;
  if not found then raise exception 'CATALOG_NOT_FOUND'; end if;

  -- NULL leaves offers intact. An empty array explicitly clears them.
  if jsonb_typeof(p_offers) = 'array' then
    delete from public.ingredient_supplier_offers where catalog_id = saved.id and user_id = caller;
    insert into public.ingredient_supplier_offers (
      id, user_id, catalog_id, supplier_name, unit_price, price_unit,
      package_quantity, package_price, source, source_date, is_active
    )
    select
      case
        -- Keep temporary offer identities stable when the same save is retried.
        when item->>'id' like 'offer-%' then md5(saved.id::text || ':' || (item->>'id'))::uuid
        else coalesce(nullif(item->>'id', '')::uuid, gen_random_uuid())
      end,
      caller, saved.id, item->>'supplier_name', (item->>'unit_price')::numeric, item->>'price_unit',
      (item->>'package_quantity')::numeric, (item->>'package_price')::numeric, item->>'source',
      (item->>'source_date')::date, coalesce((item->>'is_active')::boolean, false)
    from jsonb_array_elements(p_offers) as entries(item);
  end if;

  select coalesce(jsonb_agg(to_jsonb(o) order by o.unit_price, o.id), '[]'::jsonb) into saved_offers
    from public.ingredient_supplier_offers o where o.catalog_id = saved.id and o.user_id = caller;
  return to_jsonb(saved) || jsonb_build_object('ingredient_supplier_offers', saved_offers);
end;
$$;

revoke all on function public.foodcost_save_catalog_ingredient(jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.foodcost_save_catalog_ingredient(jsonb, jsonb) to authenticated;
