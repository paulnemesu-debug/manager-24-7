// Actual Supabase SDK requests execute against local PostgreSQL (PGlite).
// This adapter translates only the ordinary table operations used below; it
// never contacts staging/production or bypasses PostgreSQL constraints/RLS.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { createClient } from '@supabase/supabase-js';

const db = new PGlite();
const owner = randomUUID(), other = randomUUID(), expired = randomUUID();
const id = randomUUID();
const migration = name => readFileSync(new URL(`../../supabase/migrations/${name}`, import.meta.url), 'utf8');
const patch = migration('20261105062619_supplier_orders_confirmed_status.sql');
const allowed = new Set(['id', 'user_id', 'location_id', 'supplier', 'order_date', 'status', 'lines', 'total_estimated', 'notes', 'created_at', 'updated_at']);
const http = [];

async function postgresFetch(input, init) {
  const url = new URL(String(input));
  assert.equal(url.origin, 'http://127.0.0.1:9876');
  assert.equal(url.pathname, '/rest/v1/supplier_orders');
  const method = init?.method ?? 'GET';
  const caller = new Headers(init?.headers).get('Authorization')?.replace(/^Bearer /, '');
  assert.ok([owner, other, expired, 'anonymous'].includes(caller));
  await db.exec('begin');
  try {
    await db.exec(caller === 'anonymous' ? 'set local role anon' : 'set local role authenticated');
    await db.query("select set_config('qa.uid',$1,true)", [caller === 'anonymous' ? '' : caller]);
    const values = [];
    const parameter = value => { values.push(value); return '$' + values.length; };
    const filters = [];
    for (const column of ['id', 'user_id', 'updated_at']) {
      const filter = url.searchParams.get(column);
      if (filter) { assert.ok(filter.startsWith('eq.')); filters.push(`${column}=${parameter(filter.slice(3))}`); }
    }
    const where = filters.length ? ' where ' + filters.join(' and ') : '';
    let sql;
    if (method === 'GET') sql = 'select to_jsonb(t) as record from public.supplier_orders t' + where;
    else {
      const body = JSON.parse(String(init?.body));
      assert.ok(body && !Array.isArray(body));
      const fields = Object.keys(body); assert.ok(fields.every(field => allowed.has(field)));
      const params = fields.map(field => parameter(field === 'lines' ? JSON.stringify(body[field]) : body[field]));
      if (method === 'POST') {
        sql = `insert into public.supplier_orders(${fields.join(',')}) values(${params.join(',')})`;
        if (new Headers(init?.headers).get('Prefer')?.includes('resolution=merge-duplicates')) {
          assert.equal(url.searchParams.get('on_conflict'), 'id');
          sql += ' on conflict(id) do update set ' + fields.filter(field => field !== 'id').map(field => `${field}=excluded.${field}`).join(',');
        }
      } else {
        assert.equal(method, 'PATCH'); assert.ok(filters.length > 0);
        sql = 'update public.supplier_orders set ' + fields.map((field, index) => `${field}=${params[index]}`).join(',') + where;
      }
      sql += ' returning to_jsonb(supplier_orders) as record';
    }
    const rows = (await db.query(sql, values)).rows.map(row => row.record);
    await db.exec('commit');
    if (new Headers(init?.headers).get('Accept')?.includes('application/vnd.pgrst.object+json')) {
      if (rows.length !== 1) { http.push({ method, status: 406 }); return Response.json({ code: 'PGRST116', message: 'Expected one row' }, { status: 406 }); }
      http.push({ method, status: 200 }); return Response.json(rows[0]);
    }
    http.push({ method, status: 200 }); return Response.json(rows);
  } catch (error) {
    await db.exec('rollback');
    http.push({ method, status: 400, code: error.code });
    return Response.json({ code: error.code, message: error.message }, { status: 400 });
  }
}
const client = user => createClient('http://127.0.0.1:9876', 'local-fixture-key', {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  global: { headers: { Authorization: 'Bearer ' + user }, fetch: postgresFetch },
});
const ok = result => { assert.equal(result.error, null, result.error?.message); return result.data; };

try {
  await db.exec(`
    create role authenticated; create role anon;
    create schema auth; create schema private;
    grant usage on schema auth,private to authenticated;
    create table auth.users(id uuid primary key);
    create table public.business_locations(id uuid primary key);
    create table public.ingredient_catalog(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('qa.uid',true),'')::uuid $$;
    create function private.set_updated_at() returns trigger language plpgsql set search_path='' as $$ begin new.updated_at=now(); return new; end $$;
    insert into auth.users values('${owner}'),('${other}'),('${expired}');
  `);
  await db.exec(migration('20260919210000_operations_control_workflows.sql'));
  await db.exec(`create function public.has_professional_access() returns boolean language sql stable
    as $$ select auth.uid() in ('${owner}'::uuid,'${other}'::uuid) $$;
    create policy individual_trial_access_gate on public.supplier_orders as restrictive for all to authenticated
      using ((select public.has_professional_access())) with check ((select public.has_professional_access()));`);
  for (const status of ['draft', 'sent', 'received', 'cancelled']) {
    await db.query('insert into public.supplier_orders(id,user_id,supplier,status) values($1,$2,$3,$4)', [randomUUID(), owner, 'Existing synthetic order', status]);
  }
  const snapshot = async () => ({
    rows: (await db.query('select to_jsonb(t) as record from public.supplier_orders t order by id')).rows,
    policies: (await db.query("select policyname,permissive,roles,cmd,qual,with_check from pg_policies where schemaname='public' and tablename='supplier_orders' order by policyname")).rows,
    grants: (await db.query("select grantee,privilege_type from information_schema.role_table_grants where table_schema='public' and table_name='supplier_orders' order by grantee,privilege_type")).rows,
    triggers: (await db.query("select tgname,pg_get_triggerdef(oid) as definition from pg_trigger where tgrelid='public.supplier_orders'::regclass and not tgisinternal order by tgname")).rows,
    otherConstraints: (await db.query("select conname,pg_get_constraintdef(oid) as definition from pg_constraint where conrelid='public.supplier_orders'::regclass and conname <> 'supplier_orders_status_check' order by conname")).rows,
    statusDefault: (await db.query("select column_default,is_nullable from information_schema.columns where table_schema='public' and table_name='supplier_orders' and column_name='status'")).rows,
  });
  const before = await snapshot();
  await db.exec(patch); await db.exec(patch);
  assert.deepEqual(await snapshot(), before, 'Migration must preserve existing rows, security, other constraints, trigger and status default');
  const a = client(owner), b = client(other), denied = client(expired), anon = client('anonymous');
  const draft = { id, user_id: owner, supplier: 'SDK synthetic supplier', order_date: '2026-11-05', lines: [], total_estimated: 0, notes: '' };
  let row = ok(await a.from('supplier_orders').insert(draft).select('*').single());
  assert.equal(row.status, 'draft');
  for (const status of ['sent', 'confirmed', 'received', 'cancelled', 'draft']) {
    row = ok(await a.from('supplier_orders').upsert({ ...draft, status }, { onConflict: 'id' }).select('*').single());
    assert.equal(row.id, id); assert.equal(row.status, status); assert.ok(Number.isFinite(Date.parse(row.updated_at)));
    assert.equal(ok(await a.from('supplier_orders').select('*').eq('user_id', owner).eq('id', id).single()).status, status);
  }
  row = ok(await a.from('supplier_orders').update({ status: 'sent' }).eq('user_id', owner).eq('id', id).select('*').single());
  const sentRevision = row.updated_at;
  row = ok(await a.from('supplier_orders').update({ status: 'confirmed' }).eq('user_id', owner).eq('id', id).eq('updated_at', sentRevision).select('*').single());
  assert.equal(row.status, 'confirmed'); assert.notEqual(row.updated_at, sentRevision, 'Existing server-clock trigger must advance');
  const stable = row;
  for (const invalid of ['processing', '', 'CONFIRMED']) {
    const failed = await a.from('supplier_orders').upsert({ ...draft, status: invalid }, { onConflict: 'id' }).select('*').single();
    assert.equal(failed.error?.code, '23514');
    assert.deepEqual(ok(await a.from('supplier_orders').select('*').eq('user_id', owner).eq('id', id).single()), stable);
  }
  const invalidInsert = await a.from('supplier_orders').insert({ ...draft, id: randomUUID(), status: 'processing' }).select('*').single();
  assert.equal(invalidInsert.error?.code, '23514');
  assert.deepEqual(ok(await b.from('supplier_orders').select('*').eq('id', id)), []);
  assert.ok((await b.from('supplier_orders').upsert({ ...draft, status: 'confirmed' }, { onConflict: 'id' }).select('*').single()).error);
  assert.ok((await denied.from('supplier_orders').insert({ ...draft, id: randomUUID(), user_id: expired, status: 'confirmed' }).select('*').single()).error);
  assert.ok((await anon.from('supplier_orders').select('*')).error);
  assert.deepEqual(ok(await a.from('supplier_orders').select('*').eq('user_id', owner).eq('id', id).single()), stable);
  const constraints = (await db.query("select convalidated,pg_get_constraintdef(oid) as definition from pg_constraint where conrelid='public.supplier_orders'::regclass and conname='supplier_orders_status_check'")).rows;
  assert.equal(constraints.length, 1); assert.equal(constraints[0].convalidated, true); assert.ok(constraints[0].definition.includes('confirmed'));
  console.log(JSON.stringify({ passed: true, ordinarySdkRequests: http.length, statuses: ['draft', 'sent', 'confirmed', 'received', 'cancelled'],
    conditionalReplayPassed: true, invalidStatusesRejected: true, existingRowsAndSecurityPreserved: true, migrationIdempotent: true, liveServiceContacted: false }));
} finally {
  await db.close();
}
