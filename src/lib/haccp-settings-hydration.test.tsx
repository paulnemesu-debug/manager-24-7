import { createClient } from '@supabase/supabase-js';
import { createElement, useEffect } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { HaccpEquipment, HaccpRoutineProfile } from '@/types/haccp-routine';

const state = vi.hoisted(() => ({ owner: 'settings-owner-a', focused: true, locale: 'en',
  client: null as ReturnType<typeof createClient> | null, storage: new Map<string, string>(), alert: vi.fn(),
  failEquipmentReadback: false, failedStorageKey: null as string | null,
  saveDocument: vi.fn(async () => ({ synced: true })), notification: vi.fn(async () => undefined) }));
vi.mock('@react-native-async-storage/async-storage', () => ({ default: {
  getItem: async (key: string) => { if (key === state.failedStorageKey) throw new Error('Synthetic local readback failure'); return state.storage.get(key) ?? null; },
  setItem: async (key: string, value: string) => { state.storage.set(key, value); },
} }));
vi.mock('@/lib/supabase', () => ({ isDemoMode: false, isSupabaseConfigured: true, get supabase() { return state.client; } }));
vi.mock('@/contexts/auth-context', () => ({ useAuth: () => ({ user: { id: state.owner, email: `${state.owner}@example.invalid` } }) }));
vi.mock('@/contexts/locale-context', () => ({ useI18n: () => ({ locale: state.locale }) }));
vi.mock('expo-router', () => ({ useRouter: () => ({ push: vi.fn() }),
  useFocusEffect: (callback: () => void | (() => void)) => {
    const focused = state.focused;
    useEffect(() => focused ? callback() : undefined, [callback, focused]);
  } }));
vi.mock('react-native', () => ({ Platform: { select: (values: { default: unknown }) => values.default },
  Alert: { alert: state.alert }, StyleSheet: { create: (styles: object) => styles }, View: 'View', Text: 'Text' }));
vi.mock('@expo/vector-icons', () => ({ Ionicons: 'Icon' }));
vi.mock('expo-haptics', () => ({ notificationAsync: state.notification, NotificationFeedbackType: { Success: 'success', Warning: 'warning' } }));
vi.mock('@/components/tool-header', () => ({ ToolHeader: 'ToolHeader' }));
vi.mock('@/components/haccp-time-input', () => ({ HaccpTimeInput: 'HaccpTimeInput' }));
vi.mock('@/components/haccp-temperature-input', () => ({ HaccpTemperatureInput: 'HaccpTemperatureInput' }));
vi.mock('@/components/inputs', () => ({ ChoiceRow: 'ChoiceRow', Select: 'Select' }));
vi.mock('@/components/ui', () => Object.fromEntries(['AppButton', 'Body', 'Card', 'Field', 'IconButton', 'Screen', 'SectionHeader', 'StatusPill'].map(name => [name, name])));

import Settings from '@/app/tools/haccp-settings';
import { HaccpToday } from '@/components/haccp-today';
import * as routine from './haccp-routine-repository';

type Row = Record<string, unknown>;
const stamp = '2026-11-05T10:00:00Z';
const profileKey = (owner = state.owner) => `manager247.haccp-routine-profile.v1.${owner}`;
const equipmentKey = (owner = state.owner) => `manager247.haccp-equipment.v1.${owner}`;
const tick = () => new Promise<void>(resolve => setTimeout(resolve, 0));
let profiles: Map<string, Row>, equipment: Map<string, Row[]>;
let held: Set<string>, failed: Set<string>, gates: { key: string; release: () => void }[], trees: ReactTestRenderer[];
let requests: { owner: string; table: string; method: string }[];
function profile(owner = state.owner): HaccpRoutineProfile {
  return { defaultLocationId: `location-${owner}`, defaultLocationName: `Kitchen ${owner}`, responsibleName: 'Operator QA',
    shiftStartTime: '08:00', updatedAt: stamp, syncState: 'synced' };
}
function seed(owner = state.owner) {
  const p = profile(owner);
  const item: HaccpEquipment = { id: `${owner}-fridge`, locationId: p.defaultLocationId, name: `Fridge ${owner}`, kind: 'cold',
    criticalMin: 0, criticalMax: 4, requiredReadings: 3, readingTimes: ['06:00', '12:00', '18:00'], active: true, sortOrder: 1, updatedAt: stamp, syncState: 'synced' };
  profiles.set(owner, { user_id: owner, default_location_id: p.defaultLocationId, default_location_name: p.defaultLocationName,
    responsible_name: p.responsibleName, shift_start_time: p.shiftStartTime, updated_at: stamp });
  equipment.set(owner, [{ id: item.id, user_id: owner, location_id: item.locationId, name: item.name, kind: item.kind,
    critical_min: 0, critical_max: 4, required_readings: 3, reading_times: item.readingTimes, active: true, sort_order: 1, updated_at: stamp }]);
  state.storage.set(profileKey(owner), JSON.stringify(p)); state.storage.set(equipmentKey(owner), JSON.stringify([item]));
}
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  state.owner = 'settings-owner-a'; state.focused = true; state.locale = 'en'; state.storage.clear(); state.alert.mockClear();
  state.failEquipmentReadback = false; state.failedStorageKey = null;
  state.saveDocument.mockClear(); state.notification.mockClear();
  profiles = new Map(); equipment = new Map(); held = new Set(); failed = new Set(); gates = []; trees = []; requests = []; seed();
  state.client = createClient('http://127.0.0.1:9876', 'synthetic-key-no-network', {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, db: { retry: false },
    global: { fetch: async (input, init) => {
      const url = new URL(String(input)); expect(url.origin).toBe('http://127.0.0.1:9876');
      const table = url.pathname.split('/').at(-1)!, method = init?.method ?? 'GET';
      const payload = method === 'POST' ? JSON.parse(String(init?.body)) as Row : null;
      const owner = url.searchParams.get('user_id')?.slice(3) ?? String(payload?.user_id ?? state.owner);
      requests.push({ owner, table, method }); const key = `${owner}:${table}:${method}`;
      if (failed.has(key)) throw new TypeError('Synthetic offline');
      let value: unknown;
      if (method === 'GET') value = table === 'haccp_routine_profiles' ? profiles.get(owner) ?? null
        : table === 'haccp_equipment' ? equipment.get(owner) ?? []
          : [{ id: profile(owner).defaultLocationId, name: profile(owner).defaultLocationName, active: true, address: '' }];
      const snapshot = structuredClone(value);
      const respond = () => {
        if (method === 'GET') return Response.json(snapshot);
        expect(method).toBe('POST');
        if (table === 'haccp_routine_profiles') profiles.set(owner, structuredClone(payload!));
        else {
          expect(table).toBe('haccp_equipment'); equipment.set(owner, [...(equipment.get(owner) ?? []).filter(row => row.id !== payload!.id), structuredClone(payload!)]);
          if (state.failEquipmentReadback) state.failedStorageKey = equipmentKey(owner);
        }
        return new Response(null, { status: 201 });
      };
      return held.has(key) ? new Promise<Response>(resolve => gates.push({ key, release: () => resolve(respond()) })) : respond();
    } },
  });
});
async function release(key?: string) {
  if (key) held.delete(key); else held.clear();
  const selected = gates.filter(gate => !key || gate.key === key); gates = gates.filter(gate => !selected.includes(gate));
  selected.forEach(gate => gate.release()); await tick(); await tick();
}
afterEach(async () => { await act(async () => { failed.clear(); await release(); trees.forEach(tree => tree.unmount()); await tick(); }); vi.unstubAllGlobals(); });
const nodes = (tree: ReactTestRenderer, type: string) => tree.root.findAll(node => String(node.type) === type);
const button = (tree: ReactTestRenderer, label: string) => nodes(tree, 'AppButton').find(node => node.props.label === label)!;
const field = (tree: ReactTestRenderer, label: string) => nodes(tree, 'Field').find(node => node.props.label === label)!;
const text = (tree: ReactTestRenderer) => JSON.stringify(tree.toJSON());
const register = (tree: ReactTestRenderer) => nodes(tree, 'IconButton').filter(node => node.props.label === 'Edit').length;
const settingsElement = () => createElement(Settings);
const todayElement = () => createElement(HaccpToday, { userId: state.owner, identity: `${state.owner}@example.invalid`, locale: 'en', documents: [], save: state.saveDocument as never });
async function mount(today = false) { let tree!: ReactTestRenderer; await act(async () => { tree = create(today ? todayElement() : settingsElement()); }); trees.push(tree); await act(async () => { await tick(); await tick(); }); return tree; }
async function render(tree: ReactTestRenderer, today = false) { await act(async () => { tree.update(today ? todayElement() : settingsElement()); await tick(); await tick(); }); }
async function press(tree: ReactTestRenderer, label: string) { await act(async () => { const b = button(tree, label); expect(b).toBeDefined(); expect(b.props.disabled).not.toBe(true); b.props.onPress(); await tick(); await tick(); }); }

it('uses verified cached profile before a delayed locations list, so early header save preserves acknowledged scope', async () => {
  held.add(`${state.owner}:business_locations:GET`); const tree = await mount();
  expect(field(tree, 'Name printed on records').props.value).toBe(profile().defaultLocationName);
  await press(tree, 'Save header');
  expect(profiles.get(state.owner)).toMatchObject({ default_location_id: profile().defaultLocationId, responsible_name: 'Operator QA', shift_start_time: '08:00' });
});
it('does not hide a just-saved equipment or retarget its draft when older list results finish', async () => {
  const key = `${state.owner}:business_locations:GET`; held.add(key); const tree = await mount();
  await act(async () => field(tree, 'Name').props.onChangeText('New fridge'));
  await press(tree, 'Save equipment'); expect(register(tree)).toBe(2);
  await act(async () => release(key)); expect(register(tree)).toBe(2);
  expect(equipment.get(state.owner)?.find(row => row.name === 'New fridge')?.location_id).toBe(profile().defaultLocationId);
});
it('keeps preexisting remote equipment when a new save waits behind an uncached registry load', async () => {
  state.storage.delete(equipmentKey()); const key = `${state.owner}:haccp_equipment:GET`; held.add(key);
  const tree = await mount(); expect(register(tree)).toBe(0);
  await act(async () => field(tree, 'Name').props.onChangeText('Fast new fridge'));
  await press(tree, 'Save equipment');
  await act(async () => { await release(key); await tick(); await tick(); });
  expect(equipment.get(state.owner)).toHaveLength(2);
  expect(register(tree)).toBe(2);
});
it('retains the acknowledged equipment ID after failed local readback so retry cannot duplicate it', async () => {
  const tree = await mount(); await act(async () => field(tree, 'Name').props.onChangeText('Readback fridge'));
  state.failEquipmentReadback = true; await press(tree, 'Save equipment');
  expect(equipment.get(state.owner)).toHaveLength(2);
  expect(state.alert).toHaveBeenCalledWith('Equipment saved; the list could not be reloaded', 'Synthetic local readback failure');
  state.failEquipmentReadback = false; state.failedStorageKey = null;
  await press(tree, 'Save equipment'); expect(equipment.get(state.owner)).toHaveLength(2); expect(register(tree)).toBe(2);
});
it('blocks early header/equipment saves with no verified profile, including stale handler dispatch', async () => {
  state.storage.delete(profileKey()); held.add(`${state.owner}:haccp_routine_profiles:GET`); const tree = await mount();
  expect(button(tree, 'Save header').props.disabled).toBe(true);
  await act(async () => { field(tree, 'Name').props.onChangeText('No scope yet'); button(tree, 'Save header').props.onPress(); });
  await act(async () => button(tree, 'Save equipment').props.onPress());
  expect(requests.filter(request => request.method === 'POST')).toHaveLength(0);
});
it('shows a handled profile error and retry rather than a saveable invented default', async () => {
  state.storage.delete(profileKey()); const key = `${state.owner}:haccp_routine_profiles:GET`; failed.add(key); const tree = await mount();
  expect(button(tree, 'Save header').props.disabled).toBe(true); expect(text(tree)).toContain('could not be loaded');
  failed.delete(key); await press(tree, 'Retry loading settings');
  expect(field(tree, 'Name printed on records').props.value).toBe(profile().defaultLocationName);
});
it('preserves corrupt profile bytes, disables unsafe saves and reports the load error', async () => {
  state.storage.set(profileKey(), '{broken'); const tree = await mount();
  expect(button(tree, 'Save header').props.disabled).toBe(true); expect(text(tree)).toContain('could not be loaded');
  expect(state.storage.get(profileKey())).toBe('{broken');
});
it('keeps same-owner unsaved profile and equipment edits across focus refresh', async () => {
  const tree = await mount();
  await act(async () => { field(tree, 'Default responsible person').props.onChangeText('Unsaved operator'); field(tree, 'Name').props.onChangeText('Unsaved fridge'); });
  state.focused = false; await render(tree); state.focused = true; await render(tree);
  expect(field(tree, 'Default responsible person').props.value).toBe('Unsaved operator'); expect(field(tree, 'Name').props.value).toBe('Unsaved fridge');
});
it('does not overwrite dirty header or equipment fields when the original cloud profile finishes', async () => {
  const key = `${state.owner}:haccp_routine_profiles:GET`; held.add(key); const tree = await mount();
  await act(async () => { field(tree, 'Default responsible person').props.onChangeText('New unsaved operator'); field(tree, 'Name').props.onChangeText('Draft fridge'); });
  await act(async () => release(key));
  expect(field(tree, 'Default responsible person').props.value).toBe('New unsaved operator');
  expect(field(tree, 'Name').props.value).toBe('Draft fridge');
});
it('does not replace corrupt equipment cache and prevents equipment mutations', async () => {
  state.storage.set(equipmentKey(), '{broken'); const tree = await mount();
  expect(button(tree, 'Save equipment').props.disabled).toBe(true);
  expect(state.storage.get(equipmentKey())).toBe('{broken'); expect(text(tree)).toContain('could not be loaded');
});
it('ignores late owner-A loads after owner-B becomes active', async () => {
  const key = `${state.owner}:business_locations:GET`; held.add(key); const tree = await mount();
  state.owner = 'settings-owner-b'; seed(); await render(tree); await act(async () => release(key));
  expect(field(tree, 'Name printed on records').props.value).toBe(profile().defaultLocationName);
});
it('suppresses old owner save acknowledgements and alerts after account change', async () => {
  const tree = await mount(), key = `${state.owner}:haccp_routine_profiles:POST`; held.add(key);
  await press(tree, 'Save header'); state.owner = 'settings-owner-b'; seed(); await render(tree);
  await act(async () => release(key)); expect(state.alert).not.toHaveBeenCalled();
  expect(field(tree, 'Name printed on records').props.value).toBe(profile().defaultLocationName);
});
it('refreshes Today equipment on focus without losing an unsaved temperature', async () => {
  const tree = await mount(true); expect(text(tree)).toContain('0/3');
  await act(async () => nodes(tree, 'HaccpTemperatureInput')[0].props.onChange('2.7'));
  state.focused = false; await render(tree, true);
  const [existing] = await routine.listHaccpEquipment(state.owner);
  await routine.saveHaccpEquipment(state.owner, { ...existing, criticalMax: 5, requiredReadings: 2 });
  state.focused = true; await render(tree, true);
  expect(text(tree)).toContain('0/2'); expect(nodes(tree, 'HaccpTemperatureInput')[0].props.criticalMax).toBe(5);
  expect(nodes(tree, 'HaccpTemperatureInput')[0].props.value).toBe('2.7');
});
it('renders Today cached equipment while cloud refresh is pending and rejects stale prior-focus data', async () => {
  const key = `${state.owner}:haccp_equipment:GET`; held.add(key); const tree = await mount(true);
  expect(text(tree)).toContain('Fridge settings-owner-a');
  state.focused = false; await render(tree, true); state.owner = 'settings-owner-b'; seed(); state.focused = true; await render(tree, true);
  await act(async () => release(key)); expect(text(tree)).toContain('Fridge settings-owner-b'); expect(text(tree)).not.toContain('Fridge settings-owner-a');
});
it('Today exposes retry on failed uncached profile load and cannot save default-scope forms', async () => {
  state.storage.delete(profileKey()); const key = `${state.owner}:haccp_routine_profiles:GET`; failed.add(key); const tree = await mount(true);
  expect(text(tree)).toContain('could not be loaded');
  expect(nodes(tree, 'AppButton').filter(node => node.props.label === 'Everything conforms')).toHaveLength(0);
  failed.delete(key); await press(tree, 'Retry loading routine'); expect(text(tree)).toContain(profile().defaultLocationName);
});
it('Today does not report a closed or conform shift while the profile is unavailable', async () => {
  state.storage.delete(profileKey()); held.add(`${state.owner}:haccp_routine_profiles:GET`); const tree = await mount(true);
  expect(nodes(tree, 'StatusPill').some(node => node.props.label === 'Closed')).toBe(false);
  expect(text(tree)).not.toContain('tasks conform'); expect(state.saveDocument).not.toHaveBeenCalled();
});
it('Today retains a newer typed temperature when an older save acknowledgement arrives', async () => {
  let acknowledge!: () => void;
  state.saveDocument.mockImplementationOnce(() => new Promise(resolve => { acknowledge = () => resolve({ synced: true }); }));
  const tree = await mount(true);
  await act(async () => nodes(tree, 'HaccpTemperatureInput')[0].props.onChange('2.7'));
  await press(tree, 'Save reading · next'); expect(state.saveDocument).toHaveBeenCalledTimes(1);
  await act(async () => nodes(tree, 'HaccpTemperatureInput')[0].props.onChange('3.1'));
  await act(async () => { acknowledge(); await tick(); });
  expect(nodes(tree, 'HaccpTemperatureInput')[0].props.value).toBe('3.1');
});
