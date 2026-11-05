import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
const owner = randomUUID();
const other = randomUUID();
const records = [
  { table: 'waste_prevention_plans', id: randomUUID(), field: 'company_name', insert: "reporting_year,company_name", values: "2026,'Original'" },
  { table: 'waste_receivers', id: randomUUID(), field: 'name', insert: 'name', values: "'Original'" },
  { table: 'food_redistributions', id: randomUUID(), field: 'product_name', insert: 'transfer_date,destination_type,product_name,quantity,unit', values: "'2026-11-05','consumer','Original',1,'kg'" },
];
const migration = name => readFileSync(new URL(`../../supabase/migrations/${name}`, import.meta.url), 'utf8');
const revisions = migration('20261105051411_waste_revision_clocks.sql');

try {
  await db.exec(`
    create role authenticated;
    create role anon;
    create role service_role;
    create schema auth;
    create schema private;
    grant usage on schema auth, private to authenticated;
    create table auth.users(id uuid primary key);
    create table public.business_locations(id uuid primary key);
    create function auth.uid() returns uuid language sql stable
      as $$ select nullif(current_setting('qa.uid', true), '')::uuid $$;
    create function private.set_updated_at() returns trigger language plpgsql set search_path = ''
      as $$ begin new.updated_at = now(); return new; end $$;
    insert into auth.users values ('${owner}'), ('${other}');
  `);
  await db.exec(migration('20260926182333_waste_redistribution_module.sql'));
  for (const record of records) {
    await db.exec(`insert into public.${record.table}(id,user_id,${record.insert},updated_at)
      values ('${record.id}','${owner}',${record.values},'2000-01-01T00:00:00Z')`);
  }
  const snapshot = async () => Promise.all(records.map(async record => ({
    table: record.table,
    rows: (await db.query(`select row_to_json(t) as row from public.${record.table} t order by id`)).rows,
    policies: (await db.query('select policyname,roles,cmd,qual,with_check from pg_policies where schemaname=$1 and tablename=$2 order by policyname', ['public', record.table])).rows,
    grants: (await db.query('select grantee,privilege_type from information_schema.role_table_grants where table_schema=$1 and table_name=$2 order by grantee,privilege_type', ['public', record.table])).rows,
  })));
  const before = await snapshot();
  await db.exec(revisions);
  await db.exec(revisions);
  assert.deepEqual(await snapshot(), before, 'Migration must not rewrite rows, policies or grants');
  await db.exec('set role authenticated');
  await db.query("select set_config('qa.uid',$1,false)", [owner]);

  for (const record of records) {
    const first = await db.query(`insert into public.${record.table}(id,user_id,${record.insert})
      values ($1,$2,${record.values}) on conflict(id) do update set ${record.field}='Edited'
      returning updated_at > '2000-01-01T00:00:00Z'::timestamptz as advanced,
      updated_at = transaction_timestamp() as server_owned, ${record.field} as value`, [record.id, owner]);
    assert.deepEqual(first.rows, [{ advanced: true, server_owned: true, value: 'Edited' }], `${record.table}: ordinary existing-ID upsert needs a fresh server revision`);
    const forged = await db.query(`update public.${record.table} set ${record.field}='Edited again',updated_at='2099-01-01T00:00:00Z'
      where id=$1 returning updated_at = transaction_timestamp() as server_owned`, [record.id]);
    assert.deepEqual(forged.rows, [{ server_owned: true }], `${record.table}: older APK client timestamps must not override the server clock`);
    const inserted = await db.query(`insert into public.${record.table}(id,user_id,${record.insert})
      values ($1,$2,${record.values}) returning updated_at = transaction_timestamp() as server_owned`, [randomUUID(), owner]);
    assert.deepEqual(inserted.rows, [{ server_owned: true }], `${record.table}: the existing INSERT default remains available`);
  }

  await db.query("select set_config('qa.uid',$1,false)", [other]);
  for (const record of records) {
    assert.equal((await db.query(`select id from public.${record.table}`)).rows.length, 0);
    assert.equal((await db.query(`update public.${record.table} set ${record.field}='Foreign' where id=$1 returning id`, [record.id])).rows.length, 0);
    await assert.rejects(db.query(`insert into public.${record.table}(id,user_id,${record.insert})
      values ($1,$2,${record.values}) on conflict(id) do update set ${record.field}='Foreign'`, [record.id, owner]), /row-level security/i);
  }
  await db.exec('set role anon');
  for (const record of records) {
    await assert.rejects(db.query(`select id from public.${record.table}`), /permission denied/i);
  }
  await db.exec('reset role');
  const triggers = (await db.query(`select c.relname, t.tgname, p.prosecdef
    from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_proc p on p.oid=t.tgfoid
    where c.relname in ('waste_prevention_plans','waste_receivers','food_redistributions') and not t.tgisinternal
    order by c.relname`)).rows;
  assert.deepEqual(triggers, [...records].sort((a, b) => a.table.localeCompare(b.table)).map(record => ({
    relname: record.table, tgname: `${record.table}_set_updated_at`, prosecdef: false,
  })));
  console.log('Waste revision SQL passed: three ordinary upsert clocks, old-client timestamp override, unchanged INSERT defaults, idempotent migration without data/policy/grant changes, owner/anon isolation and invoker triggers.');
} finally {
  await db.close();
}
