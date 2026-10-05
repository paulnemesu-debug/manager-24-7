-- Runs in a transaction and leaves no synthetic users or business data behind.
insert into auth.users(id) values ('e1600000-0000-4000-8000-000000000001'), ('e1600000-0000-4000-8000-000000000002');
set local role authenticated;
select set_config('request.jwt.claim.sub','e1600000-0000-4000-8000-000000000001',true);
insert into public.hr_employees(id,user_id,name) values ('e1600000-0000-4000-8000-000000000011','e1600000-0000-4000-8000-000000000001','QA v1.6.0 temporary');
do $$
declare first_result jsonb; replay jsonb; conflict jsonb; saved jsonb;
  document jsonb := '{"id":"qa-v160","title":"QA document","category":"other","owner":"","issueDate":"2026-01-01","expiryDate":"2026-10-04","notes":""}';
begin
  first_result := public.sync_operational_record('operational_documents','qa-v160',document,0);
  if first_result->>'applied' <> 'true' or first_result->'record'->>'version' <> '1' then raise exception 'insert failed'; end if;
  replay := public.sync_operational_record('operational_documents','qa-v160',document,0);
  if replay->>'applied' <> 'true' or replay->'record'->>'version' <> '1' then raise exception 'replay was not idempotent'; end if;
  saved := public.sync_operational_record('operational_documents','qa-v160',document || '{"title":"new title"}',1);
  if saved->'record'->>'version' <> '2' then raise exception 'revision did not advance'; end if;
  conflict := public.sync_operational_record('operational_documents','qa-v160',document || '{"title":"stale device"}',1);
  if conflict->>'applied' <> 'false' or conflict->'record'->'data'->>'title' <> 'new title' then raise exception 'conflict overwrote data'; end if;
  begin
    perform public.sync_operational_record('operational_documents','qa-invalid',document || '{"id":"qa-invalid","expiryDate":"2026-02-30"}',0);
    raise exception 'invalid date accepted';
  exception when datetime_field_overflow then null; end;
  perform public.sync_operational_record('hr_lifecycle','e1600000-0000-4000-8000-000000000011','{"employeeId":"e1600000-0000-4000-8000-000000000011","status":"left","hireDate":"2026-01-01","exitDate":"2026-10-04"}',0);
  if (select active from public.hr_employees where id='e1600000-0000-4000-8000-000000000011') then raise exception 'departure not linked to employee'; end if;
  update public.hr_employees set active=true where id='e1600000-0000-4000-8000-000000000011';
  if (select active from public.hr_employees where id='e1600000-0000-4000-8000-000000000011') then raise exception 'legacy edit reactivated employee'; end if;
end;
$$;
select set_config('request.jwt.claim.sub','e1600000-0000-4000-8000-000000000002',true);
do $$
begin
  if exists(select 1 from public.operational_documents where id='qa-v160') then raise exception 'cross-account document read'; end if;
  if exists(select 1 from public.hr_lifecycle where id='e1600000-0000-4000-8000-000000000011') then raise exception 'cross-account HR read'; end if;
  begin
    insert into public.operational_documents(user_id,id,data) values ('e1600000-0000-4000-8000-000000000001','attack','{"id":"attack","title":"unauthorized","category":"other"}');
    raise exception 'cross-account write accepted';
  exception when insufficient_privilege then null; end;
  begin
    perform public.sync_operational_record('hr_lifecycle','e1600000-0000-4000-8000-000000000011','{"employeeId":"e1600000-0000-4000-8000-000000000011","status":"active"}',0);
    raise exception 'foreign employee accepted';
  exception when foreign_key_violation then null; end;
end;
$$;
reset role;
select 'PASS: owner isolation, conflict handling, replay, date validation, employee link and legacy protection' as result;
