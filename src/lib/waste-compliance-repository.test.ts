import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FoodRedistributionDraft, WastePreventionPlanDraft, WasteReceiverDraft } from '@/types/waste-compliance';

const state = vi.hoisted(() => ({
  storage: new Map<string, string>(),
  rows: {} as Record<string, Record<string, unknown>[]>,
  online: false,
  rejectAcknowledgement: false,
  throwTransport: false,
  blockedTables: new Set<string>(),
  uploads: [] as { table: string; value: Record<string, unknown> }[],
}));

vi.mock('@react-native-async-storage/async-storage', () => ({ default: {
  getItem: async (key: string) => { await Promise.resolve(); return state.storage.get(key) ?? null; },
  setItem: async (key: string, value: string) => {
    await Promise.resolve();
    if (state.rejectAcknowledgement && value.includes('"syncState":"synced"')) throw new Error('Cache acknowledgement failed');
    state.storage.set(key, value);
  },
} }));

function query(table: string) {
  let value: Record<string, unknown> | undefined;
  let operation = 'read';
  let single = false;
  const filters: [string, unknown][] = [];
  const inclusionFilters: [string, readonly unknown[]][] = [];
  const builder = {
    select: () => builder,
    eq: (key: string, expected: unknown) => { filters.push([key, expected]); return builder; },
    in: (key: string, values: readonly unknown[]) => { inclusionFilters.push([key, values]); return builder; },
    setHeader: () => builder,
    single: () => { single = true; return builder; },
    order: () => builder,
    limit: () => builder,
    upsert: (input: Record<string, unknown>) => { value = input; operation = 'upsert'; return builder; },
    insert: (input: Record<string, unknown>) => { value = input; operation = 'insert'; return builder; },
    update: (input: Record<string, unknown>) => { value = input; operation = 'update'; return builder; },
    then: (resolve: (result: { data: Record<string, unknown>[] | Record<string, unknown> | null; error: Error | null }) => unknown, reject?: (reason: unknown) => unknown) => Promise.resolve().then(() => {
      if (state.throwTransport) throw new Error('Connection interrupted');
      if (!state.online || (value && state.blockedTables.has(table))) return { data: null, error: new Error('Offline') };
      if (value) {
        const rows = state.rows[table] ?? [];
        if (operation === 'insert' && rows.some(row => row.id === value!.id)) return { data: null, error: new Error('Duplicate ID') };
        if (operation === 'update' && !rows.some(row => filters.every(([key, expected]) => row[key] === expected))) return { data: null, error: new Error('Revision conflict') };
        state.uploads.push({ table, value });
        state.rows[table] = [{ ...value, updated_at: '2026-11-05T05:00:00.123456+00:00' }, ...(state.rows[table] ?? []).filter((row) => row.id !== value!.id)];
      }
      const selected = (state.rows[table] ?? []).filter((row) => filters.every(([key, expected]) => row[key] === expected)
        && inclusionFilters.every(([key, values]) => values.includes(row[key])));
      return { data: single ? selected[0] ?? null : selected, error: null };
    }).then(resolve, reject),
  };
  return builder;
}

vi.mock('@/lib/supabase', () => ({ isDemoMode: false, isSupabaseConfigured: true, supabase: {
  auth: { getSession: async () => ({ data: { session: { user: { id: 'waste-recovery' }, access_token: 'fixture-token' } }, error: null }) },
  from: (table: string) => query(table),
} }));

import { loadWasteCompliance, saveRedistribution, saveWastePlan, saveWasteReceiver } from './waste-compliance-repository';

const userId = 'waste-recovery';
const key = `manager247.waste-compliance.v1.${userId}`;
const receiver: WasteReceiverDraft = { id: 'receiver', name: 'Food bank', taxId: '', county: '', authorization: '', contact: '', contractReference: '', contractDate: null, notes: '', active: true };
const plan: WastePreventionPlanDraft = { id: 'plan', locationId: null, reportingYear: 2026, companyName: 'Company', companyTaxId: '', companyAddress: '', companyAuthorization: '', companyPhone: '', companyEmail: '', legalRepresentative: '', responsiblePerson: '', measures: [], objectives: '', status: 'draft', submittedAt: null };
const transfer: FoodRedistributionDraft = { id: 'transfer', locationId: null, transferDate: '2026-10-01', destinationType: 'receiver', receiverId: 'receiver', productName: 'Soup', productCategory: '', quantity: 5, unit: 'kg', estimatedValue: 20, productOrigin: 'prepared_food', quantityKg: 5, temperatureC: 4, expiryDate: null, consumerCount: null, documentReference: '', traceabilityReference: '', safetyCheck: 'compliant', correctiveAction: '', handedOverBy: '', receivedBy: '', notes: '' };

beforeEach(() => {
  state.storage.clear(); state.rows = {}; state.online = false; state.rejectAcknowledgement = false;
  state.throwTransport = false; state.blockedTables.clear(); state.uploads = [];
});

describe('waste compliance durable recovery', () => {
  it('replays plans, receivers, and transfers once after reconnecting with their original identities and creation time', async () => {
    const savedPlan = await saveWastePlan(userId, plan);
    const savedReceiver = await saveWasteReceiver(userId, receiver);
    const savedTransfer = await saveRedistribution(userId, transfer);
    expect([savedPlan, savedReceiver, savedTransfer].every((item) => item.syncState === 'pending')).toBe(true);

    state.online = true;
    const loaded = await loadWasteCompliance(userId);
    expect(state.rows.waste_prevention_plans?.map((item) => item.id)).toEqual(['plan']);
    expect(state.rows.waste_receivers?.map((item) => item.id)).toEqual(['receiver']);
    expect(state.rows.food_redistributions?.map((item) => item.id)).toEqual(['transfer']);
    expect(state.rows.food_redistributions[0].created_at).toBe(savedTransfer.createdAt);
    expect(loaded.transfers[0].createdAt).toBe(savedTransfer.createdAt);
    expect([...loaded.plans, ...loaded.receivers, ...loaded.transfers].every((item) => item.syncState === 'synced')).toBe(true);
    await loadWasteCompliance(userId);
    expect(state.uploads).toHaveLength(3);
  });

  it('preserves all entity types when their offline saves overlap', async () => {
    await Promise.all([saveWastePlan(userId, plan), saveWasteReceiver(userId, receiver), saveRedistribution(userId, transfer)]);
    const loaded = await loadWasteCompliance(userId);
    expect(loaded.plans.map((item) => item.id)).toEqual(['plan']);
    expect(loaded.receivers.map((item) => item.id)).toEqual(['receiver']);
    expect(loaded.transfers.map((item) => item.id)).toEqual(['transfer']);
  });

  it('keeps a pending edit when its upload fails and the server has an older copy', async () => {
    await saveWasteReceiver(userId, { ...receiver, name: 'New local name' });
    state.online = true;
    state.blockedTables.add('waste_receivers');
    state.rows.waste_receivers = [{ id: receiver.id, user_id: userId, name: 'Old server name' }];
    const loaded = await loadWasteCompliance(userId);
    expect(loaded.receivers).toHaveLength(1);
    expect(loaded.receivers[0]).toMatchObject({ id: 'receiver', name: 'New local name', syncState: 'pending' });
  });

  it('preserves a transfer creation time when saving the same ID again', async () => {
    await saveRedistribution(userId, transfer);
    const cache = JSON.parse(state.storage.get(key)!);
    cache.transfers[0].createdAt = '2025-04-01T00:00:00.000Z';
    state.storage.set(key, JSON.stringify(cache));
    expect((await saveRedistribution(userId, { ...transfer, quantity: 7 })).createdAt).toBe('2025-04-01T00:00:00.000Z');
  });

  it('acknowledges the same server payload without rewriting after local acknowledgement could not be persisted', async () => {
    await saveWasteReceiver(userId, receiver);
    state.online = true;
    state.rejectAcknowledgement = true;
    await expect(loadWasteCompliance(userId)).rejects.toThrow('Cache acknowledgement failed');
    expect(JSON.parse(state.storage.get(key)!).receivers[0].syncState).toBe('pending');
    expect(state.rows.waste_receivers).toHaveLength(1);
    state.rejectAcknowledgement = false;
    expect((await loadWasteCompliance(userId)).receivers[0].syncState).toBe('synced');
    expect(state.rows.waste_receivers).toHaveLength(1);
    expect(state.uploads.map((item) => item.value.id)).toEqual(['receiver']);
  });

  it('keeps a durable pending save when the transport throws and replays it after recovery', async () => {
    state.throwTransport = true;
    expect((await saveWasteReceiver(userId, receiver)).syncState).toBe('pending');
    expect((await loadWasteCompliance(userId)).receivers[0].syncState).toBe('pending');
    state.throwTransport = false; state.online = true;
    expect((await loadWasteCompliance(userId)).receivers[0].syncState).toBe('synced');
  });

  it.each(['{broken', 'null', '{"plans":[],"receivers":{},"transfers":[]}', '{"plans":[],"receivers":[null],"transfers":[]}'])('rejects corrupted cache without overwriting it: %s', async (raw) => {
    state.storage.set(key, raw);
    state.online = true;
    await expect(saveWasteReceiver(userId, receiver)).rejects.toThrow();
    await expect(loadWasteCompliance(userId)).rejects.toThrow();
    expect(state.storage.get(key)).toBe(raw);
    expect(state.uploads).toEqual([]);
  });

  it('keeps demo data local without uploading it', async () => {
    state.online = true;
    expect((await saveWasteReceiver('demo', receiver)).syncState).toBe('local');
    expect((await loadWasteCompliance('demo')).receivers[0].syncState).toBe('local');
    expect(state.uploads).toEqual([]);
  });
});
