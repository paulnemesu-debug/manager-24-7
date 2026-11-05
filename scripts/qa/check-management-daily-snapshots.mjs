import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
const owner = randomUUID();
const other = randomUUID();
const a = randomUUID();
const b = randomUUID();
const foreign = randomUUID();
const day = '2026-11-04';
const inventory = [{ catalogId: randomUUID(), name: 'QA milk', openingQuantity: 5, purchasesQuantity: 2, closingQuantity: 3, unitCost: 9.25 }];
const sales = [{ recipeId: randomUUID(), name: 'QA soup', quantity: 25, revenue: 375, theoreticalUnitCost: 3 }];
const labor = [{ employeeName: 'QA cook', role: 'Cook', hours: 8, hourlyCost: 30 }];
const migration = (name) => readFileSync(new URL(`../../supabase/migrations/${name}`, import.meta.url), 'utf8');

try {
  await db.exec(`
    create role authenticated;
    create role anon;
    create schema auth;
    create schema private;
    grant usage on schema auth to authenticated;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable
      as $$ select nullif(current_setting('qa.uid', true), '')::uuid $$;
    create function private.set_updated_at() returns trigger language plpgsql
      as $$ begin new.updated_at := now(); return new; end $$;
    create table public.workspace_members(id uuid primary key, role text);
    insert into auth.users values ('${owner}'), ('${other}');
  `);
  await db.exec(migration('20260917090000_manager247_operations_100.sql'));
  await db.exec(migration('20261105041501_atomic_management_daily_snapshots.sql'));
  await db.query('insert into public.business_locations(id, owner_user_id, name) values ($1,$2,$3), ($4,$2,$5), ($6,$7,$8)',
    [a, owner, 'Bistro A', b, 'Bistro B', foreign, other, 'Foreign']);
  const physical = randomUUID();
  await db.query('insert into public.inventory_counts(id,user_id,location_id,counted_at,status,lines) values ($1,$2,$3,$4,$5,$6)',
    [physical, owner, a, day, 'confirmed', JSON.stringify(inventory)]);
  await db.exec('set role authenticated');
  const auth = (id) => db.query("select set_config('qa.uid',$1,false)", [id]);
  await auth(owner);

  const initial = { owner, id: randomUUID(), location: a, day, version: 0, request: randomUUID(), inventory, sales, labor, promote: false };
  async function save(input) {
    const result = await db.query('select public.foodcost_save_management_day($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) as result', [
      input.owner, input.id, input.location, input.day, input.version, input.request,
      JSON.stringify(input.inventory), JSON.stringify(input.sales), JSON.stringify(input.labor), input.promote,
    ]);
    return result.rows[0].result;
  }
  async function components() {
    return {
      counts: (await db.query('select id,lines,daily_report from public.inventory_counts order by id')).rows,
      sales: (await db.query('select id,rows from public.sales_imports order by id')).rows,
      labor: (await db.query('select id,employee_name,hours,hourly_cost from public.labor_entries order by id')).rows,
    };
  }
  const first = await save(initial);
  assert.equal(first.applied, true);
  assert.equal(first.record.daily_report.version, 1);
  assert.deepEqual(first.record.lines, inventory);
  assert.deepEqual(first.record.daily_report.sales, sales);
  const laborId = first.record.daily_report.labor[0].id;
  assert.deepEqual(first.record.daily_report.labor, [{ ...labor[0], id: laborId }]);
  assert.deepEqual(await save(initial), first);
  await assert.rejects(db.query(`insert into public.inventory_counts(id,user_id,location_id,counted_at,status,lines)
    values($1,$2,$3,$4,'confirmed','[]') on conflict(id) do update set lines=excluded.lines`,
  [initial.id, owner, a, day]), /management day save/);
  await assert.rejects(db.query('update public.inventory_counts set daily_report=null where id=$1', [initial.id]), /management day save/);
  await assert.rejects(db.query('delete from public.inventory_counts where id=$1', [initial.id]), /cannot be deleted/);
  assert.deepEqual(await save(initial), first);
  assert.equal((await components()).labor.length, 1);
  const concurrentCreate = await save({ ...initial, id: randomUUID(), request: randomUUID() });
  assert.equal(concurrentCreate.applied, false);
  assert.equal(concurrentCreate.record.id, initial.id);
  assert.equal((await components()).sales.length, 1);
  const edit = { ...initial, request: randomUUID(), version: 1, labor: [{ ...labor[0], id: laborId, hours: 9 }] };
  const edited = await save(edit);
  assert.equal(edited.record.daily_report.version, 2);
  assert.equal(edited.record.daily_report.labor[0].id, laborId);
  assert.equal((await save({ ...initial, request: randomUUID(), version: 1 })).applied, false);
  assert.equal((await save(initial)).applied, false);
  const before = await components();
  await assert.rejects(save({ ...edit, version: 2, request: randomUUID(), labor: [{ ...labor[0], employeeName: 'Would be inserted' }, { ...labor[0], hours: 25 }] }), /invalid|labor|hour/i);
  assert.deepEqual(await components(), before);
  await assert.rejects(save({ ...edit, version: 2, request: randomUUID(), location: foreign }), /location|permission/i);
  await assert.rejects(save({ ...edit, version: 2, request: randomUUID(), location: b }), /location|scope/i);
  const otherLocation = await save({ ...initial, location: b, id: randomUUID(), request: randomUUID() });
  assert.equal(otherLocation.applied, true);
  assert.notEqual(otherLocation.record.daily_report.labor[0].id, laborId);
  await assert.rejects(save({ ...initial, location: null, id: randomUUID(), request: randomUUID(), labor: [{ ...labor[0], id: laborId }] }), /labor|link/i);
  const removed = await save({ ...edit, version: 2, request: randomUUID(), labor: [] });
  assert.equal(removed.record.daily_report.labor.length, 0);
  assert.deepEqual((await components()).labor.map(row => row.id), [otherLocation.record.daily_report.labor[0].id]);
  const legacy = { ...initial, location: a, day: '2026-10-01', id: randomUUID(), request: randomUUID(), promote: true };
  const legacyLabor = randomUUID();
  await db.query('insert into public.inventory_counts(id,user_id,location_id,counted_at,status,lines) values ($1,$2,$3,$4,$5,$6)',
    [legacy.id, owner, a, legacy.day, 'confirmed', JSON.stringify(inventory)]);
  await db.query('insert into public.sales_imports(id,user_id,location_id,period_start,period_end,source_name,rows) values ($1,$2,$3,$4,$4,$5,$6)',
    [legacy.id, owner, a, legacy.day, 'Manager 24/7', JSON.stringify(sales)]);
  await db.query('insert into public.labor_entries(id,user_id,location_id,work_date,employee_name,role,hours,hourly_cost) values ($1,$2,$3,$4,$5,$6,$7,$8)',
    [legacyLabor, owner, a, legacy.day, 'QA cook', 'Cook', 8, 30]);
  assert.deepEqual((await db.query('select id from public.management_physical_inventory')).rows, [{ id: physical }]);
  const beforePromotion = await components();
  await assert.rejects(save(legacy), /labor ID/);
  await assert.rejects(save({ ...legacy, labor: [{ ...labor[0], id: legacyLabor, hours: 7 }] }), /labor ID/);
  assert.deepEqual(await components(), beforePromotion);
  const promoted = await save({ ...legacy, labor: [{ ...labor[0], id: legacyLabor }] });
  assert.equal(promoted.record.id, legacy.id);
  assert.equal(promoted.record.daily_report.labor[0].id, legacyLabor);
  assert.deepEqual((await components()).labor, beforePromotion.labor);
  assert.deepEqual((await components()).sales, beforePromotion.sales);
  const sameDayOtherOwner = { ...initial, owner: other, location: null, id: randomUUID(), request: randomUUID() };
  await auth(other);
  assert.equal((await components()).counts.length, 0);
  await assert.rejects(save({ ...initial, request: randomUUID() }), /permission|owner/i);
  assert.equal((await save(sameDayOtherOwner)).applied, true);
  await auth(owner);
  assert.equal((await components()).counts.some(row => row.id === sameDayOtherOwner.id), false);
  assert.equal((await db.query('select id from public.inventory_counts where daily_report is null')).rows[0].id, physical);
  const general = await save({ ...initial, location: null, id: randomUUID(), request: randomUUID() });
  assert.equal(general.applied, true);
  await db.query('delete from public.business_locations where id=$1', [b]);
  const deletedLocation = (await db.query('select location_id,daily_report from public.inventory_counts where id=$1',
    [otherLocation.record.id])).rows[0];
  assert.equal(deletedLocation.location_id, null);
  assert.equal(deletedLocation.daily_report.scope, b);
  assert.equal((await save({ ...initial, location: null, id: randomUUID(), request: randomUUID() })).record.id, general.record.id);
  await db.exec('set role anon');
  await assert.rejects(save(initial), /permission/i);

  console.log('Management daily SQL passed: atomic validation, durable replay, stale version, same-day key, location/owner/anon isolation, linked labor and untouched physical inventory.');
} finally {
  await db.close();
}
