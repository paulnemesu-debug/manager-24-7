-- Manager 24/7 1.6.0: account-scoped operational data with revision-based synchronization.
create table public.operational_documents (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null check (length(id) between 1 and 160),
  data jsonb not null check (jsonb_typeof(data) = 'object'),
  version bigint not null default 1 check (version > 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, id),
  constraint operational_document_id_matches check (data->>'id' is not null and data->>'id' = id),
  constraint operational_document_title check (length(btrim(data->>'title')) between 1 and 200 and data ? 'title'),
  constraint operational_document_category check (data->>'category' in ('authorization','medical','training','supplier','haccp','other') and data ? 'category'),
  constraint operational_document_lengths check (length(coalesce(data->>'owner','')) <= 200 and length(coalesce(data->>'notes','')) <= 4000),
  constraint operational_document_issue_date check (coalesce(data->>'issueDate','') = '' or ((data->>'issueDate') ~ '^\d{4}-\d{2}-\d{2}$' and (data->>'issueDate')::date is not null)),
  constraint operational_document_expiry_date check (coalesce(data->>'expiryDate','') = '' or ((data->>'expiryDate') ~ '^\d{4}-\d{2}-\d{2}$' and (data->>'expiryDate')::date is not null)),
  constraint operational_document_date_order check (nullif(data->>'issueDate','')::date <= nullif(data->>'expiryDate','')::date)
);
create table public.hr_lifecycle (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  employee_id uuid generated always as (id::uuid) stored,
  data jsonb not null check (jsonb_typeof(data) = 'object'),
  version bigint not null default 1 check (version > 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, id),
  foreign key (user_id, employee_id) references public.hr_employees(user_id, id) on delete cascade,
  constraint hr_lifecycle_id_matches check (data->>'employeeId' is not null and data->>'employeeId' = id),
  constraint hr_lifecycle_status check (data->>'status' in ('onboarding','active','offboarding','left') and data ? 'status'),
  constraint hr_lifecycle_notes check (length(coalesce(data->>'notes','')) <= 4000),
  constraint hr_lifecycle_hire_date check (coalesce(data->>'hireDate','') = '' or ((data->>'hireDate') ~ '^\d{4}-\d{2}-\d{2}$' and (data->>'hireDate')::date is not null)),
  constraint hr_lifecycle_exit_date check (coalesce(data->>'exitDate','') = '' or ((data->>'exitDate') ~ '^\d{4}-\d{2}-\d{2}$' and (data->>'exitDate')::date is not null)),
  constraint hr_lifecycle_date_order check (nullif(data->>'hireDate','')::date <= nullif(data->>'exitDate','')::date),
  constraint hr_lifecycle_left_date check (data->>'status' <> 'left' or nullif(data->>'exitDate','') is not null)
);
create index hr_lifecycle_employee_idx on public.hr_lifecycle(user_id, employee_id);
alter table public.operational_documents enable row level security;
alter table public.hr_lifecycle enable row level security;
create policy operational_documents_select on public.operational_documents for select to authenticated using ((select auth.uid()) = user_id);
create policy operational_documents_insert on public.operational_documents for insert to authenticated with check ((select auth.uid()) = user_id);
create policy operational_documents_update on public.operational_documents for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy hr_lifecycle_select on public.hr_lifecycle for select to authenticated using ((select auth.uid()) = user_id);
create policy hr_lifecycle_insert on public.hr_lifecycle for insert to authenticated with check ((select auth.uid()) = user_id);
create policy hr_lifecycle_update on public.hr_lifecycle for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
revoke all on public.operational_documents, public.hr_lifecycle from public, anon, authenticated;
grant select, insert, update on public.operational_documents, public.hr_lifecycle to authenticated;
grant all on public.operational_documents, public.hr_lifecycle to service_role;

create function public.sync_operational_record(p_kind text, p_id text, p_data jsonb, p_expected_version bigint)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  owner_id uuid := auth.uid();
  current_row jsonb;
  next_row jsonb;
  clean_data jsonb := p_data - array['syncState','serverVersion','remoteConflict'];
begin
  if owner_id is null then raise exception 'authentication_required' using errcode = '42501'; end if;
  if p_kind not in ('operational_documents','hr_lifecycle') or p_kind is null then raise exception 'invalid_record_kind'; end if;
  if p_id is null or length(p_id) not between 1 and 160 or p_expected_version is null or p_expected_version < 0 then raise exception 'invalid_record'; end if;
  if clean_data is null or jsonb_typeof(clean_data) <> 'object' then raise exception 'invalid_record_data'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(owner_id::text || ':' || p_kind || ':' || p_id, 0));
  execute format('select to_jsonb(r) from public.%I r where user_id = $1 and id = $2 for update', p_kind)
    into current_row using owner_id, p_id;
  if current_row is not null and ((current_row->'data') - 'updatedAt') = (clean_data - 'updatedAt') then
    return jsonb_build_object('applied', true, 'record', current_row);
  end if;
  if coalesce((current_row->>'version')::bigint, 0) <> p_expected_version then
    return jsonb_build_object('applied', false, 'record', current_row);
  end if;
  if current_row is null then
    execute format('insert into public.%I (user_id,id,data) values ($1,$2,$3) returning to_jsonb(%I.*)', p_kind, p_kind)
      into next_row using owner_id, p_id, clean_data;
  else
    execute format('update public.%I set data=$3, version=version+1, updated_at=clock_timestamp() where user_id=$1 and id=$2 returning to_jsonb(%I.*)', p_kind, p_kind)
      into next_row using owner_id, p_id, clean_data;
  end if;
  if p_kind = 'hr_lifecycle' then
    update public.hr_employees set active = (clean_data->>'status' <> 'left') where user_id = owner_id and id = p_id::uuid;
  end if;
  return jsonb_build_object('applied', true, 'record', next_row);
end;
$$;
revoke all on function public.sync_operational_record(text,text,jsonb,bigint) from public, anon;
grant execute on function public.sync_operational_record(text,text,jsonb,bigint) to authenticated;

-- Keep edits made by older clients from reactivating an employee marked as left.
create function private.apply_hr_lifecycle_status() returns trigger language plpgsql security invoker set search_path = '' as $$
declare lifecycle_status text;
begin
  select data->>'status' into lifecycle_status from public.hr_lifecycle where user_id = new.user_id and id = new.id::text;
  if lifecycle_status is not null then new.active := lifecycle_status <> 'left'; end if;
  return new;
end;
$$;
revoke all on function private.apply_hr_lifecycle_status() from public, anon;
create trigger hr_employee_lifecycle_status before insert or update on public.hr_employees for each row execute function private.apply_hr_lifecycle_status();
