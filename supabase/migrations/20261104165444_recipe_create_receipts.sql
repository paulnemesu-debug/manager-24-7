create table private.recipe_create_receipts (
  user_id uuid not null references auth.users(id) on delete cascade,
  request_id text not null check (request_id ~ '^[A-Za-z0-9-]{8,80}$'),
  recipe_id uuid,
  created_version timestamptz,
  check ((recipe_id is null) = (created_version is null)),
  primary key (user_id, request_id)
);

alter table private.recipe_create_receipts enable row level security;
revoke all on private.recipe_create_receipts from public, anon, authenticated;

-- Only the receipt access is privileged. The save and visibility checks below
-- still use the calling user's recipe policies.
create function private.recipe_create_receipt(p_request_id text, p_recipe_id uuid default null, p_cancel boolean default false)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  recipe_version timestamptz;
  receipt jsonb;
begin
  if caller is null then raise exception 'AUTH_REQUIRED'; end if;
  if public.has_professional_access() is not true then raise exception 'PROFESSIONAL_ACCESS_REQUIRED'; end if;
  if p_request_id is null or p_request_id !~ '^[A-Za-z0-9-]{8,80}$' then
    raise exception 'INVALID_RECIPE_CREATE';
  end if;

  if p_cancel then
    perform pg_advisory_xact_lock(hashtextextended(caller::text, 314159));
    -- Block the same create if a delayed request has yet to reach this lock.
    insert into private.recipe_create_receipts(user_id, request_id)
    values (caller, p_request_id)
    on conflict (user_id, request_id) do nothing;
  elsif p_recipe_id is not null then
    perform pg_advisory_xact_lock(hashtextextended(caller::text, 314159));
    select updated_at into recipe_version
    from public.recipes where id = p_recipe_id and user_id = caller;
    if not found then raise exception 'RECIPE_NOT_FOUND'; end if;

    insert into private.recipe_create_receipts(user_id, request_id, recipe_id, created_version)
    values (caller, p_request_id, p_recipe_id, recipe_version)
    on conflict (user_id, request_id) do nothing;
  end if;

  select jsonb_build_object('recipe_id', recipe_id, 'created_version', created_version) into receipt
  from private.recipe_create_receipts where user_id = caller and request_id = p_request_id;
  return receipt;
end;
$$;

create function public.foodcost_create_recipe_once(p_recipe jsonb, p_request_id text)
returns jsonb
language plpgsql security invoker set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  receipt jsonb;
  saved_id uuid;
begin
  if caller is null then raise exception 'AUTH_REQUIRED'; end if;
  if nullif(p_recipe ->> 'id', '') is not null then raise exception 'INVALID_RECIPE_CREATE'; end if;

  perform pg_advisory_xact_lock(hashtextextended(caller::text, 314159));
  receipt := private.recipe_create_receipt(p_request_id);
  if receipt is not null then
    -- A receipt remains after deletion so an old queued request cannot reinsert.
    if not exists (
      select 1 from public.recipes
      where id = (receipt ->> 'recipe_id')::uuid and user_id = caller
    ) then raise exception 'RECIPE_NOT_FOUND'; end if;
    return receipt || jsonb_build_object('replayed', true);
  end if;
  -- A retry can recover a receipt before attempting to read or upload its photo again.
  if p_recipe is null then return null; end if;

  saved_id := public.foodcost_save_recipe(p_recipe);
  return private.recipe_create_receipt(p_request_id, saved_id) || jsonb_build_object('replayed', false);
end;
$$;

create function public.foodcost_cancel_recipe_create(p_request_id text)
returns void
language plpgsql security invoker set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  receipt jsonb;
  saved_id uuid;
begin
  if caller is null then raise exception 'AUTH_REQUIRED'; end if;
  perform pg_advisory_xact_lock(hashtextextended(caller::text, 314159));
  receipt := private.recipe_create_receipt(p_request_id, null, true);
  saved_id := (receipt ->> 'recipe_id')::uuid;
  if saved_id is null then return; end if;
  delete from public.recipes
  where id = saved_id and user_id = caller
    and updated_at = (receipt ->> 'created_version')::timestamptz;
  if not found and exists (select 1 from public.recipes where id = saved_id and user_id = caller) then
    raise exception 'RECIPE_CONFLICT';
  end if;
end;
$$;

revoke all on function private.recipe_create_receipt(text, uuid, boolean) from public, anon, authenticated;
revoke all on function public.foodcost_create_recipe_once(jsonb, text) from public, anon, authenticated;
revoke all on function public.foodcost_cancel_recipe_create(text) from public, anon, authenticated;
grant execute on function private.recipe_create_receipt(text, uuid, boolean) to authenticated;
grant execute on function public.foodcost_create_recipe_once(jsonb, text) to authenticated;
grant execute on function public.foodcost_cancel_recipe_create(text) to authenticated;
