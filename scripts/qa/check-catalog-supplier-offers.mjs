import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
const a = '11111111-1111-4111-8111-111111111111';
const b = '22222222-2222-4222-8222-222222222222';
const draft = {
  name: 'QA Milk', normalized_name: 'qa milk', price_unit: 'l', purchase_price: 5,
  package_quantity: 6, package_price: 30, default_loss_percent: 0, supplier: 'QA supplier',
  notes: 'Keep the original note', allergens: [], allergens_confirmed: false, additives: [], nutrition: {}, active: true,
};
const offer = {
  id: 'offer-primary', supplier_name: 'QA supplier', unit_price: 5, price_unit: 'l',
  package_quantity: 6, package_price: 30, is_active: true,
};

try {
  await db.exec(`
    create role authenticated;
    create role anon;
    create schema auth;
    grant usage on schema auth to authenticated;
    create function auth.uid() returns uuid language sql stable
      as $$ select nullif(current_setting('qa.uid', true), '')::uuid $$;
    create function public.has_professional_access() returns boolean language sql stable
      as $$ select current_setting('qa.entitled', true) = 'yes' $$;
    create table public.ingredient_catalog (
      id uuid primary key default gen_random_uuid(), user_id uuid not null,
      name text not null, normalized_name text not null, purchase_price numeric not null check (purchase_price >= 0),
      price_unit text not null check (price_unit in ('kg','l','buc')), package_quantity numeric,
      package_price numeric, default_loss_percent numeric, supplier text, price_source text, price_source_date date, notes text,
      allergens text[], allergens_confirmed boolean, additives text[], nutrition jsonb, active boolean not null,
      created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
      unique(user_id, normalized_name)
    );
    create table public.ingredient_supplier_offers (
      id uuid primary key default gen_random_uuid(), user_id uuid not null,
      catalog_id uuid not null references public.ingredient_catalog(id) on delete cascade,
      supplier_name text not null check(length(btrim(supplier_name)) between 1 and 160),
      unit_price numeric not null check(unit_price >= 0), price_unit text not null check(price_unit in ('kg','l','buc')),
      package_quantity numeric check(package_quantity is null or package_quantity > 0),
      package_price numeric check(package_price is null or package_price >= 0),
      source text, source_date date, is_active boolean not null default false,
      created_at timestamptz not null default now(), updated_at timestamptz not null default now()
    );
    create unique index one_active_offer on public.ingredient_supplier_offers(catalog_id) where is_active;
    alter table public.ingredient_catalog enable row level security;
    alter table public.ingredient_supplier_offers enable row level security;
    grant select, insert, update, delete on public.ingredient_catalog, public.ingredient_supplier_offers to authenticated;
    create policy catalog_owner on public.ingredient_catalog for all to authenticated
      using (user_id = auth.uid() and public.has_professional_access())
      with check (user_id = auth.uid() and public.has_professional_access());
    create policy offer_owner on public.ingredient_supplier_offers for all to authenticated
      using (user_id = auth.uid() and public.has_professional_access())
      with check (user_id = auth.uid() and public.has_professional_access());
  `);
  await db.exec(readFileSync(new URL('../../supabase/migrations/20261104180433_atomic_catalog_supplier_offers.sql', import.meta.url), 'utf8'));
  await db.exec(readFileSync(new URL('../../supabase/migrations/20261104184425_atomic_catalog_import_prices.sql', import.meta.url), 'utf8'));
  async function auth(id, entitled = true) {
    await db.exec('set role authenticated');
    await db.query("select set_config('qa.uid', $1, false), set_config('qa.entitled', $2, false)", [id, entitled ? 'yes' : 'no']);
  }
  async function save(input, offers) {
    const result = await db.query('select public.foodcost_save_catalog_ingredient($1::jsonb, $2::jsonb) as saved',
      [JSON.stringify(input), offers === undefined ? null : JSON.stringify(offers)]);
    return result.rows[0].saved;
  }
  const readRows = async () => ({
    catalog: (await db.query('select id, package_price, purchase_price from public.ingredient_catalog order by id')).rows,
    offers: (await db.query('select id, catalog_id, package_price, unit_price from public.ingredient_supplier_offers order by id')).rows,
  });

  await auth(a);
  const first = await save(draft, [offer]);
  const replay = await save(draft, [offer]);
  assert.equal(replay.id, first.id);
  const canonicalId = first.ingredient_supplier_offers[0].id;
  assert.match(canonicalId, /^[a-f0-9-]{36}$/);
  assert.equal(replay.ingredient_supplier_offers[0].id, canonicalId);
  assert.equal((await readRows()).offers.length, 1);

  const edit = { ...draft, id: first.id, purchase_price: 6, package_price: 36 };
  const replacement = { ...offer, id: canonicalId, unit_price: 6, package_price: 36 };
  const second = { ...offer, id: 'offer-new', supplier_name: 'QA other supplier', is_active: false };
  const edited = await save(edit, [replacement, second]);
  assert.equal(edited.package_price, 36);
  assert.deepEqual(edited.ingredient_supplier_offers.map(item => item.supplier_name).sort(), ['QA other supplier', 'QA supplier']);
  assert.equal(edited.ingredient_supplier_offers.find(item => item.is_active).id, canonicalId);

  const before = await readRows();
  await assert.rejects(save({ ...edit, package_price: 90 }, [replacement, { ...second, unit_price: -1 }]), /check constraint/);
  assert.deepEqual(await readRows(), before);
  const omitted = await save(edit);
  assert.equal(omitted.ingredient_supplier_offers.length, 2);
  assert.deepEqual(await readRows(), before);

  await auth(b);
  await assert.rejects(save(edit, [replacement]), /CATALOG_NOT_FOUND/);
  await assert.rejects(save({ ...draft, user_id: a }, [offer]), /CATALOG_OWNER_MISMATCH/);
  const other = await save(draft, [offer]);
  assert.notEqual(other.id, first.id);
  assert.notEqual(other.ingredient_supplier_offers[0].id, canonicalId);
  assert.equal((await readRows()).catalog.length, 1);
  await auth(a, false);
  await assert.rejects(save(draft, [offer]), /PROFESSIONAL_ACCESS_REQUIRED/);
  await auth(a);
  assert.deepEqual(await readRows(), before);
  const cleared = await save(edit, []);
  assert.deepEqual(cleared.ingredient_supplier_offers, []);
  assert.deepEqual((await readRows()).offers, []);
  await save(edit, [replacement, second]);
  const updatePrices = async (owner, updates) => (await db.query(
    'select public.foodcost_apply_catalog_price_updates($1::uuid, $2::jsonb) as saved',
    [owner, JSON.stringify(updates)],
  )).rows[0].saved;
  const importedChange = { id: first.id, purchase_price: 9.5, supplier: 'QA invoice supplier', source: 'invoice:qa', source_date: '2026-11-04' };
  const [imported] = await updatePrices(a, [importedChange]);
  assert.equal(imported.purchase_price, 9.5);
  assert.equal(imported.package_price, null);
  assert.equal(imported.package_quantity, null);
  assert.equal(imported.notes, draft.notes);
  assert.equal(imported.ingredient_supplier_offers.length, 3);
  const importedOffer = imported.ingredient_supplier_offers.find(item => item.is_active);
  assert.equal(importedOffer.supplier_name, 'QA invoice supplier');
  assert.equal(importedOffer.unit_price, 9.5);
  assert.equal(importedOffer.package_price, null);
  assert.equal(imported.ingredient_supplier_offers.find(item => item.id === canonicalId).package_price, 36);
  const [generic] = await updatePrices(a, [{ id: first.id, purchase_price: 0, source: 'supplier_import' }]);
  assert.equal(generic.purchase_price, 0);
  assert.equal(generic.supplier, imported.supplier);
  assert.equal(generic.ingredient_supplier_offers.find(item => item.is_active).id, importedOffer.id);
  assert.equal(generic.ingredient_supplier_offers.find(item => item.is_active).unit_price, 0);
  const beforeBatch = await readRows();
  await assert.rejects(updatePrices(a, [importedChange, { ...importedChange, id: other.id }]), /CATALOG_NOT_FOUND/);
  assert.deepEqual(await readRows(), beforeBatch);
  await assert.rejects(updatePrices(a, [importedChange, { ...importedChange, id: 'invalid' }]), /invalid input syntax/);
  assert.deepEqual(await readRows(), beforeBatch);
  await auth(b);
  await assert.rejects(updatePrices(a, [importedChange]), /CATALOG_OWNER_MISMATCH/);
  await auth(a);
  await db.exec('set role anon');
  await assert.rejects(save(draft, [offer]), /permission denied/);
  await assert.rejects(updatePrices(a, [importedChange]), /permission denied/);
  console.log('Catalog supplier offer checks passed: canonical IDs, replay, rollback, optional offers, atomic imported prices, ownership, entitlement and anonymous denial.');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await db.close();
}
