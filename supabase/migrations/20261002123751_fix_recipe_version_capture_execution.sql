-- recipe_versions is an audit table. Keep direct INSERT unavailable to clients.
-- The public RPC stays SECURITY INVOKER; the narrowly scoped private helper
-- validates ownership and builds the audit snapshot entirely from server data.
create schema if not exists private;

create or replace function private.foodcost_capture_recipe_version(p_recipe_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  version_id uuid;
begin
  if uid is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  if not exists (
    select 1
    from public.recipes r
    where r.id = p_recipe_id
      and r.user_id = uid
  ) then
    raise exception 'RECIPE_NOT_FOUND';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_recipe_id::text, 271828));

  insert into public.recipe_versions (
    user_id, recipe_id, version_number, snapshot, changed_by
  )
  select
    r.user_id,
    r.id,
    coalesce((
      select max(v.version_number)
      from public.recipe_versions v
      where v.recipe_id = r.id
    ), 0) + 1,
    to_jsonb(r) || jsonb_build_object(
      'ingredients', coalesce((
        select jsonb_agg(to_jsonb(i) order by i.position, i.created_at)
        from public.recipe_ingredients i
        where i.recipe_id = r.id
          and i.user_id = r.user_id
      ), '[]'::jsonb)
    ),
    uid
  from public.recipes r
  where r.id = p_recipe_id
    and r.user_id = uid
  returning id into version_id;

  return version_id;
end
$$;

revoke all on function private.foodcost_capture_recipe_version(uuid) from public, anon;
grant usage on schema private to authenticated, service_role;
grant execute on function private.foodcost_capture_recipe_version(uuid) to authenticated, service_role;

create or replace function public.foodcost_capture_recipe_version(p_recipe_id uuid)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.foodcost_capture_recipe_version(p_recipe_id)
$$;

revoke all on function public.foodcost_capture_recipe_version(uuid) from public, anon;
grant execute on function public.foodcost_capture_recipe_version(uuid) to authenticated, service_role;
