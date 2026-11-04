create function public.foodcost_apply_catalog_price_updates(p_owner_id uuid, p_updates jsonb)
returns jsonb
language plpgsql security invoker set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  change jsonb;
  item public.ingredient_catalog;
  next_supplier text;
  next_price numeric;
  next_source text;
  next_source_date date;
  offer_id uuid;
  changed_ids uuid[] := '{}';
  saved jsonb;
begin
  if caller is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_owner_id is distinct from caller then raise exception 'CATALOG_OWNER_MISMATCH'; end if;
  if public.has_professional_access() is not true then raise exception 'PROFESSIONAL_ACCESS_REQUIRED'; end if;
  if jsonb_typeof(p_updates) is distinct from 'array' then raise exception 'INVALID_CATALOG_PRICE_UPDATE'; end if;

  perform pg_advisory_xact_lock(hashtextextended(caller::text, 314159));
  for change in select value from jsonb_array_elements(p_updates)
  loop
    if jsonb_typeof(change->'purchase_price') is distinct from 'number' then
      raise exception 'INVALID_CATALOG_PRICE_UPDATE';
    end if;
    next_price := (change->>'purchase_price')::numeric;
    if next_price < 0 then raise exception 'INVALID_CATALOG_PRICE_UPDATE'; end if;
    next_source := change->>'source';
    next_source_date := (change->>'source_date')::date;

    select * into item from public.ingredient_catalog
      where id = (change->>'id')::uuid and user_id = caller for update;
    if not found then raise exception 'CATALOG_NOT_FOUND'; end if;
    next_supplier := coalesce(nullif(btrim(change->>'supplier'), ''), nullif(btrim(item.supplier), ''));

    select o.id into offer_id from public.ingredient_supplier_offers o
      where o.catalog_id = item.id and o.user_id = caller and o.price_unit = item.price_unit
        and lower(btrim(o.supplier_name)) = lower(btrim(next_supplier))
      order by o.is_active desc, o.updated_at desc, o.id limit 1;

    update public.ingredient_catalog
      set purchase_price = next_price, supplier = next_supplier, price_source = next_source,
          price_source_date = next_source_date, package_quantity = null, package_price = null
      where id = item.id and user_id = caller;

    -- A unit-price list supplies no packaging. Keep prior suppliers as inactive offers.
    update public.ingredient_supplier_offers
      set is_active = false
      where catalog_id = item.id and user_id = caller and is_active and id is distinct from offer_id;
    if offer_id is not null then
      update public.ingredient_supplier_offers
        set supplier_name = next_supplier, unit_price = next_price, package_quantity = null, package_price = null,
            source = next_source, source_date = next_source_date, is_active = true
        where id = offer_id and user_id = caller;
    elsif next_supplier is not null then
      insert into public.ingredient_supplier_offers (
        user_id, catalog_id, supplier_name, unit_price, price_unit, source, source_date, is_active
      ) values (caller, item.id, next_supplier, next_price, item.price_unit, next_source, next_source_date, true);
    end if;
    changed_ids := array_append(changed_ids, item.id);
  end loop;

  select coalesce(jsonb_agg(to_jsonb(c) || jsonb_build_object('ingredient_supplier_offers', offers.rows)), '[]'::jsonb)
    into saved
    from public.ingredient_catalog c
    cross join lateral (
      select coalesce(jsonb_agg(to_jsonb(o) order by o.unit_price, o.id), '[]'::jsonb) as rows
      from public.ingredient_supplier_offers o where o.catalog_id = c.id and o.user_id = caller
    ) offers
    where c.id = any(changed_ids) and c.user_id = caller;
  return saved;
end;
$$;

revoke all on function public.foodcost_apply_catalog_price_updates(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.foodcost_apply_catalog_price_updates(uuid, jsonb) to authenticated;
