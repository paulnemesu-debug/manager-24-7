import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as repository from './operations-control-repository';

type Row = Record<string, unknown> & { id: string; user_id: string; updated_at: string };
const owner = 'ops-owner-a';
const other = 'ops-owner-b';
const keyFor = (user: string) => 'manager247.operations-control.v1.' + user;
const tables = ['stock_policies', 'supplier_orders', 'waste_entries', 'inventory_schedules'] as const;
const state = vi.hoisted(() => ({
  disk: new Map<string, string>(), rows: new Map<string, Row[]>(), stale: new Map<string, Row[]>(),
  client: null as SupabaseClient | null, offline: false,
  listMode: 'normal' as 'normal' | 'empty' | 'stale',
  targetMode: 'normal' as 'normal' | 'error',
  ackMode: 'normal' as 'normal' | 'missing' | 'invalid' | 'lost',
  currentOwner: 'ops-owner-a', revision: 0, storageWrites: 0,
  requests: [] as { table: string; method: string; targeted: boolean; authorization: string | null }[],
  switchOnList: false,
  raceOnWrite: null as 'insert' | 'patch' | null,
}));
vi.mock('@react-native-async-storage/async-storage', () => ({ default: {
  getItem: async (key: string) => state.disk.get(key) ?? null,
  setItem: async (key: string, value: string) => { state.storageWrites++; state.disk.set(key, value); },
} }));
vi.mock('@/lib/supabase', () => ({
  isDemoMode: false, isSupabaseConfigured: true,
  get supabase() { return state.client; },
}));

const fetchFixture: typeof fetch = async (input, init) => {
  const url = new URL(String(input));
  const table = url.pathname.split('/').at(-1)!;
  if (!tables.includes(table as typeof tables[number])) throw new Error('Unexpected fixture endpoint');
  const method = init?.method ?? 'GET';
  const targeted = url.searchParams.has('id');
  const authorization = new Headers(init?.headers).get('Authorization');
  state.requests.push({ table, method, targeted, authorization });
  if (state.offline) return Response.json({ message: 'Offline' }, { status: 400 });
  if (method === 'POST' || method === 'PATCH') {
    const payload = JSON.parse(String(init?.body));
    // Match production RLS and server-owned revision timestamps.
    if (authorization !== 'Bearer ' + payload.user_id) return Response.json({ message: 'RLS denied' }, { status: 403 });
    if ((method === 'PATCH' && state.raceOnWrite === 'patch') || (method === 'POST' && state.raceOnWrite === 'insert')) {
      state.rows.set(table, [{ ...payload, storage_zone: 'Concurrent winner', updated_at: '2026-11-05T05:00:00.000099+00:00' }]);
      state.raceOnWrite = null;
    }
    const existing = state.rows.get(table)?.find(row => row.id === payload.id);
    if (method === 'POST' && existing && !new Headers(init?.headers).get('Prefer')?.includes('resolution=merge-duplicates')) {
      return Response.json({ code: '23505', message: 'Duplicate ID' }, { status: 409 });
    }
    if (method === 'PATCH' && (!existing || url.searchParams.get('id') !== 'eq.' + existing.id
      || url.searchParams.get('user_id') !== 'eq.' + existing.user_id || url.searchParams.get('updated_at') !== 'eq.' + existing.updated_at)) {
      return Response.json({ code: 'PGRST116', message: 'No matching revision' }, { status: 406 });
    }
    const row = { ...payload, updated_at: '2026-11-05T05:00:00.' + String(++state.revision).padStart(6, '0') + '+00:00' };
    if (table === 'waste_entries') row.waste_value = row.quantity * row.unit_cost;
    state.rows.set(table, [...(state.rows.get(table) ?? []).filter(item => item.id !== row.id), row]);
    if (state.ackMode === 'lost') return Response.json({ message: 'Accepted write response lost' }, { status: 400 });
    if (!url.searchParams.has('select')) return new Response(null, { status: 201 });
    if (state.ackMode === 'missing') return Response.json({}, { status: 201 });
    if (state.ackMode === 'invalid') return Response.json({ updated_at: 'invalid' }, { status: 201 });
    return Response.json(row, { status: 201 });
  }
  if (targeted && state.targetMode === 'error') return Response.json({ message: 'Lookup failed' }, { status: 503 });
  let rows = (state.rows.get(table) ?? []).filter(row => 'eq.' + row.user_id === url.searchParams.get('user_id') && authorization === 'Bearer ' + row.user_id);
  if (targeted) {
    const filter = url.searchParams.get('id')!;
    const ids = filter.startsWith('in.(') ? filter.slice(4, -1).split(',').map(id => id.replaceAll('"', '')) : [filter.slice(3)];
    rows = rows.filter(row => ids.includes(row.id));
  } else {
    if (state.listMode === 'empty') rows = [];
    if (state.listMode === 'stale') rows = state.stale.get(table) ?? [];
    const limit = Number(url.searchParams.get('limit') ?? Infinity);
    rows = rows.slice(0, limit);
    if (state.switchOnList) state.currentOwner = 'ops-owner-b';
  }
  return Response.json(rows);
};

beforeEach(() => {
  state.disk.clear(); state.rows.clear(); state.stale.clear(); state.requests = [];
  state.listMode = 'normal'; state.targetMode = 'normal'; state.ackMode = 'normal';
  state.currentOwner = owner; state.offline = false; state.revision = 0; state.storageWrites = 0; state.switchOnList = false; state.raceOnWrite = null;
  state.client = createClient('http://127.0.0.1:9876', 'fixture-key', {
    global: { fetch: fetchFixture },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  vi.spyOn(state.client.auth, 'getSession').mockImplementation(async () => ({
    data: { session: { access_token: state.currentOwner, refresh_token: 'fixture-refresh', token_type: 'bearer',
      expires_in: 3600, user: { id: state.currentOwner, app_metadata: {}, user_metadata: {}, aud: 'authenticated', created_at: '2026-11-01T00:00:00Z' } } as Session },
    error: null,
  }));
});
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

async function saveFour() {
  return Promise.all([
    repository.saveStockPolicy(owner, { id: 'policy', catalogId: 'milk', locationId: null, minimumQuantity: 5, targetQuantity: 10, storageZone: 'Fridge' }),
    repository.saveSupplierOrder(owner, { id: 'order', locationId: null, supplier: 'QA', orderDate: '2026-11-05', status: 'draft', lines: [], totalEstimated: 50, notes: 'QA' }),
    repository.saveWasteEntry(owner, { id: 'waste', locationId: null, eventDate: '2026-11-05', catalogId: 'milk', itemName: 'QA Milk', quantity: 1, unit: 'l', unitCost: 8, reason: 'preparation', notes: 'QA' }),
    repository.saveInventorySchedule(owner, { id: 'schedule', locationId: null, frequency: 'weekly', weekday: 1, monthDay: null, enabled: true, nextDueDate: '2026-11-09' }),
  ]);
}
const counts = (data: repository.OperationsControlData) => ({
  policies: data.policies.length, orders: data.orders.length, waste: data.waste.length, schedules: data.schedules.length,
});
const allFour = { policies: 1, orders: 1, waste: 1, schedules: 1 };

describe('operations control acknowledged cache durability', () => {
  const policy = { id: 'policy', catalogId: 'milk', locationId: null, minimumQuantity: 5, targetQuantity: 10, storageZone: 'Initial' };

  it('acknowledges identical accepted payloads without another write after a lost response', async () => {
    state.ackMode = 'lost';
    expect((await repository.saveStockPolicy(owner, policy)).syncState).toBe('pending');
    const accepted = state.rows.get('stock_policies')![0].updated_at;
    state.ackMode = 'normal';
    expect((await repository.loadOperationsControlData(owner)).policies[0]).toMatchObject({ syncState: 'synced', updatedAt: accepted });
    expect(state.requests.filter(request => request.method !== 'GET')).toHaveLength(1);
  });

  it.each([false, true])('conditionally replays an offline edit against its recorded revision (concurrent race: %s)', async race => {
    const first = await repository.saveStockPolicy(owner, policy);
    state.offline = true;
    await repository.saveStockPolicy(owner, { ...policy, storageZone: 'Offline edit' });
    expect(JSON.parse(state.disk.get(keyFor(owner))!).policies[0].baseServerUpdatedAt).toBe(first.updatedAt);
    state.offline = false; state.raceOnWrite = race ? 'patch' : null;
    const loaded = await repository.loadOperationsControlData(owner);
    expect(loaded.policies[0]).toMatchObject({ storageZone: 'Offline edit', syncState: race ? 'pending' : 'synced' });
    expect(state.rows.get('stock_policies')![0].storage_zone).toBe(race ? 'Concurrent winner' : 'Offline edit');
    expect(state.requests.filter(request => request.method === 'PATCH')).toHaveLength(1);
  });

  it('never replaces a concurrent insert at a new queued ID', async () => {
    state.offline = true; await repository.saveStockPolicy(owner, policy);
    state.offline = false; state.raceOnWrite = 'insert';
    expect((await repository.loadOperationsControlData(owner)).policies[0].syncState).toBe('pending');
    expect(state.rows.get('stock_policies')![0].storage_zone).toBe('Concurrent winner');
  });

  it.each(['unknown', 'deleted'] as const)('preserves a %s pending edit until explicit Save', async scenario => {
    await repository.saveStockPolicy(owner, policy);
    state.offline = true; await repository.saveStockPolicy(owner, { ...policy, storageZone: 'Local edit' });
    if (scenario === 'deleted') state.rows.set('stock_policies', []);
    else {
      const cached = JSON.parse(state.disk.get(keyFor(owner))!);
      delete cached.policies[0].baseServerUpdatedAt;
      state.disk.set(keyFor(owner), JSON.stringify(cached));
    }
    state.offline = false;
    const writes = state.requests.filter(request => request.method !== 'GET').length;
    expect((await repository.loadOperationsControlData(owner)).policies[0]).toMatchObject({ storageZone: 'Local edit', syncState: 'pending' });
    expect(state.requests.filter(request => request.method !== 'GET')).toHaveLength(writes);
    expect((await repository.saveStockPolicy(owner, { ...policy, storageZone: 'Explicit retry' })).syncState).toBe('synced');
  });
  it('does not overwrite a newer cloud edit when replaying an accepted write whose acknowledgement was lost', async () => {
    const draft = { id: 'policy', catalogId: 'milk', locationId: null, minimumQuantity: 5, targetQuantity: 10, storageZone: 'Initial' };
    await repository.saveStockPolicy(owner, draft);
    state.ackMode = 'lost';
    expect((await repository.saveStockPolicy(owner, { ...draft, storageZone: 'Pending intent' })).syncState).toBe('pending');
    state.ackMode = 'normal';
    state.rows.get('stock_policies')![0] = { ...state.rows.get('stock_policies')![0], storage_zone: 'Newer cloud edit', updated_at: '2026-11-05T05:00:00.000099+00:00' };
    const loaded = await repository.loadOperationsControlData(owner);
    expect(state.rows.get('stock_policies')![0].storage_zone).toBe('Newer cloud edit');
    expect(loaded.policies[0]).toMatchObject({ storageZone: 'Pending intent', syncState: 'pending' });
    expect(state.requests.filter(request => request.method === 'POST')).toHaveLength(2);
  });
  it('verifies an empty list by owner and ID, retaining all four acknowledged saves across offline reopen', async () => {
    expect((await saveFour()).every(item => item.syncState === 'synced')).toBe(true);
    state.listMode = 'empty';
    const loaded = await repository.loadOperationsControlData(owner);
    expect(counts(loaded)).toEqual(allFour);
    expect(tables.every(table => state.rows.get(table)?.length === 1)).toBe(true);
    expect(state.requests.filter(request => request.targeted)).toHaveLength(4);
    expect(state.requests.filter(request => request.method === 'POST')).toHaveLength(4);
    state.offline = true;
    expect(counts(await repository.loadOperationsControlData(owner))).toEqual(allFour);
    expect(counts(JSON.parse(state.disk.get(keyFor(owner))!))).toEqual(allFour);
  });

  it('preserves queued work acknowledged by flush before an empty readback', async () => {
    state.offline = true;
    expect((await saveFour()).every(item => item.syncState === 'pending')).toBe(true);
    state.offline = false; state.listMode = 'empty';
    const loaded = await repository.loadOperationsControlData(owner);
    expect(counts(loaded)).toEqual(allFour);
    expect(Object.values(loaded).flat().every(item => item.syncState === 'synced')).toBe(true);
  });

  it('uses server microseconds despite a fast device clock and accepts a later cloud edit', async () => {
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2099-01-01T00:00:00Z'));
    const saved = await repository.saveStockPolicy(owner, { id: 'policy', catalogId: 'milk', locationId: null, minimumQuantity: 5, targetQuantity: 10, storageZone: 'Fridge' });
    expect(saved.updatedAt).toBe('2026-11-05T05:00:00.000001+00:00');
    state.stale.set('stock_policies', [{ ...state.rows.get('stock_policies')![0], storage_zone: 'Old', updated_at: '2026-11-05T05:00:00.000000+00:00' }]);
    state.listMode = 'stale';
    expect((await repository.loadOperationsControlData(owner)).policies[0].storageZone).toBe('Fridge');
    state.rows.get('stock_policies')![0] = { ...state.rows.get('stock_policies')![0], storage_zone: 'Cloud edit', updated_at: '2026-11-05T05:00:00.000002+00:00' };
    state.listMode = 'normal';
    expect((await repository.loadOperationsControlData(owner)).policies[0].storageZone).toBe('Cloud edit');
  });

  it('keeps acknowledged data when targeted verification fails without scheduling resurrection', async () => {
    await saveFour(); state.listMode = 'empty'; state.targetMode = 'error';
    expect(counts(await repository.loadOperationsControlData(owner))).toEqual(allFour);
    expect(counts(await repository.loadOperationsControlData(owner))).toEqual(allFour);
    expect(state.requests.filter(request => request.method === 'POST')).toHaveLength(4);
  });

  it('removes a record only after a successful owner-scoped targeted absence and never reuploads it', async () => {
    await saveFour(); state.rows.set('stock_policies', []); state.listMode = 'empty';
    expect(counts(await repository.loadOperationsControlData(owner))).toEqual({ ...allFour, policies: 0 });
    state.offline = true;
    expect(counts(await repository.loadOperationsControlData(owner))).toEqual({ ...allFour, policies: 0 });
    expect(state.requests.filter(request => request.method === 'POST')).toHaveLength(4);
  });

  it('does not discard older acknowledged orders beyond the latest 100 response', async () => {
    await saveFour();
    const old = state.rows.get('supplier_orders')![0];
    state.rows.set('supplier_orders', [...Array.from({ length: 100 }, (_, index) => ({ ...old, id: 'new-' + index })), old]);
    const loaded = await repository.loadOperationsControlData(owner);
    expect(loaded.orders).toHaveLength(101);
    expect(loaded.orders.some(item => item.id === 'order')).toBe(true);
  });

  it.each(['missing', 'invalid'] as const)('keeps intent pending when the save representation is %s', async mode => {
    state.ackMode = mode;
    const saved = await repository.saveStockPolicy(owner, { id: 'policy', catalogId: 'milk', locationId: null, minimumQuantity: 5, targetQuantity: 10, storageZone: 'Fridge' });
    expect(saved.syncState).toBe('pending');
    expect(JSON.parse(state.disk.get(keyFor(owner))!).policies[0].syncState).toBe('pending');
    expect(state.rows.get('stock_policies')).toHaveLength(1);
  });

  it('pins owner reads across an account switch and never interprets another session empty RLS as deletion', async () => {
    await saveFour(); state.listMode = 'empty'; state.switchOnList = true;
    expect(counts(await repository.loadOperationsControlData(owner))).toEqual(allFour);
    expect(state.requests.every(request => request.authorization === 'Bearer ' + owner)).toBe(true);
    const requestCount = state.requests.length;
    expect(counts(await repository.loadOperationsControlData(owner))).toEqual(allFour);
    expect(state.requests).toHaveLength(requestCount);
    expect(await repository.loadOperationsControlData(other)).toEqual({ policies: [], orders: [], waste: [], schedules: [] });
  });

  it.each(['{corrupt', '{"policies":[]}', '{"policies":[null],"orders":[],"waste":[],"schedules":[]}'])('preserves corrupt cache %s and refuses a destructive save', async raw => {
    state.disk.set(keyFor(owner), raw);
    await expect(repository.saveStockPolicy(owner, { id: 'policy', catalogId: 'milk', locationId: null, minimumQuantity: 5, targetQuantity: 10, storageZone: 'Fridge' })).rejects.toThrow();
    expect(state.disk.get(keyFor(owner))).toBe(raw);
    expect(state.storageWrites).toBe(0);
    expect(state.requests).toHaveLength(0);
  });
});
