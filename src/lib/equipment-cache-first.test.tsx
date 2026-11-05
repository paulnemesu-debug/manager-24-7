import { createClient, type Session } from '@supabase/supabase-js';
import { createElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  client: null as ReturnType<typeof createClient> | null,
  storage: new Map<string, string>(), owner: 'equipment-owner-a', writes: 0,
  read: null as null | ((key: string, value: string | null) => Promise<string | null>),
}));
vi.mock('@react-native-async-storage/async-storage', () => ({ default: {
  getItem: async (key: string) => state.read ? state.read(key, state.storage.get(key) ?? null) : state.storage.get(key) ?? null,
  setItem: async (key: string, value: string) => { state.writes++; state.storage.set(key, value); },
} }));
vi.mock('@/lib/supabase', () => ({ isDemoMode: false, isSupabaseConfigured: true, get supabase() { return state.client; } }));
vi.mock('@/contexts/auth-context', () => ({ useAuth: () => ({ user: { id: state.owner } }) }));
vi.mock('@/contexts/locale-context', () => ({ useI18n: () => ({ locale: 'en' }) }));
vi.mock('@/contexts/subscription-context', () => ({ useSubscription: () => ({ isViewer: false }) }));
vi.mock('react-native', () => ({ Alert: { alert: vi.fn() }, Switch: 'Switch', Text: 'Text', View: 'View' }));
vi.mock('@/components/tool-header', () => ({ ToolHeader: 'ToolHeader' }));
vi.mock('@/components/inputs', () => ({ Select: 'Select' }));
vi.mock('@/components/ui', () => Object.fromEntries(['AppButton', 'Body', 'Card', 'Field', 'Screen'].map(name => [name, name])));
vi.mock('@/lib/equipment-maintenance-transfer', () => ({}));
vi.mock('@/lib/operations-transfer-files', () => ({}));

import EquipmentScreen from '@/app/tools/equipment-maintenance';
import { emptyAsset, emptyMaintenance, loadEquipmentRegistry, normalizeAsset, readEquipmentRegistrySnapshot, readMaintenanceSnapshot, saveEquipment } from './equipment-maintenance';
import { listHaccpEquipment, readHaccpEquipmentRegistrySnapshot } from './haccp-routine-repository';
import { createOperationalStore } from './operational-sync';

type Row = Record<string, unknown> & { id: string; user_id: string };
type Gate = { table: string; owner: string; release: () => void };
const timestamp = '2026-11-05T07:00:00Z';
let database: Map<string, Row[]>;
let requests: { table: string; method: string; owner: string }[];
let gates: Gate[];
let heldTable: string | null;
let holdRpc: boolean;
let readsAfterRpc: number | null;
let trees: ReactTestRenderer[];
let pending: Promise<unknown>[];
const tick = () => new Promise<void>(resolve => setTimeout(resolve, 0));
const cacheKeys = (owner = state.owner) => ({
  assets: `manager247.asset-profiles.v1.${owner}`,
  haccp: `manager247.haccp-equipment.v1.${owner}`,
  maintenance: `manager247.maintenance-entries.v1.${owner}`,
});
function seed(owner = state.owner, suffix = 'A') {
  const asset = { ...emptyAsset(), id: `asset-${owner}`, name: `Cached oven ${suffix}`, updatedAt: timestamp, syncState: 'synced' as const, serverVersion: 1 };
  const haccp = { id: `fridge-${owner}`, locationId: null, name: `Cached fridge ${suffix}`, kind: 'cold' as const,
    criticalMin: 0, criticalMax: 4, requiredReadings: 1, readingTimes: ['06:00'], active: true, sortOrder: 1,
    updatedAt: timestamp, syncState: 'synced' as const };
  const maintenance = { ...emptyMaintenance(asset.id), id: `task-${owner}`, title: `Cached inspection ${suffix}`,
    responsible: 'QA', dueDate: '2026-11-20', updatedAt: timestamp, syncState: 'synced' as const, serverVersion: 1 };
  const keys = cacheKeys(owner);
  state.storage.set(keys.assets, JSON.stringify([asset]));
  state.storage.set(keys.haccp, JSON.stringify([haccp]));
  state.storage.set(keys.maintenance, JSON.stringify([maintenance]));
  for (const [table, row] of [
    ['asset_profiles', { id: asset.id, user_id: owner, data: asset, version: 1, updated_at: timestamp }],
    ['maintenance_entries', { id: maintenance.id, user_id: owner, data: maintenance, version: 1, updated_at: timestamp }],
    ['haccp_equipment', { id: haccp.id, user_id: owner, name: haccp.name, location_id: null, kind: haccp.kind,
      critical_min: 0, critical_max: 4, required_readings: 1, reading_times: ['06:00'], active: true, sort_order: 1, updated_at: timestamp }],
  ] as [string, Row][]) database.set(table, [...(database.get(table) ?? []).filter(old => old.user_id !== owner), row]);
  return { asset, haccp, maintenance };
}
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  state.storage.clear(); state.owner = 'equipment-owner-a'; state.writes = 0; state.read = null;
  database = new Map(); requests = []; gates = []; heldTable = null; holdRpc = false; readsAfterRpc = null; trees = []; pending = [];
  state.client = createClient('http://127.0.0.1:9876', 'fixture-key', {
    auth: { persistSession: false, autoRefreshToken: false }, db: { retry: false },
    global: { fetch: async (input, init) => {
      const url = new URL(String(input)), table = url.pathname.split('/').at(-1)!, method = init?.method ?? 'GET';
      const owner = url.searchParams.get('user_id')?.slice(3) ?? state.owner;
      requests.push({ table, method, owner });
      if (method === 'POST' && table === 'sync_operational_record') {
        const body = JSON.parse(String(init?.body));
        const row = { id: body.p_id, user_id: owner, data: body.p_data, version: 2, updated_at: body.p_data.updatedAt };
        const respond = () => {
          database.set(body.p_kind, [...(database.get(body.p_kind) ?? []).filter(old => old.id !== row.id), row]);
          return Response.json({ applied: true, record: row });
        };
        if (holdRpc) return new Promise<Response>(resolve => gates.push({ table, owner, release: () => resolve(respond()) }));
        return respond();
      }
      expect(method).toBe('GET');
      expect(['haccp_equipment', 'asset_profiles', 'maintenance_entries']).toContain(table);
      const rows = structuredClone((database.get(table) ?? []).filter(row => row.user_id === owner));
      const holdAfterSave = table === 'asset_profiles' && readsAfterRpc !== null && readsAfterRpc-- <= 0;
      if (table === heldTable || holdAfterSave) return new Promise<Response>(resolve => gates.push({ table, owner, release: () => resolve(Response.json(rows)) }));
      return Response.json(rows);
    } },
  });
  vi.spyOn(state.client.auth, 'getSession').mockImplementation(async () => ({ data: { session: { user: { id: state.owner }, access_token: `token-${state.owner}` } as Session }, error: null }));
  seed();
});
async function releaseAll() {
  heldTable = null; holdRpc = false; readsAfterRpc = null;
  gates.splice(0).forEach(gate => gate.release());
  await tick();
}
afterEach(async () => {
  state.read = null;
  await act(async () => { await releaseAll(); await Promise.all(pending); await tick(); trees.forEach(tree => tree.unmount()); });
  vi.unstubAllGlobals();
});
const nodes = (tree: ReactTestRenderer, type: string) => tree.root.findAll(node => String(node.type) === type);
const shown = (tree: ReactTestRenderer, text: string) => JSON.stringify(tree.toJSON()).includes(text);
const assetShown = (tree: ReactTestRenderer, text: string) => nodes(tree, 'Text').some(node => node.children.includes(text));
const button = (tree: ReactTestRenderer, label: string) => nodes(tree, 'AppButton').find(node => node.props.label === label)!;
const press = async (tree: ReactTestRenderer, label: string) => act(async () => { button(tree, label).props.onPress(); await tick(); });
async function mount() {
  let tree!: ReactTestRenderer;
  await act(async () => { tree = create(createElement(EquipmentScreen)); });
  trees.push(tree);
  await act(async () => { await tick(); });
  return tree;
}
function expectCachedRows(tree: ReactTestRenderer, suffix = 'A') {
  expect(assetShown(tree, `Cached oven ${suffix}`)).toBe(true);
  expect(assetShown(tree, `Cached fridge ${suffix}`)).toBe(true);
  expect(shown(tree, `Cached inspection ${suffix}`)).toBe(true);
}

it.each(['asset_profiles', 'maintenance_entries', 'haccp_equipment'])('renders acknowledged cached rows while %s GET is still pending', async table => {
  heldTable = table;
  const tree = await mount();
  expect(gates).toHaveLength(1);
  expectCachedRows(tree);
  expect(JSON.parse(state.storage.get(cacheKeys().assets)!)[0]).toMatchObject({ name: 'Cached oven A', syncState: 'synced' });
});

it('renders cache while the badge owns the HACCP cloud lock and further badge ticks queue', async () => {
  heldTable = 'haccp_equipment';
  pending.push(listHaccpEquipment(state.owner)); await tick();
  pending.push(listHaccpEquipment(state.owner), listHaccpEquipment(state.owner));
  const tree = await mount();
  expect(gates).toHaveLength(1);
  expect(requests.filter(request => request.table === 'haccp_equipment')).toHaveLength(1);
  expectCachedRows(tree);
});

it('reads validated snapshots without joining the existing cloud-held storage lock', async () => {
  heldTable = 'asset_profiles';
  pending.push(loadEquipmentRegistry(state.owner)); await tick();
  const writes = state.writes, requestCount = requests.length;
  let snapshot: Awaited<ReturnType<typeof readEquipmentRegistrySnapshot>> | undefined;
  const read = readEquipmentRegistrySnapshot(state.owner).then(value => { snapshot = value; }); pending.push(read);
  await tick();
  expect(snapshot?.map(row => row.name).sort()).toEqual(['Cached fridge A', 'Cached oven A']);
  expect(state.writes).toBe(writes); expect(requests).toHaveLength(requestCount);
  const existing = createOperationalStore({ key: id => cacheKeys(id).assets, table: 'asset_profiles', id: row => row.id, normalize: normalizeAsset });
  let oldApiResolved = false;
  pending.push(existing.cached(state.owner).then(() => { oldApiResolved = true; })); await tick();
  expect(oldApiResolved).toBe(false);
});

it.each(['assets', 'haccp', 'maintenance'] as const)('preserves corrupt %s cache and exposes the validation error without cloud writes', async kind => {
  const key = cacheKeys()[kind]; state.storage.set(key, '{broken cached bytes');
  const read = kind === 'maintenance' ? readMaintenanceSnapshot : readEquipmentRegistrySnapshot;
  await expect(read(state.owner)).rejects.toThrow();
  const tree = await mount();
  expect(shown(tree, 'invalid') || shown(tree, 'JSON')).toBe(true);
  expect(state.storage.get(key)).toBe('{broken cached bytes');
  expect(state.writes).toBe(0); expect(requests).toEqual([]);
});

it('does not seed, fetch, write or invent defaults when snapshots have no cache', async () => {
  state.storage.clear();
  await expect(readHaccpEquipmentRegistrySnapshot(state.owner)).resolves.toEqual([]);
  await expect(readEquipmentRegistrySnapshot(state.owner)).resolves.toEqual([]);
  await expect(readMaintenanceSnapshot(state.owner)).resolves.toEqual([]);
  expect(state.storage.size).toBe(0); expect(state.writes).toBe(0); expect(requests).toEqual([]);
});

it('keeps a new owner snapshot when the previous owner cloud read finishes late', async () => {
  heldTable = 'haccp_equipment'; const tree = await mount(); expectCachedRows(tree);
  const oldOwner = state.owner;
  state.owner = 'equipment-owner-b'; seed(state.owner, 'B');
  await act(async () => { tree.update(createElement(EquipmentScreen)); });
  await act(async () => { await tick(); });
  expectCachedRows(tree, 'B'); expect(shown(tree, 'Cached oven A')).toBe(false);
  await act(async () => { gates.filter(gate => gate.owner === oldOwner).forEach(gate => gate.release()); gates = gates.filter(gate => gate.owner !== oldOwner); await tick(); });
  expectCachedRows(tree, 'B'); expect(shown(tree, 'Cached oven A')).toBe(false);
});

it('ignores an older snapshot that finishes after a newer explicit reload', async () => {
  let release!: () => void;
  const pause = new Promise<void>(resolve => { release = resolve; });
  let intercepted = false;
  state.read = async (key, value) => { if (!intercepted && key === cacheKeys().assets) { intercepted = true; await pause; } return value; };
  const tree = await mount();
  seed(state.owner, 'New');
  await press(tree, 'Reload / sync');
  try { expectCachedRows(tree, 'New'); }
  finally { await act(async () => { release(); await tick(); }); }
  expectCachedRows(tree, 'New'); expect(shown(tree, 'Cached oven A')).toBe(false);
});

it('renders the saved durable registry before its subsequent post-save refresh GET finishes', async () => {
  const tree = await mount(); expectCachedRows(tree);
  await press(tree, 'Sheet and history');
  await act(async () => { nodes(tree, 'Field').find(node => node.props.label === 'Name')!.props.onChangeText('Saved oven'); });
  // Let save's own readback complete; hold the next asset GET from screen refresh.
  readsAfterRpc = 1;
  await press(tree, 'Save equipment');
  await act(async () => { await tick(); });
  expect(gates.some(gate => gate.table === 'asset_profiles')).toBe(true);
  expect(assetShown(tree, 'Saved oven')).toBe(true);
  expect(JSON.parse(state.storage.get(cacheKeys().assets)!)[0]).toMatchObject({ name: 'Saved oven', syncState: 'synced', serverVersion: 2 });
});

it('reads a locally committed pending save without treating its unresolved RPC as acknowledged', async () => {
  holdRpc = true;
  const original = JSON.parse(state.storage.get(cacheKeys().assets)!)[0];
  let saved = false;
  pending.push(saveEquipment(state.owner, { ...original, name: 'Pending oven' }).then(() => { saved = true; }));
  await tick();
  expect(gates.some(gate => gate.table === 'sync_operational_record')).toBe(true);
  const rows = await readEquipmentRegistrySnapshot(state.owner);
  expect(rows.find(row => row.id === original.id)).toMatchObject({ name: 'Pending oven', syncState: 'pending', serverVersion: 1 });
  expect(saved).toBe(false);
});
