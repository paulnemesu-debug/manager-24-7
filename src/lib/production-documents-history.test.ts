import { createClient, type Session } from '@supabase/supabase-js';
import { beforeEach, expect, it, vi } from 'vitest';
import type { BulkBatchDraft, ConsumptionVoucherDraft } from '@/types/operations';

const { disk, fixture } = vi.hoisted(() => ({
  disk: new Map<string, string>(),
  fixture: { client: null as ReturnType<typeof createClient> | null, storageFail: false },
}));
vi.mock('@react-native-async-storage/async-storage', () => ({ default: {
  getItem: async (key: string) => disk.get(key) ?? null,
  setItem: async (key: string, value: string) => {
    if (fixture.storageFail) throw Error('Injected storage failure');
    disk.set(key, value);
  },
} }));
vi.mock('@/lib/supabase', () => ({ isDemoMode: false, isSupabaseConfigured: true, get supabase() { return fixture.client; } }));

import {
  createConsumptionVoucherOnce, loadCachedBulkBatches, loadCachedConsumptionVouchers,
  saveBulkBatch, saveConsumptionVoucher, syncBulkBatches, syncConsumptionVouchers,
} from './production-documents-repository';

const owner = 'owner-a';
const other = 'owner-b';
const stamp = '2026-11-05T10:00:00.123456+00:00';
type ServerRow = Record<string, unknown> & { id: string; user_id: string; updated_at: string };
type Table = 'consumption_vouchers' | 'bulk_batches';
const rows: Record<Table, Map<string, ServerRow>> = { consumption_vouchers: new Map(), bulk_batches: new Map() };
const writes: { table: Table; authorization: string | null; method: string }[] = [];
const lookups: { table: Table; ids: string[]; authorization: string | null }[] = [];
let activeOwner: string;
let listEmpty: boolean;
let offline: boolean;
let lookupFails: boolean;
let listOverride: ServerRow[] | undefined;
let switchAfterList: boolean;
let switchAfterSession: boolean;
let loseNextWrite: boolean;
let changeAfterLookup: boolean;

const line = { id: 'line', catalogId: null, name: 'QA milk', quantity: 2, unit: 'kg' as const, purchasePrice: 8, priceUnit: 'kg' as const, cost: 16 };
const voucher = (id: string): ConsumptionVoucherDraft => ({
  id, documentDate: '2026-11-05', reference: 'QA ' + id, source: 'manual', sourceReference: null, notes: 'Saved QA', lines: [line],
});
const batch = (id: string): BulkBatchDraft => ({
  id, recipeId: null, batchDate: '2026-11-05', title: 'QA ' + id, source: 'manual', sourceReference: null,
  notes: 'Saved QA', lines: [line], finalWeightGrams: 1000, portions: 4, salePriceGross: 20, vatPercent: 11,
});

const fixtureFetch: typeof fetch = async (input, init) => {
  if (offline) throw new TypeError('Injected offline');
  const url = new URL(String(input));
  const authorization = new Headers(init?.headers).get('authorization');
  if (url.pathname.endsWith('/rpc/create_production_sheet_voucher')) {
    const row = rows.consumption_vouchers.get('generated');
    return Response.json({ id: 'generated', status: row ? 'existing' : 'deleted', record: row ?? null });
  }
  const table = url.pathname.split('/').at(-1) as Table;
  expect(['consumption_vouchers', 'bulk_batches']).toContain(table);
  if (init?.method === 'POST' || init?.method === 'PATCH') {
    const row = JSON.parse(String(init.body));
    writes.push({ table, authorization, method: init.method });
    const current = rows[table].get(row.id);
    if (init.method === 'PATCH' && url.searchParams.get('updated_at') !== 'eq.' + current?.updated_at) {
      return Response.json({ code: 'PGRST116' }, { status: 406 });
    }
    if (init.method === 'POST' && !url.searchParams.has('on_conflict') && current) {
      return Response.json({ code: '23505' }, { status: 409 });
    }
    row.updated_at = stamp;
    rows[table].set(row.id, row);
    if (loseNextWrite) { loseNextWrite = false; throw new TypeError('Committed but response lost'); }
    if (url.searchParams.get('select') === 'updated_at') return Response.json({ updated_at: stamp }, { status: 201 });
    return Response.json(row, { status: 201 });
  }
  const idQuery = url.searchParams.get('id');
  const scoped = [...rows[table].values()].filter(row => url.searchParams.get('user_id') === `eq.${row.user_id}`);
  if (idQuery?.startsWith('in.')) {
    const ids = idQuery.slice(4, -1).split(',');
    lookups.push({ table, ids, authorization });
    if (lookupFails) return Response.json({ code: 'PGRST000' }, { status: 503 });
    const selected = scoped.filter(row => ids.includes(row.id));
    if (changeAfterLookup) {
      changeAfterLookup = false;
      const id = ids[0];
      const previous = rows[table].get(id);
      if (previous) rows[table].set(id, { ...previous, notes: 'Concurrent edit', updated_at: '2026-11-05T12:00:00.123456+00:00' });
    }
    return Response.json(selected);
  }
  const list = listOverride ?? (listEmpty ? [] : scoped.slice(0, 100));
  if (switchAfterList) activeOwner = other;
  return Response.json(list);
};

beforeEach(() => {
  disk.clear();
  for (const table of Object.values(rows)) table.clear();
  writes.length = lookups.length = 0;
  activeOwner = owner;
  fixture.storageFail = listEmpty = offline = lookupFails = switchAfterList = switchAfterSession = loseNextWrite = changeAfterLookup = false;
  listOverride = undefined;
  fixture.client = createClient('http://127.0.0.1:9876', 'fixture-key', {
    db: { retry: false },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: fixtureFetch },
  });
  vi.spyOn(fixture.client.auth, 'getSession').mockImplementation(async () => {
    const current = activeOwner;
    if (switchAfterSession) activeOwner = other;
    return { data: { session: { user: { id: current }, access_token: 'token-' + current } as Session }, error: null };
  });
});

const cases = [
  { table: 'consumption_vouchers' as const, save: (id: string) => saveConsumptionVoucher(owner, voucher(id)), sync: syncConsumptionVouchers, cached: loadCachedConsumptionVouchers },
  { table: 'bulk_batches' as const, save: (id: string) => saveBulkBatch(owner, batch(id)), sync: syncBulkBatches, cached: loadCachedBulkBatches },
];

it.each(cases)('$table acknowledges the server timestamp and pins the saving session', async ({ save }) => {
  switchAfterSession = true;
  const saved = await save('saved');
  expect(saved).toMatchObject({ syncState: 'synced', updatedAt: stamp });
  expect(writes[0].authorization).toBe('Bearer token-owner-a');
});

it.each(cases)('$table queues locally without dispatching as a different active user', async ({ save, sync }) => {
  activeOwner = other;
  expect((await save('pending')).syncState).toBe('pending');
  expect(writes).toEqual([]);
  expect(await sync(other)).toEqual([]);
});

it.each(cases)('$table retains 105 saved rows across limited and empty lists, offline reopen, and verification failure', async ({ table, save, sync, cached }) => {
  for (let index = 0; index < 105; index++) await save('record-' + index);
  const before = await cached(owner);
  expect(before).toHaveLength(105);
  writes.length = 0;
  expect(await sync(owner)).toHaveLength(105);
  expect(lookups.some(call => call.ids.includes('record-104'))).toBe(true);
  listEmpty = true;
  expect(await sync(owner)).toHaveLength(105);
  expect(lookups.every(call => call.ids.length <= 50)).toBe(true);
  lookupFails = true;
  expect(await sync(owner)).toHaveLength(105);
  offline = true;
  expect(await sync(owner)).toHaveLength(105);
  expect(await cached(owner)).toHaveLength(105);
  expect(rows[table].size).toBe(105);
  expect(writes).toEqual([]);
});

it.each(cases)('$table rejects older list/lookup values, adopts targeted newer values, and accepts verified deletion', async ({ table, save, sync, cached }) => {
  await save('saved');
  const acknowledged = { ...rows[table].get('saved')! };
  listOverride = [{ ...acknowledged, notes: 'Stale list', updated_at: '2026-11-05T10:00:00.123455+00:00' }];
  rows[table].set('saved', { ...acknowledged, notes: 'Stale target', updated_at: '2026-11-05T10:00:00.123454+00:00' });
  expect((await sync(owner))[0].notes).toBe('Saved QA');
  rows[table].set('saved', { ...acknowledged, notes: 'Newer target', updated_at: '2026-11-05T10:00:00.123457+00:00' });
  expect((await sync(owner))[0].notes).toBe('Newer target');
  expect(writes).toHaveLength(1);
  listEmpty = true;
  listOverride = undefined;
  rows[table].delete('saved');
  expect(await sync(owner)).toEqual([]);
  expect(await cached(owner)).toEqual([]);
  expect(writes).toHaveLength(1);
});

it.each(cases)('$table targets the captured owner after an awaited list and never loads another account cache', async ({ table, save, sync }) => {
  await save('saved');
  listEmpty = true;
  switchAfterList = true;
  expect(await sync(owner)).toHaveLength(1);
  expect(lookups[0].authorization).toBe('Bearer token-owner-a');
  expect(lookups[0].table).toBe(table);
  expect(await sync(other)).toEqual([]);
  expect(writes).toHaveLength(1);
});

it.each(cases)('$table preserves durable bytes when history write fails', async ({ save, sync, cached }) => {
  await save('saved');
  const before = await cached(owner);
  listEmpty = true;
  fixture.storageFail = true;
  await expect(sync(owner)).rejects.toThrow('Injected storage failure');
  expect(await cached(owner)).toEqual(before);
});

it('keeps create-only deletion receipts and never resurrects them from stale list data', async () => {
  await saveConsumptionVoucher(owner, voucher('generated'));
  const original = { ...rows.consumption_vouchers.get('generated')! };
  const saved = await createConsumptionVoucherOnce(owner, { ...voucher('generated'), source: 'production_plan', sourceReference: 'sheet' });
  expect(saved.createOnly).toBe(true);
  rows.consumption_vouchers.delete('generated');
  listEmpty = true;
  expect(await syncConsumptionVouchers(owner)).toEqual([]);
  expect((await loadCachedConsumptionVouchers(owner))[0]).toMatchObject({ createOnly: true, syncState: 'synced', deletedAt: expect.any(String) });
  listOverride = [original];
  expect(await syncConsumptionVouchers(owner)).toEqual([]);
  await expect(createConsumptionVoucherOnce(owner, { ...voucher('generated'), source: 'production_plan', sourceReference: 'sheet' })).rejects.toThrow(/deleted|șters/);
  expect(writes).toHaveLength(1);
});

it('retains an existing bulk tombstone across stale lists and explicit save attempts', async () => {
  const saved = await saveBulkBatch(owner, batch('deleted-batch'));
  const original = { ...rows.bulk_batches.get(saved.id)! };
  const tombstone = { ...saved, deletedAt: '2026-11-05T11:00:00Z' };
  const key = 'professional_foodcost.bulk_batches.v1.' + owner;
  disk.set(key, JSON.stringify([tombstone]));
  rows.bulk_batches.delete(saved.id);
  listOverride = [original];
  expect(await syncBulkBatches(owner)).toEqual([]);
  const bytes = disk.get(key);
  await expect(saveBulkBatch(owner, batch(saved.id))).rejects.toThrow(/deleted|șters/);
  expect(disk.get(key)).toBe(bytes);
  expect(writes).toHaveLength(1);
});

it.each(cases)('$table acknowledges a committed lost response without writing identical contents again', async ({ save, sync }) => {
  loseNextWrite = true;
  expect((await save('saved')).syncState).toBe('pending');
  expect((await sync(owner))[0]).toMatchObject({ id: 'saved', syncState: 'synced' });
  expect(writes).toHaveLength(1);
});

it.each(cases)('$table retains pending contents when a newer server edit follows a lost response', async ({ table, save, sync }) => {
  loseNextWrite = true;
  expect((await save('saved')).syncState).toBe('pending');
  rows[table].set('saved', { ...rows[table].get('saved')!, notes: 'New remote edit', updated_at: '2026-11-05T11:00:00.123456+00:00' });
  expect((await sync(owner))[0]).toMatchObject({ notes: 'Saved QA', syncState: 'pending' });
  expect(rows[table].get('saved')?.notes).toBe('New remote edit');
  expect(writes).toHaveLength(1);
});

it.each(cases)('$table updates only its known base revision during offline replay', async ({ table, save, sync }) => {
  await save('saved');
  offline = true;
  const changed = table === 'bulk_batches' ? { ...batch('saved'), notes: 'Offline change' } : { ...voucher('saved'), notes: 'Offline change' };
  const pending = table === 'bulk_batches'
    ? await saveBulkBatch(owner, changed as BulkBatchDraft)
    : await saveConsumptionVoucher(owner, changed as ConsumptionVoucherDraft);
  expect(pending.syncState).toBe('pending');
  offline = false;
  expect((await sync(owner))[0]).toMatchObject({ notes: 'Offline change', syncState: 'synced' });
  expect(writes.map(write => write.method)).toEqual(['POST', 'PATCH']);
});

it.each(cases)('$table does not recreate an existing deleted record or guess an unknown legacy intent', async ({ table, save, sync, cached }) => {
  await save('saved');
  offline = true;
  if (table === 'bulk_batches') await saveBulkBatch(owner, { ...batch('saved'), notes: 'Pending edit' });
  else await saveConsumptionVoucher(owner, { ...voucher('saved'), notes: 'Pending edit' });
  rows[table].delete('saved');
  offline = false;
  expect((await sync(owner))[0]).toMatchObject({ notes: 'Pending edit', syncState: 'pending' });
  const [local] = await cached(owner);
  const legacy = { ...local };
  delete (legacy as typeof local & { baseUpdatedAt?: string | null }).baseUpdatedAt;
  const prefix = table === 'bulk_batches' ? 'bulk_batches' : 'consumption_vouchers';
  disk.set(`professional_foodcost.${prefix}.v1.${owner}`, JSON.stringify([legacy]));
  expect((await sync(owner))[0].syncState).toBe('pending');
  expect(rows[table].size).toBe(0);
  expect(writes).toHaveLength(1);
});

it.each(cases)('$table retains its draft when the base changes between verification and PATCH', async ({ table, save, sync }) => {
  await save('saved');
  offline = true;
  if (table === 'bulk_batches') await saveBulkBatch(owner, { ...batch('saved'), notes: 'Pending change' });
  else await saveConsumptionVoucher(owner, { ...voucher('saved'), notes: 'Pending change' });
  offline = false;
  changeAfterLookup = true;
  expect((await sync(owner))[0]).toMatchObject({ notes: 'Pending change', syncState: 'pending' });
  expect(rows[table].get('saved')?.notes).toBe('Concurrent edit');
});

it.each(cases)('$table inserts a known new offline draft after verified absence', async ({ save, sync }) => {
  offline = true;
  expect((await save('new-offline')).syncState).toBe('pending');
  offline = false;
  expect((await sync(owner))[0]).toMatchObject({ id: 'new-offline', syncState: 'synced' });
  expect(writes).toHaveLength(1);
});

it('replays an explicit edit of an acknowledged generated voucher while retaining its receipt', async () => {
  await saveConsumptionVoucher(owner, voucher('generated'));
  const row = rows.consumption_vouchers.get('generated')!;
  rows.consumption_vouchers.set('generated', { ...row, source: 'production_plan', source_reference: 'sheet' });
  await createConsumptionVoucherOnce(owner, { ...voucher('generated'), source: 'production_plan', sourceReference: 'sheet' });
  offline = true;
  await saveConsumptionVoucher(owner, { ...voucher('generated'), source: 'production_plan', sourceReference: 'sheet', notes: 'Explicit correction' });
  offline = false;
  expect((await syncConsumptionVouchers(owner))[0]).toMatchObject({ notes: 'Explicit correction', createOnly: true, syncState: 'synced' });
  expect(writes.map(write => write.method)).toEqual(['POST', 'PATCH']);
});
