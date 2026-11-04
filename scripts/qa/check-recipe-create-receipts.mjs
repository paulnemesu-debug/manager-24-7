import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
const owner = '11111111-1111-4111-8111-111111111111';
const otherOwner = '22222222-2222-4222-8222-222222222222';
const requestId = 'offline-recipe-1762100000000-example';
const payload = {
  title: 'Valid flour recipe', servings: 2, cooking_method: 'none', cooking_loss_percent: 0,
  sale_price_gross: 10, vat_percent: 11, target_food_cost: 30, output_quantity: 1, output_unit: 'kg',
  ingredients: [{ name: 'Flour', quantity: 100, unit: 'g', purchase_price: 1, price_unit: 'kg', loss_percent: 0 }],
};

try {
  await db.exec(`
    create role authenticated;
    create role anon;
    create schema auth;
    create schema private;
    grant usage on schema auth to authenticated, anon;
    grant usage on schema private to authenticated;
    create table auth.users(id uuid primary key);
    insert into auth.users values ('${owner}'), ('${otherOwner}');
    create function auth.uid() returns uuid language sql stable
      as $$ select nullif(current_setting('test.user_id', true), '')::uuid $$;
    create function public.has_professional_access() returns boolean language sql stable
      as $$ select coalesce(current_setting('test.has_access', true), '') = 'yes' $$;
    create table public.recipes (
      id uuid primary key default gen_random_uuid(), user_id uuid, title text, category text,
      servings numeric, cooking_method text, cooking_loss_percent numeric, sale_price_gross numeric,
      vat_percent numeric, target_food_cost numeric, is_sub_recipe boolean, output_quantity numeric,
      output_unit text, manual_allergens text[], final_weight_g numeric, final_weight_measured boolean,
      is_defrosted boolean, nutrition_notes text, template_id text, template_source text, photo_path text,
      updated_at timestamptz default now(), calculation_error text
    );
    create table public.recipe_ingredients (
      recipe_id uuid, user_id uuid, ingredient_catalog_id uuid, subrecipe_id uuid, ingredient_name text,
      normalized_name text, quantity_net numeric, unit text, purchase_price numeric, price_unit text, loss_percent numeric,
      position bigint, allergens text[], allergens_confirmed boolean, additives text[], nutrition jsonb
    );
    create function public.foodcost_normalize_name(text) returns text language sql immutable as $$ select lower($1) $$;
    create function public.foodcost_recalculate(uuid) returns void language sql as $$ select $$;
    alter table public.recipes enable row level security;
    alter table public.recipe_ingredients enable row level security;
    grant select, insert, update, delete on public.recipes, public.recipe_ingredients to authenticated;
    create policy recipe_owner on public.recipes for all to authenticated
      using (user_id = auth.uid() and public.has_professional_access())
      with check (user_id = auth.uid() and public.has_professional_access());
    create policy ingredient_owner on public.recipe_ingredients for all to authenticated
      using (user_id = auth.uid() and public.has_professional_access())
      with check (user_id = auth.uid() and public.has_professional_access());
  `);
  for (const name of ['20261004101030_atomic_recipe_photos', '20261104165444_recipe_create_receipts']) {
    await db.exec(readFileSync(new URL(`../../supabase/migrations/${name}.sql`, import.meta.url), 'utf8'));
  }
  const auth = async (userId, access = true) => {
    await db.exec('set role authenticated');
    await db.query("select set_config('test.user_id', $1, false), set_config('test.has_access', $2, false)", [userId, access ? 'yes' : 'no']);
  };
  const create = async (draft = payload, key = requestId) => (await db.query(
    'select public.foodcost_create_recipe_once($1::jsonb, $2) as receipt', [JSON.stringify(draft), key],
  )).rows[0].receipt;
  const cancel = async (key = requestId) => db.query('select public.foodcost_cancel_recipe_create($1)', [key]);
  const lookup = async () => (await db.query(
    'select public.foodcost_create_recipe_once(null, $1) as receipt', [requestId],
  )).rows[0].receipt;

  await auth(owner);
  assert.equal(await lookup(), null);
  const first = await create();
  assert.equal(first.replayed, false);
  assert.ok(first.created_version);
  await db.query('update public.recipes set title = $1, updated_at = now() where id = $2', ['Edited elsewhere', first.recipe_id]);
  const retried = await create();
  assert.deepEqual(retried, { ...first, replayed: true });
  assert.deepEqual(await lookup(), retried);
  await assert.rejects(cancel(), /RECIPE_CONFLICT/);
  assert.equal((await db.query('select title from public.recipes')).rows[0].title, 'Edited elsewhere');
  await assert.rejects(create({ ...payload, id: first.recipe_id }), /INVALID_RECIPE_CREATE/);
  await assert.rejects(db.query('select * from private.recipe_create_receipts'), /permission denied/);

  await auth(otherOwner);
  const second = await create();
  assert.notEqual(second.recipe_id, first.recipe_id);
  assert.equal((await db.query('select id from public.recipes')).rows.length, 1);
  await assert.rejects(db.query('select private.recipe_create_receipt($1, $2)', ['another-key', first.recipe_id]), /RECIPE_NOT_FOUND/);
  await cancel();
  await cancel();
  await assert.rejects(create(), /RECIPE_NOT_FOUND/);
  assert.equal((await db.query('select id from public.recipes')).rows.length, 0);
  await auth(owner, false);
  await assert.rejects(create(), /PROFESSIONAL_ACCESS_REQUIRED/);
  await assert.rejects(cancel(), /PROFESSIONAL_ACCESS_REQUIRED/);
  await auth(owner);
  await db.query('delete from public.recipes where id = $1', [first.recipe_id]);
  await assert.rejects(create(), /RECIPE_NOT_FOUND/);
  await cancel('canceled-before-create');
  await assert.rejects(create(payload, 'canceled-before-create'), /RECIPE_NOT_FOUND/);
  assert.equal((await db.query('select id from public.recipes')).rows.length, 0);

  await db.exec('set role anon');
  await assert.rejects(create(), /permission denied/);
  await assert.rejects(cancel(), /permission denied/);
  await db.exec('reset role');
  await db.query('delete from auth.users where id = $1', [owner]);
  assert.deepEqual((await db.query('select user_id from private.recipe_create_receipts')).rows, [{ user_id: otherOwner }]);
  console.log('Recipe receipt checks passed: retry, original version, owner isolation, entitlement, cancellation, and deletion.');
} finally {
  await db.close();
}
