import { createClient, type Session, type User } from '@supabase/supabase-js';
import { beforeEach, expect, it, vi } from 'vitest';
import { applyPriceUpdates, saveCatalogIngredient } from './catalog-repository';
import type { CatalogIngredientDraft } from '@/types/recipe';

const fixture = vi.hoisted(() => ({ client: null as ReturnType<typeof createClient> | null }));
vi.mock('@/lib/supabase', () => ({ get supabase() { return fixture.client; }, isDemoMode: false }));
vi.mock('@react-native-async-storage/async-storage', () => ({ default: {} }));

const ownerId = '11111111-1111-4111-8111-111111111111';
const nextOwnerId = '55555555-5555-4555-8555-555555555555';
const catalogId = '22222222-2222-4222-8222-222222222222';
const oldOfferId = '33333333-3333-4333-8333-333333333333';
const newOfferId = '44444444-4444-4444-8444-444444444444';
const stamp = '2026-11-04T00:00:00Z';
const oldCatalog = { id: catalogId, user_id: ownerId, name: 'QA Milk', purchase_price: 5, price_unit: 'l', package_quantity: 6, package_price: 30, active: true, updated_at: stamp };
const oldOffer = {
  id: oldOfferId, user_id: ownerId, catalog_id: catalogId, supplier_name: 'Existing supplier',
  unit_price: 5, price_unit: 'l', package_quantity: 6, package_price: 30, is_active: true, updated_at: stamp,
};
let catalog: Record<string, unknown>;
let offers: Record<string, unknown>[];
let rejectOffers: boolean;
let loseReply: boolean;
let jwtOwner: string;
let switchAfterUserLookup: boolean;
const existing = {
  id: oldOfferId, supplierName: 'Existing supplier', unitPrice: 6, priceUnit: 'l' as const,
  packageQuantity: 6, packagePrice: 36, source: null, sourceDate: null, isActive: true,
};
const temporary = { ...existing, id: 'offer-temporary', supplierName: 'Other supplier', isActive: false };
const draft = (): CatalogIngredientDraft => ({
  id: catalogId, name: 'QA Milk', purchasePrice: 6, priceUnit: 'l',
  packageQuantity: 6, packagePrice: 36, defaultLossPercent: 0,
  supplier: existing.supplierName, notes: null, allergens: [], active: true,
  offers: [existing, temporary],
});
const problem = (code: string, message: string) => Response.json({ code, message }, { status: 400 });

const fetchFixture: typeof fetch = async (input, init) => {
  const url = new URL(String(input));
  const route = url.pathname.split('/').at(-1);
  const payload = init?.body ? JSON.parse(String(init.body)) : undefined;
  if (route === 'ingredient_catalog') {
    catalog = { ...catalog, ...payload, id: catalogId };
    return Response.json(catalog);
  }
  if (route === 'ingredient_supplier_offers') {
    if (init?.method === 'DELETE') {
      offers = [];
      return new Response(null, { status: 204 });
    }
    if (rejectOffers) return problem('23514', 'Offer rejected');
    const columns = url.searchParams.get('columns');
    const prefer = new Headers(init?.headers).get('Prefer');
    if (columns?.includes('"id"') && !prefer?.includes('missing=default')
      && payload.some((offer: { id?: string }) => offer.id === undefined)) return problem('23502', 'Missing offer ID');
    offers = payload;
    return new Response(null, { status: 201 });
  }
  if (route === 'foodcost_save_catalog_ingredient') {
    const bearer = new Headers(init?.headers).get('Authorization');
    if (bearer !== `Bearer ${payload.p_ingredient.user_id}`) return problem('P0001', 'CATALOG_OWNER_MISMATCH');
    if (rejectOffers) return problem('23514', 'Offer rejected');
    catalog = { ...catalog, ...payload.p_ingredient, id: catalogId };
    if (payload.p_offers !== undefined && payload.p_offers !== null) {
      offers = payload.p_offers.map((offer: { id?: string }) => ({
        ...offer, id: offer.id === oldOfferId ? oldOfferId : newOfferId, updated_at: stamp,
      }));
    }
    if (loseReply) throw new TypeError('Network request failed');
    return Response.json({ ...catalog, ingredient_supplier_offers: offers });
  }
  if (route === 'foodcost_apply_catalog_price_updates') {
    const bearer = new Headers(init?.headers).get('Authorization');
    if (bearer !== `Bearer ${payload.p_owner_id}`) return problem('P0001', 'CATALOG_OWNER_MISMATCH');
    const [change] = payload.p_updates;
    catalog = {
      ...catalog, purchase_price: change.purchase_price, supplier: change.supplier ?? catalog.supplier,
      package_price: null, package_quantity: null, price_source: change.source, price_source_date: change.source_date,
    };
    offers = [
      ...offers.map(offer => ({ ...offer, is_active: false })),
      { ...oldOffer, id: newOfferId, supplier_name: change.supplier, unit_price: change.purchase_price,
        package_price: null, package_quantity: null, source: change.source, source_date: change.source_date },
    ];
    return Response.json([{ ...catalog, ingredient_supplier_offers: offers }]);
  }
  throw Error(`Unexpected route ${url.pathname}`);
};

beforeEach(() => {
  catalog = { ...oldCatalog };
  offers = [{ ...oldOffer }];
  rejectOffers = false;
  loseReply = false;
  jwtOwner = ownerId;
  switchAfterUserLookup = false;
  fixture.client = createClient('http://127.0.0.1:9876', 'catalog-fixture-key', {
    global: { fetch: fetchFixture }, auth: { persistSession: false, autoRefreshToken: false },
  });
  vi.spyOn(fixture.client.auth, 'getSession').mockImplementation(async () => ({
    data: { session: { user: { id: jwtOwner }, access_token: jwtOwner } as Session }, error: null,
  }));
  vi.spyOn(fixture.client.auth, 'getUser').mockImplementation(async () => {
    if (switchAfterUserLookup) jwtOwner = nextOwnerId;
    return { data: { user: { id: ownerId } as User }, error: null };
  });
});

it('edits the catalog and returns canonical IDs for both existing and temporary offers', async () => {
  const result = await saveCatalogIngredient(draft());
  expect(result).toMatchObject({ id: catalogId, packagePrice: 36, purchasePrice: 6 });
  expect(result.offers).toMatchObject([{ id: oldOfferId, packagePrice: 36 }, { id: newOfferId, packagePrice: 36 }]);
});

it('keeps the previous catalog price and offers if the replacement is rejected', async () => {
  rejectOffers = true;
  await expect(saveCatalogIngredient(draft())).rejects.toMatchObject({ code: '23514' });
  expect(catalog).toEqual(oldCatalog);
  expect(offers).toEqual([oldOffer]);
});

it('retains offers when omitted and clears offers when explicitly empty', async () => {
  const { offers: _offers, ...withoutOffers } = draft();
  expect((await saveCatalogIngredient(withoutOffers)).offers).toMatchObject([{ id: oldOfferId }]);
  expect((await saveCatalogIngredient({ ...withoutOffers, offers: [] })).offers).toEqual([]);
  expect(offers).toEqual([]);
});

it('replays an id-less save with a lost response without duplicating its supplier offers', async () => {
  const input = { ...draft(), id: undefined };
  loseReply = true;
  await expect(saveCatalogIngredient(input)).rejects.toBeTruthy();
  loseReply = false;
  const result = await saveCatalogIngredient(input);
  expect(result.id).toBe(catalogId);
  expect(result.offers?.map(offer => offer.id)).toEqual([oldOfferId, newOfferId]);
  expect(offers).toHaveLength(2);
});

it('keeps the previous owner data when authentication changes after an owner lookup', async () => {
  switchAfterUserLookup = true;
  await expect(saveCatalogIngredient(draft())).rejects.toMatchObject({ message: 'CATALOG_OWNER_MISMATCH' });
  expect(catalog).toEqual(oldCatalog);
  expect(offers).toEqual([oldOffer]);
});

it('uses the captured workspace owner instead of adopting the new session owner', async () => {
  jwtOwner = nextOwnerId;
  await expect(saveCatalogIngredient({ ...draft(), id: undefined }, ownerId)).rejects.toMatchObject({
    message: 'CATALOG_OWNER_MISMATCH',
  });
  expect(catalog).toEqual(oldCatalog);
  expect(offers).toEqual([oldOffer]);
});

it('imports a unit price and supplier without leaving an older offer active', async () => {
  const saved = await applyPriceUpdates([{
    id: catalogId, purchasePrice: 9.5, supplier: 'Invoice supplier', source: 'invoice:QA', sourceDate: '2026-11-04',
  }], ownerId);
  expect(catalog).toMatchObject({ purchase_price: 9.5, package_price: null, package_quantity: null });
  expect(offers).toMatchObject([
    { id: oldOfferId, is_active: false, package_price: 30 },
    { id: newOfferId, is_active: true, supplier_name: 'Invoice supplier', unit_price: 9.5, package_price: null },
  ]);
  expect(saved).toMatchObject([{ id: catalogId, purchasePrice: 9.5 }]);
});
