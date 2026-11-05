begin;

alter table public.inventory_counts add column daily_report jsonb;

-- Physical counts and old daily rows remain unmarked and keep their existing IDs.
create unique index inventory_counts_one_management_day
  on public.inventory_counts (user_id, counted_at, (daily_report->>'scope'))
  where daily_report is not null;

create view public.management_physical_inventory
with (security_invoker = true)
as
  select count_row.* from public.inventory_counts count_row
  where count_row.daily_report is null and not exists (
    select 1 from public.sales_imports sales_row
    where sales_row.id = count_row.id and sales_row.user_id = count_row.user_id
      and sales_row.source_name = 'Manager 24/7'
      and sales_row.period_start = count_row.counted_at and sales_row.period_end = count_row.counted_at
      and sales_row.location_id is not distinct from count_row.location_id
  );

revoke all on public.management_physical_inventory from public, anon;
grant select on public.management_physical_inventory to authenticated;

create function private.guard_management_day()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    -- Account teardown retains its existing foreign-key cascade.
    if old.daily_report is not null and pg_trigger_depth() = 1 and auth.uid() is not null then
      raise exception using errcode = '42501', message = 'A management day cannot be deleted as an inventory count.';
    end if;
    return old;
  end if;
  if tg_op = 'UPDATE' and old.daily_report is not null then
    -- The canonical report keeps its original scope when the location is deleted.
    if pg_trigger_depth() > 1 and old.location_id is not null and new.location_id is null
      and (to_jsonb(old) - 'location_id' - 'updated_at') = (to_jsonb(new) - 'location_id' - 'updated_at')
    then return new; end if;
    if new.daily_report is null or new.id <> old.id or new.user_id <> old.user_id
      or new.counted_at <> old.counted_at or new.location_id is distinct from old.location_id
      or new.daily_report->>'scope' is distinct from old.daily_report->>'scope'
      or (new.daily_report->>'version')::integer is distinct from (old.daily_report->>'version')::integer + 1
    then raise exception using errcode = '42501', message = 'Use the management day save for this inventory row.'; end if;
  end if;
  if new.daily_report is not null and current_setting('manager247.management_day_write', true)
    is distinct from new.user_id::text || '/' || new.id::text
  then raise exception using errcode = '42501', message = 'Use the management day save for this inventory row.'; end if;
  return new;
end;
$$;

revoke all on function private.guard_management_day() from public, anon, authenticated;
create trigger guard_management_day
  before insert or update or delete on public.inventory_counts
  for each row execute function private.guard_management_day();

create function public.foodcost_save_management_day(
  p_owner uuid, p_id uuid, p_location uuid, p_date date, p_expected_version integer,
  p_request_id uuid, p_inventory jsonb, p_sales jsonb, p_labor jsonb, p_promote boolean
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_existing public.inventory_counts%rowtype;
  v_saved public.inventory_counts%rowtype;
  v_old_labor jsonb := '[]'::jsonb;
  v_labor jsonb := '[]'::jsonb;
  v_line jsonb;
  v_id uuid;
  v_kept_ids uuid[] := '{}';
  v_version integer := 0;
  v_inventory_value numeric := 0;
  v_revenue numeric := 0;
  v_scope text := coalesce(p_location::text, 'general');
begin
  if p_owner is null or p_owner is distinct from auth.uid() then
    raise exception using errcode = '42501', message = 'Management day owner does not match the session.';
  end if;
  if p_location is not null and not exists (
    select 1 from public.business_locations where id = p_location and owner_user_id = p_owner
  ) then
    raise exception using errcode = '42501', message = 'Management day location is not owned by the session.';
  end if;
  if p_id is null or p_request_id is null or p_date is null or not isfinite(p_date)
    or extract(year from p_date) not between 1 and 9999
    or p_expected_version is null or p_expected_version < 0 or p_promote is null
    or jsonb_typeof(p_inventory) is distinct from 'array'
    or jsonb_typeof(p_sales) is distinct from 'array'
    or jsonb_typeof(p_labor) is distinct from 'array'
  then
    raise exception using errcode = '22023', message = 'Invalid management day payload.';
  end if;
  if jsonb_array_length(p_inventory) > 2000 or jsonb_array_length(p_sales) > 10000
    or jsonb_array_length(p_labor) > 2000
  then
    raise exception using errcode = '22023', message = 'Management day exceeds the maximum number of lines.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    p_owner::text || '/' || p_date::text || '/' || v_scope, 0
  ));
  select * into v_existing from public.inventory_counts where id = p_id and user_id = p_owner for update;
  if found and (v_existing.counted_at <> p_date or v_existing.location_id is distinct from p_location) then
    raise exception using errcode = '22023', message = 'An existing management day cannot change date or location scope.';
  end if;
  if v_existing.daily_report is not null then
    if v_existing.daily_report->>'requestId' = p_request_id::text then
      return jsonb_build_object('applied', true, 'record', to_jsonb(v_existing));
    end if;
    v_version := (v_existing.daily_report->>'version')::integer;
    v_old_labor := v_existing.daily_report->'labor';
    if v_version <> p_expected_version or p_promote then
      return jsonb_build_object('applied', false, 'record', to_jsonb(v_existing));
    end if;
  else
    select * into v_saved from public.inventory_counts
      where user_id = p_owner and counted_at = p_date and daily_report->>'scope' = v_scope and daily_report is not null;
    if found then
      return jsonb_build_object('applied', false, 'record', to_jsonb(v_saved));
    end if;
    if p_expected_version <> 0 then
      return jsonb_build_object('applied', false, 'record', null);
    end if;
    if v_existing.id is not null or p_promote then
      if not p_promote or v_existing.id is null or v_existing.status <> 'confirmed'
        or v_existing.lines is distinct from p_inventory or not exists (
          select 1 from public.sales_imports where id = p_id and user_id = p_owner
            and location_id is not distinct from p_location and period_start = p_date and period_end = p_date
            and source_name = 'Manager 24/7' and rows = p_sales
        )
      then
        raise exception using errcode = '22023', message = 'Previous management records do not match the retained report.';
      end if;
    end if;
  end if;

  for v_line in select value from jsonb_array_elements(p_inventory) loop
    if jsonb_typeof(v_line->'name') is distinct from 'string'
      or coalesce(jsonb_typeof(v_line->'catalogId'), '') not in ('null', 'string')
      or jsonb_typeof(v_line->'openingQuantity') is distinct from 'number'
      or jsonb_typeof(v_line->'purchasesQuantity') is distinct from 'number'
      or jsonb_typeof(v_line->'closingQuantity') is distinct from 'number'
      or jsonb_typeof(v_line->'unitCost') is distinct from 'number'
    then raise exception using errcode = '22023', message = 'Invalid management inventory line.'; end if;
    if least((v_line->>'openingQuantity')::numeric, (v_line->>'purchasesQuantity')::numeric,
      (v_line->>'closingQuantity')::numeric, (v_line->>'unitCost')::numeric) < 0
    then raise exception using errcode = '22023', message = 'Management inventory values must be nonnegative.'; end if;
    v_inventory_value := v_inventory_value + (v_line->>'closingQuantity')::numeric * (v_line->>'unitCost')::numeric;
  end loop;
  for v_line in select value from jsonb_array_elements(p_sales) loop
    if jsonb_typeof(v_line->'name') is distinct from 'string'
      or coalesce(jsonb_typeof(v_line->'recipeId'), '') not in ('null', 'string')
      or jsonb_typeof(v_line->'quantity') is distinct from 'number'
      or jsonb_typeof(v_line->'revenue') is distinct from 'number'
      or jsonb_typeof(v_line->'theoreticalUnitCost') is distinct from 'number'
    then raise exception using errcode = '22023', message = 'Invalid management sales line.'; end if;
    if least((v_line->>'quantity')::numeric, (v_line->>'revenue')::numeric, (v_line->>'theoreticalUnitCost')::numeric) < 0
    then raise exception using errcode = '22023', message = 'Management sales values must be nonnegative.'; end if;
    v_revenue := v_revenue + (v_line->>'revenue')::numeric;
  end loop;

  for v_line in select value from jsonb_array_elements(p_labor) loop
    if jsonb_typeof(v_line->'employeeName') is distinct from 'string'
      or jsonb_typeof(v_line->'role') is distinct from 'string'
      or jsonb_typeof(v_line->'hours') is distinct from 'number'
      or jsonb_typeof(v_line->'hourlyCost') is distinct from 'number'
    then raise exception using errcode = '22023', message = 'Invalid management labor line.'; end if;
    if length(btrim(v_line->>'employeeName')) not between 1 and 160 or length(btrim(v_line->>'role')) > 100
      or (v_line->>'hours')::numeric not between 0 and 24
      or (v_line->>'hourlyCost')::numeric < 0
    then raise exception using errcode = '22023', message = 'Invalid management labor values.'; end if;

    v_id := (v_line->>'id')::uuid;
    if v_id = any(v_kept_ids) then
      raise exception using errcode = '22023', message = 'Duplicate management labor ID.';
    end if;
    if p_promote then
      -- Promotion requires exact existing IDs and values, including scope. It never edits old component rows.
      if not exists (
        select 1 from public.labor_entries where id = v_id and user_id = p_owner
          and location_id is not distinct from p_location and work_date = p_date
          and employee_name = btrim(v_line->>'employeeName') and role is not distinct from nullif(btrim(v_line->>'role'), '')
          and hours = round((v_line->>'hours')::numeric, 2) and hourly_cost = round((v_line->>'hourlyCost')::numeric, 2)
      ) then raise exception using errcode = '22023', message = 'Previous management labor ID or values do not match.'; end if;
      if exists (
        select 1 from public.inventory_counts where user_id = p_owner and daily_report is not null
          and daily_report->'labor' @> jsonb_build_array(jsonb_build_object('id', v_id))
      ) then raise exception using errcode = '22023', message = 'Previous management labor is already linked.'; end if;
    elsif v_id is null then
      v_id := gen_random_uuid();
      insert into public.labor_entries(id, user_id, location_id, work_date, employee_name, role, hours, hourly_cost)
        values(v_id, p_owner, p_location, p_date, btrim(v_line->>'employeeName'), nullif(btrim(v_line->>'role'), ''),
          (v_line->>'hours')::numeric, (v_line->>'hourlyCost')::numeric);
    else
      if not v_old_labor @> jsonb_build_array(jsonb_build_object('id', v_id)) then
        raise exception using errcode = '22023', message = 'Management labor ID is not linked to this day.';
      end if;
      insert into public.labor_entries(id, user_id, location_id, work_date, employee_name, role, hours, hourly_cost)
        values(v_id, p_owner, p_location, p_date, btrim(v_line->>'employeeName'), nullif(btrim(v_line->>'role'), ''),
          (v_line->>'hours')::numeric, (v_line->>'hourlyCost')::numeric)
        on conflict (id) do update set employee_name = excluded.employee_name, role = excluded.role,
          hours = excluded.hours, hourly_cost = excluded.hourly_cost
        where labor_entries.user_id = p_owner and labor_entries.location_id is not distinct from p_location
          and labor_entries.work_date = p_date;
      if not found then raise exception using errcode = '22023', message = 'Management labor ID has another scope.'; end if;
    end if;
    v_kept_ids := array_append(v_kept_ids, v_id);
    v_labor := v_labor || jsonb_build_array(v_line || jsonb_build_object('id', v_id));
  end loop;

  if not p_promote then
    delete from public.labor_entries
      where user_id = p_owner and location_id is not distinct from p_location and work_date = p_date
        and id in (select (value->>'id')::uuid from jsonb_array_elements(v_old_labor))
        and not id = any(v_kept_ids);
    insert into public.sales_imports(id, user_id, location_id, period_start, period_end, source_name, rows, total_revenue)
      values(p_id, p_owner, p_location, p_date, p_date, 'Manager 24/7', p_sales, round(v_revenue, 2))
      on conflict (id) do update set rows = excluded.rows, total_revenue = excluded.total_revenue
      where sales_imports.user_id = p_owner and sales_imports.location_id is not distinct from p_location
        and sales_imports.period_start = p_date and sales_imports.period_end = p_date and sales_imports.source_name = 'Manager 24/7';
    if not found then raise exception using errcode = '22023', message = 'Management sales ID has another scope.'; end if;
  end if;

  perform set_config('manager247.management_day_write', p_owner::text || '/' || p_id::text, true);
  insert into public.inventory_counts(id, user_id, location_id, counted_at, status, lines, total_value, daily_report)
    values(p_id, p_owner, p_location, p_date, 'confirmed', p_inventory, round(v_inventory_value, 2),
      jsonb_build_object('version', v_version + 1, 'scope', v_scope, 'requestId', p_request_id, 'sales', p_sales, 'labor', v_labor))
    on conflict (id) do update set lines = excluded.lines, total_value = excluded.total_value, daily_report = excluded.daily_report
    where inventory_counts.user_id = p_owner and inventory_counts.location_id is not distinct from p_location
      and inventory_counts.counted_at = p_date
    returning * into v_saved;
  if not found then raise exception using errcode = '22023', message = 'Management inventory ID has another scope.'; end if;
  perform set_config('manager247.management_day_write', '', true);
  return jsonb_build_object('applied', true, 'record', to_jsonb(v_saved));
end;
$$;

revoke all on function public.foodcost_save_management_day(uuid,uuid,uuid,date,integer,uuid,jsonb,jsonb,jsonb,boolean) from public, anon;
grant execute on function public.foodcost_save_management_day(uuid,uuid,uuid,date,integer,uuid,jsonb,jsonb,jsonb,boolean) to authenticated;

commit;
