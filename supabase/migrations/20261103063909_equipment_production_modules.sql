-- Additive owner-scoped modules. Existing records and RPC behavior remain intact.

create table public.asset_profiles (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null check (length(id) between 1 and 160),
  data jsonb not null check (jsonb_typeof(data) = 'object' and octet_length(data::text) <= 2000000),
  version bigint not null default 1 check (version > 0),
  updated_at timestamptz not null default now(),
  primary key (user_id,id),
  constraint asset_profiles_id_matches check (data ? 'id' and data->>'id' is not null and data->>'id'=id)
);
alter table public.asset_profiles enable row level security;
create policy asset_profiles_select on public.asset_profiles for select to authenticated using ((select auth.uid())=user_id);
create policy asset_profiles_insert on public.asset_profiles for insert to authenticated with check ((select auth.uid())=user_id);
create policy asset_profiles_update on public.asset_profiles for update to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
create policy individual_trial_access_gate on public.asset_profiles as restrictive for all to authenticated using ((select public.has_professional_access())) with check ((select public.has_professional_access()));
revoke all on public.asset_profiles from public,anon,authenticated;
grant select,insert,update on public.asset_profiles to authenticated;
grant all on public.asset_profiles to service_role;

create table public.maintenance_entries (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null check (length(id) between 1 and 160),
  data jsonb not null check (jsonb_typeof(data) = 'object' and octet_length(data::text) <= 2000000),
  version bigint not null default 1 check (version > 0),
  updated_at timestamptz not null default now(),
  primary key (user_id,id),
  constraint maintenance_entries_id_matches check (data ? 'id' and data->>'id' is not null and data->>'id'=id)
);
alter table public.maintenance_entries enable row level security;
create policy maintenance_entries_select on public.maintenance_entries for select to authenticated using ((select auth.uid())=user_id);
create policy maintenance_entries_insert on public.maintenance_entries for insert to authenticated with check ((select auth.uid())=user_id);
create policy maintenance_entries_update on public.maintenance_entries for update to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
create policy individual_trial_access_gate on public.maintenance_entries as restrictive for all to authenticated using ((select public.has_professional_access())) with check ((select public.has_professional_access()));
revoke all on public.maintenance_entries from public,anon,authenticated;
grant select,insert,update on public.maintenance_entries to authenticated;
grant all on public.maintenance_entries to service_role;

create table public.production_sheets (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null check (length(id) between 1 and 160),
  data jsonb not null check (jsonb_typeof(data) = 'object' and octet_length(data::text) <= 2000000),
  version bigint not null default 1 check (version > 0),
  updated_at timestamptz not null default now(),
  primary key (user_id,id),
  constraint production_sheets_id_matches check (data ? 'id' and data->>'id' is not null and data->>'id'=id)
);
alter table public.production_sheets enable row level security;
create policy production_sheets_select on public.production_sheets for select to authenticated using ((select auth.uid())=user_id);
create policy production_sheets_insert on public.production_sheets for insert to authenticated with check ((select auth.uid())=user_id);
create policy production_sheets_update on public.production_sheets for update to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
create policy individual_trial_access_gate on public.production_sheets as restrictive for all to authenticated using ((select public.has_professional_access())) with check ((select public.has_professional_access()));
revoke all on public.production_sheets from public,anon,authenticated;
grant select,insert,update on public.production_sheets to authenticated;
grant all on public.production_sheets to service_role;

-- Protect completed history even against direct API updates; ownership stays governed by RLS.
create function private.guard_equipment_production_history() returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if tg_op='UPDATE' then
    if (tg_table_name='production_sheets' and old.data->>'status'='validated')
       or (tg_table_name='maintenance_entries' and coalesce(old.data->>'completedDate','')<>'') then
      if (new.data - 'updatedAt') is distinct from (old.data - 'updatedAt') then
        raise exception 'completed_history_immutable' using errcode='23514';
      end if;
    end if;
    new.version := old.version + 1;
  else
    new.version := 1;
  end if;
  new.updated_at := clock_timestamp();
  return new;
end;
$$;
revoke all on function private.guard_equipment_production_history() from public,anon,authenticated;

create trigger asset_profiles_history before insert or update on public.asset_profiles for each row execute function private.guard_equipment_production_history();

create trigger maintenance_entries_history before insert or update on public.maintenance_entries for each row execute function private.guard_equipment_production_history();

create trigger production_sheets_history before insert or update on public.production_sheets for each row execute function private.guard_equipment_production_history();

create or replace function public.sync_operational_record(p_kind text, p_id text, p_data jsonb, p_expected_version bigint)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  owner_id uuid := auth.uid();
  current_row jsonb;
  next_row jsonb;
  clean_data jsonb := p_data - array['syncState','serverVersion','remoteConflict'];
begin
  if owner_id is null then raise exception 'authentication_required' using errcode = '42501'; end if;
  if p_kind not in ('operational_documents','hr_lifecycle','asset_profiles','maintenance_entries','production_sheets') or p_kind is null then raise exception 'invalid_record_kind'; end if;
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

-- A durable issuance ledger distinguishes an intentionally deleted voucher from one never issued.
create table public.production_voucher_links (
  user_id uuid not null references auth.users(id) on delete cascade,
  sheet_id text not null,
  voucher_id uuid not null,
  created_at timestamptz not null default now(),
  primary key(user_id,sheet_id),
  unique(user_id,voucher_id),
  foreign key(user_id,sheet_id) references public.production_sheets(user_id,id) on delete cascade
);
alter table public.production_voucher_links enable row level security;
create policy production_voucher_links_select on public.production_voucher_links for select to authenticated using((select auth.uid())=user_id);
create policy production_voucher_links_insert on public.production_voucher_links for insert to authenticated with check((select auth.uid())=user_id);
create policy individual_trial_access_gate on public.production_voucher_links as restrictive for all to authenticated using((select public.has_professional_access())) with check((select public.has_professional_access()));
revoke all on public.production_voucher_links from public,anon,authenticated;
grant select,insert on public.production_voucher_links to authenticated;
grant all on public.production_voucher_links to service_role;

create function public.create_production_sheet_voucher(p_sheet_id text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare
  owner_id uuid := auth.uid();
  sheet jsonb;
  voucher_id uuid;
  issued_id uuid;
  existing jsonb;
  voucher_lines jsonb;
  voucher_total numeric;
begin
  if owner_id is null then raise exception 'authentication_required' using errcode='42501'; end if;
  if p_sheet_id is null or length(p_sheet_id) not between 1 and 160 then raise exception 'invalid_sheet'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(owner_id::text || ':production-voucher:' || p_sheet_id,0));
  select data into sheet from public.production_sheets where user_id=owner_id and id=p_sheet_id;
  if sheet is null or sheet->>'status' is distinct from 'validated' then raise exception 'validated_sheet_required'; end if;
  voucher_id := (sheet->>'voucherId')::uuid;
  if voucher_id is null then raise exception 'invalid_voucher_id'; end if;
  select l.voucher_id into issued_id from public.production_voucher_links l where l.user_id=owner_id and l.sheet_id=p_sheet_id;
  select to_jsonb(v) into existing from public.consumption_vouchers v where v.user_id=owner_id and v.id=voucher_id;
  if issued_id is not null then
    if issued_id <> voucher_id then raise exception 'voucher_identity_mismatch'; end if;
    return jsonb_build_object('status',case when existing is null then 'deleted' else 'existing' end,'id',voucher_id,'record',existing);
  end if;
  insert into public.production_voucher_links(user_id,sheet_id,voucher_id) values(owner_id,p_sheet_id,voucher_id);
  if existing is not null then return jsonb_build_object('status','existing','id',voucher_id,'record',existing); end if;
  if jsonb_typeof(sheet->'lines') is distinct from 'array' or jsonb_array_length(sheet->'lines') not between 1 and 500 then raise exception 'invalid_consumption_lines'; end if;
  if exists(select 1 from jsonb_array_elements(sheet->'lines') line where
     jsonb_typeof(line->'actualQuantity') is distinct from 'number' or jsonb_typeof(line->'unitCost') is distinct from 'number'
     or (line->>'actualQuantity')::numeric < 0 or (line->>'unitCost')::numeric < 0
     or coalesce(line->>'unit','') not in ('kg','l','buc')) then raise exception 'invalid_actual_consumption'; end if;
  select jsonb_agg(jsonb_build_object('id',line->>'id','catalogId',line->'catalogId','name',line->>'name',
    'quantity',(line->>'actualQuantity')::numeric,'unit',line->>'unit','purchasePrice',(line->>'unitCost')::numeric,
    'priceUnit',line->>'unit','cost',(line->>'actualQuantity')::numeric*(line->>'unitCost')::numeric)),
    sum((line->>'actualQuantity')::numeric*(line->>'unitCost')::numeric)
    into voucher_lines,voucher_total from jsonb_array_elements(sheet->'lines') line;
  insert into public.consumption_vouchers(id,user_id,document_date,reference,source,source_reference,notes,lines,total_cost)
    values(voucher_id,owner_id,(sheet->>'batchDate')::date,left(sheet->>'recipeTitle',160),'production_plan',p_sheet_id,left(coalesce(sheet->>'notes',''),2000),voucher_lines,voucher_total)
    on conflict(id) do nothing;
  select to_jsonb(v) into existing from public.consumption_vouchers v where v.user_id=owner_id and v.id=voucher_id;
  if existing is null then raise exception 'voucher_identity_unavailable'; end if;
  return jsonb_build_object('status','created','id',voucher_id,'record',existing);
end;
$$;
revoke all on function public.create_production_sheet_voucher(text) from public,anon;
grant execute on function public.create_production_sheet_voucher(text) to authenticated;
