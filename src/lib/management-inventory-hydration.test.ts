import { createClient } from '@supabase/supabase-js';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const { disk, fixture } = vi.hoisted(() => ({
  disk: new Map<string, string>(),
  fixture: { client: null as ReturnType<typeof createClient> | null },
}));
vi.mock('@react-native-async-storage/async-storage', () => ({ default: {
  getItem: async (key: string) => disk.get(key) ?? null,
  setItem: async (key: string, value: string) => { disk.set(key, value); },
} }));
vi.mock('@/lib/supabase', () => ({
  isDemoMode: false, isSupabaseConfigured: true, get supabase() { return fixture.client; },
}));

import { loadManagementSnapshots, saveInventoryCount } from './management-repository';

const owner = 'qa-inventory-owner';
const other = 'another-owner';
const draft = {
  id: 'c01e6153-93d5-4ad4-9da9-5a715130e89b', date: '2026-11-04', locationId: 'bistro-location',
  inventory: [{ catalogId: 'cartofi', name: 'Cartofi', openingQuantity: 8, purchasesQuantity: 4, closingQuantity: 2.5, unitCost: 4.75 }],
  notes: 'Inventar fizic',
};
type Count = {
  id: string; user_id: string; location_id: string | null; counted_at: string;
  status: 'confirmed' | 'draft'; lines: typeof draft.inventory; updated_at: string; notes: string | null;
};
const rows = new Map<string, Count>();
let rejectWrites: boolean;
let failReads: boolean;
let inventoryQuery: URLSearchParams | null;
let serverWriteTime: string | undefined;

const fixtureFetch: typeof fetch = async (input, init) => {
  const url = new URL(String(input));
  expect(url.pathname).toBe(init?.method === 'POST' ? '/rest/v1/inventory_counts' : '/rest/v1/management_physical_inventory');
  if (init?.method === 'POST') {
    if (rejectWrites) return Response.json({ code: '23514' }, { status: 400 });
    const row = JSON.parse(String(init.body)) as Count;
    row.updated_at = serverWriteTime ?? row.updated_at ?? new Date().toISOString();
    rows.set(row.id, row);
    if (url.searchParams.get('select') === 'updated_at') return Response.json({ updated_at: row.updated_at }, { status: 201 });
    return new Response(null, { status: 201 });
  }
  inventoryQuery = url.searchParams;
  if (failReads) return Response.json({ code: 'PGRST000' }, { status: 400 });
  const location = url.searchParams.get('location_id');
  const matching = [...rows.values()].filter(row =>
    url.searchParams.get('user_id') === 'eq.' + row.user_id
      && url.searchParams.get('status') === 'eq.' + row.status
      && (!location || location === (row.location_id === null ? 'is.null' : 'eq.' + row.location_id)))
    .sort((left, right) => right.counted_at.localeCompare(left.counted_at)
      || right.updated_at.localeCompare(left.updated_at));
  return Response.json(matching.slice(0, Number(url.searchParams.get('limit') ?? matching.length)));
};

beforeEach(() => {
  disk.clear();
  rows.clear();
  rejectWrites = failReads = false;
  inventoryQuery = null;
  serverWriteTime = undefined;
  fixture.client = createClient('http://127.0.0.1:9876', 'fixture-publishable-key', {
    global: { fetch: fixtureFetch },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
});
afterEach(() => vi.useRealTimers());

it('reopens the confirmed physical count from PostgREST with empty device storage', async () => {
  expect((await saveInventoryCount(owner, draft)).syncState).toBe('synced');
  const confirmed = rows.get(draft.id)!;
  rows.set('foreign', { ...confirmed, id: 'foreign', user_id: other });
  rows.set('unconfirmed', { ...confirmed, id: 'unconfirmed', status: 'draft' });
  disk.clear();

  expect(await loadManagementSnapshots(owner)).toEqual([
    expect.objectContaining({ ...draft, kind: 'inventory', sales: [], labor: [], syncState: 'synced' }),
  ]);
  expect(inventoryQuery?.get('user_id')).toBe('eq.' + owner);
  expect(await loadManagementSnapshots(other)).toEqual([expect.objectContaining({ id: 'foreign' })]);
});

it.each(['older', 'empty', 'error'])('retains an acknowledged count when the cloud response is %s', async mode => {
  const saved = await saveInventoryCount(owner, draft);
  if (mode === 'older') {
    const remote = rows.get(draft.id)!;
    rows.set(draft.id, { ...remote, lines: [], updated_at: '2026-01-01T00:00:00+00:00' });
  } else if (mode === 'empty') {
    rows.clear();
  } else {
    failReads = true;
  }
  expect(await loadManagementSnapshots(owner)).toEqual([saved]);
});

it('does not replace an unacknowledged local edit with the cloud count', async () => {
  await saveInventoryCount(owner, draft);
  rejectWrites = true;
  const pending = await saveInventoryCount(owner, {
    ...draft, inventory: [{ ...draft.inventory[0], closingQuantity: 3.75 }],
  });
  expect(pending.syncState).toBe('pending');

  expect(await loadManagementSnapshots(owner)).toEqual([pending]);
  expect(rows.get(draft.id)?.lines[0].closingQuantity).toBe(2.5);
});

it('accepts a newer inventory count and persists it in the owner cache', async () => {
  await saveInventoryCount(owner, draft);
  const remote = rows.get(draft.id)!;
  rows.set(draft.id, { ...remote, lines: [{ ...draft.inventory[0], closingQuantity: 4 }], updated_at: '2099-01-01T00:00:00+00:00' });

  expect((await loadManagementSnapshots(owner))[0].inventory[0].closingQuantity).toBe(4);
  failReads = true;
  expect((await loadManagementSnapshots(owner))[0].inventory[0].closingQuantity).toBe(4);
});

it('uses the acknowledged server timestamp when a device clock is ahead', async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-04T13:00:00.000Z'));
  serverWriteTime = '2026-11-04T12:00:00.432123+00:00';
  const saved = await saveInventoryCount(owner, draft);
  expect(saved.updatedAt).toBe(serverWriteTime);
  const remote = rows.get(draft.id)!;
  rows.set(draft.id, { ...remote, lines: [{ ...draft.inventory[0], closingQuantity: 3 }], updated_at: '2026-11-04T12:00:01.123456+00:00' });

  expect((await loadManagementSnapshots(owner))[0].inventory[0].closingQuantity).toBe(3);
});

it('learns the server timestamp for a matching inventory cached by an older version', async () => {
  const saved = await saveInventoryCount(owner, draft);
  const remote = rows.get(draft.id)!;
  const legacy = { ...saved, updatedAt: '2099-01-01T13:00:00.000Z', inventoryServerUpdatedAt: undefined };
  disk.set('manager247.management.v1.' + owner, JSON.stringify([legacy]));
  expect((await loadManagementSnapshots(owner))[0].updatedAt).toBe(remote.updated_at);

  rows.set(draft.id, { ...remote, lines: [{ ...draft.inventory[0], closingQuantity: 5 }], updated_at: '2098-01-01T13:00:00.000Z' });
  expect((await loadManagementSnapshots(owner))[0].inventory[0].closingQuantity).toBe(5);
});

it('retains daily sales and labor when a full cloud inventory history is hydrated', async () => {
  const daily = {
    ...draft, id: 'older-daily', date: '2026-10-01', updatedAt: '2026-10-01T12:00:00.000Z',
    kind: 'daily', syncState: 'synced', syncFormat: 2,
    sales: [{ recipeId: null, name: 'Supă', quantity: 1, revenue: 30, theoreticalUnitCost: 10 }],
    labor: [{ employeeName: 'QA', role: 'Bucătar', hours: 8, hourlyCost: 20 }],
  };
  disk.set('manager247.management.v1.' + owner, JSON.stringify([daily]));
  for (let index = 0; index < 25; index++) {
    const id = `count-${index}`;
    rows.set(id, {
      id, user_id: owner, location_id: draft.locationId, counted_at: draft.date, status: 'confirmed',
      lines: draft.inventory, updated_at: `2026-11-04T12:00:${String(index).padStart(2, '0')}.000Z`, notes: null,
    });
  }

  const reloaded = await loadManagementSnapshots(owner);
  expect(reloaded.filter(snapshot => snapshot.kind === 'inventory')).toHaveLength(24);
  expect(reloaded[0].id).toBe('count-24');
  expect(reloaded).toContainEqual(daily);
  rows.clear();
  expect(await loadManagementSnapshots(owner)).toContainEqual(daily);
});

it('loads the selected location even when newer counts fill the history of another location', async () => {
  await saveInventoryCount(owner, draft);
  const old = rows.get(draft.id)!;
  rows.set(draft.id, { ...old, counted_at: '2026-10-01' });
  for (let index = 0; index < 24; index++) {
    const id = `other-location-count-${index}`;
    rows.set(id, { ...old, id, location_id: 'other-location' });
  }
  disk.clear();
  const reloaded = await loadManagementSnapshots(owner, { locationId: 'other-location' });
  expect(reloaded).toHaveLength(24);

  const selected = await loadManagementSnapshots(owner, { locationId: draft.locationId });
  expect(inventoryQuery?.get('location_id')).toBe('eq.' + draft.locationId);
  expect(selected).toContainEqual(expect.objectContaining({ id: draft.id, date: '2026-10-01' }));
});
