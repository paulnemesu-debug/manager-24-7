-- Durable deletion markers also protect clients running older versions.
create schema if not exists private;
create table private.hr_deleted_rows (
  user_id uuid not null references auth.users(id) on delete cascade,
  entity text not null check (entity in ('hr_employees', 'hr_shifts')),
  row_id uuid not null,
  deleted_at timestamptz not null default now(),
  primary key (user_id, entity, row_id)
);
alter table private.hr_deleted_rows enable row level security;
revoke all on private.hr_deleted_rows from public, anon, authenticated;
grant usage on schema private to authenticated, service_role;
grant select on private.hr_deleted_rows to authenticated;
grant all on private.hr_deleted_rows to service_role;
create policy hr_deletions_own on private.hr_deleted_rows for select to authenticated
  using ((select auth.uid()) = user_id);

create function private.record_hr_deletion() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is not null and auth.uid() <> old.user_id then
    raise exception 'hr_owner_mismatch' using errcode = '42501';
  end if;
  if not exists(select 1 from auth.users where id = old.user_id) then return old; end if;
  insert into private.hr_deleted_rows(user_id, entity, row_id)
  values(old.user_id, tg_table_name, old.id) on conflict do nothing;
  return old;
end;
$$;
create function private.prevent_hr_resurrection() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is not null and auth.uid() <> new.user_id then
    raise exception 'hr_owner_mismatch' using errcode = '42501';
  end if;
  if exists(select 1 from private.hr_deleted_rows
    where user_id = new.user_id and entity = tg_table_name and row_id = new.id) then
    raise exception 'hr_record_deleted' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function private.record_hr_deletion() from public, anon, authenticated;
revoke all on function private.prevent_hr_resurrection() from public, anon, authenticated;
create trigger hr_employees_record_deletion after delete on public.hr_employees
  for each row execute function private.record_hr_deletion();
create trigger hr_shifts_record_deletion after delete on public.hr_shifts
  for each row execute function private.record_hr_deletion();
create trigger hr_employees_prevent_resurrection before insert or update on public.hr_employees
  for each row execute function private.prevent_hr_resurrection();
create trigger hr_shifts_prevent_resurrection before insert or update on public.hr_shifts
  for each row execute function private.prevent_hr_resurrection();

create function public.list_hr_deletions() returns jsonb
language sql stable security invoker set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('entity',d.entity,'row_id',d.row_id)), '[]'::jsonb) from private.hr_deleted_rows d where d.user_id = (select auth.uid());
$$;
revoke all on function public.list_hr_deletions() from public, anon;
grant execute on function public.list_hr_deletions() to authenticated;

-- AI quotas are server-only: clients cannot reset a counter or raise its limit.
create table private.document_scan_usage (
  account_id uuid not null references auth.users(id) on delete cascade,
  usage_date date not null,
  scans integer not null check (scans > 0),
  last_scan_at timestamptz not null,
  primary key(account_id, usage_date)
);
alter table private.document_scan_usage enable row level security;
revoke all on private.document_scan_usage from public, anon, authenticated;
grant all on private.document_scan_usage to service_role;
create function public.reserve_document_scan(p_account_id uuid, p_limit integer default 20)
returns integer language plpgsql security invoker set search_path = '' as $$
declare
  used integer;
  today date := (now() at time zone 'Europe/Bucharest')::date;
begin
  if p_limit < 1 or p_limit > 200 then raise exception 'invalid_scan_limit'; end if;
  insert into private.document_scan_usage as counter(account_id, usage_date, scans, last_scan_at)
  values(p_account_id, today, 1, now())
  on conflict(account_id, usage_date) do update
    set scans = counter.scans + 1, last_scan_at = now()
    where counter.scans < p_limit and counter.last_scan_at <= now() - interval '10 seconds'
  returning scans into used;
  if used is not null then return p_limit - used; end if;
  select scans into used from private.document_scan_usage where account_id=p_account_id and usage_date=today;
  return case when used >= p_limit then -1 else -2 end;
end;
$$;
revoke all on function public.reserve_document_scan(uuid, integer) from public, anon, authenticated;
grant execute on function public.reserve_document_scan(uuid, integer) to service_role;
