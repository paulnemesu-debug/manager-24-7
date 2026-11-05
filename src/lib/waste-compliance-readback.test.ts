import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadWasteCompliance, saveWastePlan, saveWasteReceiver, saveRedistribution } from './waste-compliance-repository';
import type { WasteComplianceData, WastePreventionPlanDraft, WasteReceiverDraft, FoodRedistributionDraft } from '@/types/waste-compliance';
type Row = Record<string, unknown> & { id: string; user_id: string; updated_at: string };
const owner = 'waste-readback-owner';
const key = 'manager247.waste-compliance.v1.' + owner;
const state = vi.hoisted(() => ({
  disk: new Map<string, string>(), rows: new Map<string, Row[]>(), stale: new Map<string, Row[]>(), client: null as SupabaseClient | null,
  offline: false, listMode: 'normal' as 'normal' | 'empty' | 'stale', targetError: false, ackMissing: false, ackLost: false, currentOwner: 'waste-readback-owner',
  revision: 0, requests: [] as { method: string; table: string; targeted: boolean; authorization: string | null }[], switchOnList: false,
  raceOnWrite: null as 'insert' | 'patch' | null,
}));
vi.mock('@react-native-async-storage/async-storage', () => ({ default: {
  getItem: async (key: string) => state.disk.get(key) ?? null,
  setItem: async (key: string, value: string) => { state.disk.set(key, value); },
} }));
vi.mock('@/lib/supabase', () => ({ isDemoMode: false, isSupabaseConfigured: true, get supabase() { return state.client; } }));
const receiver: WasteReceiverDraft = { id: 'receiver', name: 'Food bank', taxId: '', county: '', authorization: '', contact: '', contractReference: '', contractDate: null, notes: '', active: true };
const plan: WastePreventionPlanDraft = { id: 'plan', locationId: null, reportingYear: 2026, companyName: 'QA', companyTaxId: '', companyAddress: '', companyAuthorization: '', companyPhone: '', companyEmail: '', legalRepresentative: '', responsiblePerson: '', measures: [], objectives: '', status: 'draft', submittedAt: null };
const transfer: FoodRedistributionDraft = { id: 'transfer', locationId: null, transferDate: '2026-11-05', destinationType: 'receiver', receiverId: 'receiver', productName: 'Soup', productCategory: '', quantity: 5, unit: 'kg', estimatedValue: 20, productOrigin: 'prepared_food', quantityKg: 5, temperatureC: 4, expiryDate: null, consumerCount: null, documentReference: '', traceabilityReference: '', safetyCheck: 'compliant', correctiveAction: '', handedOverBy: '', receivedBy: '', notes: '' };
const fetchFixture: typeof fetch = async (input, init) => {
  const url = new URL(String(input)), table = url.pathname.split('/').at(-1)!;
  if (!['waste_prevention_plans', 'waste_receivers', 'food_redistributions'].includes(table)) throw new Error('Unexpected fixture endpoint');
  const method = init?.method ?? 'GET', targeted = url.searchParams.has('id');
  const authorization = new Headers(init?.headers).get('Authorization');
  state.requests.push({ method, table, targeted, authorization });
  if (state.offline || (targeted && state.targetError)) return Response.json({ message: 'Injected read/write unavailable' }, { status: 400 });
  if (method === 'POST' || method === 'PATCH') {
    const payload = JSON.parse(String(init?.body));
    if (authorization !== 'Bearer ' + payload.user_id) return Response.json({ message: 'RLS denied' }, { status: 403 });
    if ((method === 'PATCH' && state.raceOnWrite === 'patch') || (method === 'POST' && state.raceOnWrite === 'insert')) {
      state.rows.set(table, [{ ...payload, name: 'Concurrent winner', updated_at: '2026-11-05T05:00:00.000099+00:00' }]);
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
    state.rows.set(table, [...(state.rows.get(table) ?? []).filter(item => item.id !== row.id), row]);
    if (state.ackLost) return Response.json({ message: 'Accepted write response lost' }, { status: 400 });
    if (!url.searchParams.has('select')) return new Response(null, { status: 201 });
    return Response.json(state.ackMissing ? {} : row, { status: 201 });
  }
  let rows = (state.rows.get(table) ?? []).filter(row => 'eq.' + row.user_id === url.searchParams.get('user_id') && authorization === 'Bearer ' + row.user_id);
  if (targeted) {
    const filter = url.searchParams.get('id')!;
    const ids = filter.startsWith('in.(') ? filter.slice(4, -1).split(',').map(id => id.replaceAll('"', '')) : [filter.slice(3)];
    rows = rows.filter(row => ids.includes(row.id));
  } else {
    if (state.listMode === 'empty') rows = [];
    if (state.listMode === 'stale') rows = state.stale.get(table) ?? [];
    rows = rows.slice(0, Number(url.searchParams.get('limit') ?? Infinity));
    if (state.switchOnList) state.currentOwner = 'other-owner';
  }
  return Response.json(rows);
};
beforeEach(() => {
  state.disk.clear(); state.rows.clear(); state.stale.clear(); state.requests = []; state.offline = false;
  state.listMode = 'normal'; state.targetError = false; state.ackMissing = false; state.ackLost = false; state.currentOwner = owner; state.revision = 0; state.switchOnList = false; state.raceOnWrite = null;
  state.client = createClient('http://127.0.0.1:9876', 'fixture-key', { global: { fetch: fetchFixture }, auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  vi.spyOn(state.client.auth, 'getSession').mockImplementation(async () => ({ data: { session: { user: { id: state.currentOwner }, access_token: state.currentOwner } as Session }, error: null }));
});
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });
const saveThree = () => Promise.all([saveWastePlan(owner, plan), saveWasteReceiver(owner, receiver), saveRedistribution(owner, transfer)]);
const counts = (data: WasteComplianceData) => ({ plans: data.plans.length, receivers: data.receivers.length, transfers: data.transfers.length });
const three = { plans: 1, receivers: 1, transfers: 1 };
describe('waste compliance acknowledged readback', () => {
  it('acknowledges identical accepted payloads without another write after a lost response', async () => {
    state.ackLost = true;
    expect((await saveWasteReceiver(owner, receiver)).syncState).toBe('pending');
    const accepted = state.rows.get('waste_receivers')![0].updated_at;
    state.ackLost = false;
    expect((await loadWasteCompliance(owner)).receivers[0]).toMatchObject({ syncState: 'synced', updatedAt: accepted });
    expect(state.requests.filter(request => request.method !== 'GET')).toHaveLength(1);
  });

  it.each([false, true])('conditionally replays an offline edit against its recorded revision (concurrent race: %s)', async race => {
    const first = await saveWasteReceiver(owner, receiver);
    state.offline = true; await saveWasteReceiver(owner, { ...receiver, name: 'Offline edit' });
    expect(JSON.parse(state.disk.get(key)!).receivers[0].baseServerUpdatedAt).toBe(first.updatedAt);
    state.offline = false; state.raceOnWrite = race ? 'patch' : null;
    const loaded = await loadWasteCompliance(owner);
    expect(loaded.receivers[0]).toMatchObject({ name: 'Offline edit', syncState: race ? 'pending' : 'synced' });
    expect(state.rows.get('waste_receivers')![0].name).toBe(race ? 'Concurrent winner' : 'Offline edit');
    expect(state.requests.filter(request => request.method === 'PATCH')).toHaveLength(1);
  });

  it('never replaces a concurrent insert at a new queued ID', async () => {
    state.offline = true; await saveWasteReceiver(owner, receiver);
    state.offline = false; state.raceOnWrite = 'insert';
    expect((await loadWasteCompliance(owner)).receivers[0].syncState).toBe('pending');
    expect(state.rows.get('waste_receivers')![0].name).toBe('Concurrent winner');
  });

  it.each(['unknown', 'deleted'] as const)('preserves a %s pending edit until explicit Save', async scenario => {
    await saveWasteReceiver(owner, receiver);
    state.offline = true; await saveWasteReceiver(owner, { ...receiver, name: 'Local edit' });
    if (scenario === 'deleted') state.rows.set('waste_receivers', []);
    else {
      const cached = JSON.parse(state.disk.get(key)!); delete cached.receivers[0].baseServerUpdatedAt;
      state.disk.set(key, JSON.stringify(cached));
    }
    state.offline = false;
    const writes = state.requests.filter(request => request.method !== 'GET').length;
    expect((await loadWasteCompliance(owner)).receivers[0]).toMatchObject({ name: 'Local edit', syncState: 'pending' });
    expect(state.requests.filter(request => request.method !== 'GET')).toHaveLength(writes);
    expect((await saveWasteReceiver(owner, { ...receiver, name: 'Explicit retry' })).syncState).toBe('synced');
  });
  it('does not overwrite a newer cloud edit when replaying an accepted write whose acknowledgement was lost', async () => {
    await saveWasteReceiver(owner, receiver);
    state.ackLost = true;
    expect((await saveWasteReceiver(owner, { ...receiver, name: 'Pending intent' })).syncState).toBe('pending');
    state.ackLost = false;
    state.rows.get('waste_receivers')![0] = { ...state.rows.get('waste_receivers')![0], name: 'Newer cloud edit', updated_at: '2026-11-05T05:00:00.000099+00:00' };
    const loaded = await loadWasteCompliance(owner);
    expect(state.rows.get('waste_receivers')![0].name).toBe('Newer cloud edit');
    expect(loaded.receivers[0]).toMatchObject({ name: 'Pending intent', syncState: 'pending' });
    expect(state.requests.filter(request => request.method === 'POST')).toHaveLength(2);
  });
  it('retains all acknowledged entities omitted by list responses and keeps them after offline reopening', async () => {
    expect((await saveThree()).every(item => item.syncState === 'synced')).toBe(true);
    state.listMode = 'empty';
    expect(counts(await loadWasteCompliance(owner))).toEqual(three);
    expect(state.requests.filter(request => request.targeted)).toHaveLength(3);
    state.offline = true;
    expect(counts(await loadWasteCompliance(owner))).toEqual(three);
    expect(counts(JSON.parse(state.disk.get(key)!))).toEqual(three);
    expect(state.requests.filter(request => request.method === 'POST')).toHaveLength(3);
  });
  it('retains rows just acknowledged during replay before an empty readback', async () => {
    state.offline = true;
    expect((await saveThree()).every(item => item.syncState === 'pending')).toBe(true);
    state.offline = false; state.listMode = 'empty';
    const loaded = await loadWasteCompliance(owner);
    expect(counts(loaded)).toEqual(three);
    expect(Object.values(loaded).flat().every(item => item.syncState === 'synced')).toBe(true);
  });
  it('uses canonical server microseconds and never downgrades a confirmed edit to a stale response', async () => {
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2099-01-01T00:00:00Z'));
    const saved = await saveWasteReceiver(owner, receiver);
    expect(saved.updatedAt).toBe('2026-11-05T05:00:00.000001+00:00');
    state.stale.set('waste_receivers', [{ ...state.rows.get('waste_receivers')![0], name: 'Old', updated_at: '2026-11-05T05:00:00.000000+00:00' }]);
    state.listMode = 'stale';
    expect((await loadWasteCompliance(owner)).receivers[0].name).toBe('Food bank');
    state.rows.get('waste_receivers')![0] = { ...state.rows.get('waste_receivers')![0], name: 'New cloud', updated_at: '2026-11-05T05:00:00.000002+00:00' };
    state.listMode = 'normal';
    expect((await loadWasteCompliance(owner)).receivers[0].name).toBe('New cloud');
  });
  it('preserves records if targeted lookup fails without replaying acknowledged data', async () => {
    await saveThree(); state.listMode = 'empty'; state.targetError = true;
    expect(counts(await loadWasteCompliance(owner))).toEqual(three);
    expect(counts(await loadWasteCompliance(owner))).toEqual(three);
    expect(state.requests.filter(request => request.method === 'POST')).toHaveLength(3);
  });
  it('respects a successful targeted absence without resurrecting a deleted transfer', async () => {
    await saveThree(); state.rows.set('food_redistributions', []); state.listMode = 'empty';
    expect(counts(await loadWasteCompliance(owner))).toEqual({ ...three, transfers: 0 });
    state.offline = true;
    expect(counts(await loadWasteCompliance(owner))).toEqual({ ...three, transfers: 0 });
    expect(state.requests.filter(request => request.method === 'POST')).toHaveLength(3);
  });
  it('retains older acknowledged transfers outside the newest 500 response', async () => {
    await saveThree();
    const old = state.rows.get('food_redistributions')![0];
    state.rows.set('food_redistributions', [...Array.from({ length: 500 }, (_, index) => ({ ...old, id: 'new-' + index })), old]);
    const loaded = await loadWasteCompliance(owner);
    expect(loaded.transfers).toHaveLength(501);
    expect(loaded.transfers.some(item => item.id === 'transfer')).toBe(true);
  });
  it('keeps a confirmed write pending until its server timestamp is acknowledged', async () => {
    state.ackMissing = true;
    expect((await saveWasteReceiver(owner, receiver)).syncState).toBe('pending');
    expect(JSON.parse(state.disk.get(key)!).receivers[0].syncState).toBe('pending');
    expect(state.rows.get('waste_receivers')).toHaveLength(1);
  });
  it('pins all reads to their initiating owner and refuses a mismatched session', async () => {
    await saveThree(); state.listMode = 'empty'; state.switchOnList = true;
    expect(counts(await loadWasteCompliance(owner))).toEqual(three);
    expect(state.requests.every(request => request.authorization === 'Bearer ' + owner)).toBe(true);
    const before = state.requests.length;
    expect(counts(await loadWasteCompliance(owner))).toEqual(three);
    expect(state.requests).toHaveLength(before);
    expect(await loadWasteCompliance('other-owner')).toEqual({ plans: [], receivers: [], transfers: [] });
  });
});
