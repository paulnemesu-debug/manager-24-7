import { createClient } from '@supabase/supabase-js';
import { createElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { translate, type Locale, type TranslationKey } from '@/i18n/translations';
import type { HaccpDocument } from '@/types/haccp';
import type { HaccpRoutineProfile } from '@/types/haccp-routine';

const state = vi.hoisted(() => ({ client: null as ReturnType<typeof createClient> | null,
  storage: new Map<string, string>(), owner: 'profile-owner-a', locale: 'en' as Locale, writes: [] as string[], alert: vi.fn(),
  rejectDocumentWrite: false,
  notification: null as null | (() => Promise<void>), navigate: vi.fn(),
  read: null as null | ((key: string, value: string | null) => Promise<string | null>),
}));
vi.mock('@react-native-async-storage/async-storage', () => ({ default: {
  getItem: async (key: string) => state.read ? state.read(key, state.storage.get(key) ?? null) : state.storage.get(key) ?? null,
  setItem: async (key: string, value: string) => {
    if (state.rejectDocumentWrite && key.startsWith('professional_foodcost.haccp_documents.')) throw new Error('isolated disk write failure');
    state.writes.push(key); state.storage.set(key, value);
  },
} }));
vi.mock('@/lib/supabase', () => ({ isDemoMode: false, isSupabaseConfigured: true, get supabase() { return state.client; } }));
vi.mock('@/contexts/auth-context', () => ({ useAuth: () => ({ user: { id: state.owner, email: `${state.owner}@example.invalid` } }) }));
vi.mock('@/contexts/locale-context', () => ({ useI18n: () => ({ locale: state.locale,
  t: (key: TranslationKey, params?: Record<string, string | number>) => translate(state.locale, key, params) }) }));
vi.mock('expo-router', () => ({ useRouter: () => ({ replace: state.navigate }), useLocalSearchParams: () => ({ code: 'FO-H-05-01' }) }));
vi.mock('react-native', () => ({ Platform: { select: (values: { default: unknown }) => values.default }, Alert: { alert: state.alert },
  StyleSheet: { create: (styles: object) => styles }, View: 'View', Text: 'Text', Pressable: 'Pressable' }));
vi.mock('@expo/vector-icons', () => ({ Ionicons: 'Icon' }));
vi.mock('expo-haptics', () => ({ selectionAsync: async () => undefined, notificationAsync: async () => state.notification?.(), NotificationFeedbackType: { Success: 'Success' } }));
vi.mock('@/components/tool-header', () => ({ ToolHeader: 'ToolHeader' }));
vi.mock('@/components/haccp-field', () => ({ HaccpField: 'HaccpField' }));
vi.mock('@/components/haccp-month-grid', () => ({ HaccpMonthGrid: 'HaccpMonthGrid' }));
vi.mock('@/components/ui', async () => {
  const { createElement } = await import('react');
  return { ...Object.fromEntries(['AppButton', 'Body', 'Card', 'IconButton', 'SectionHeader', 'StatusPill'].map(name => [name, name])),
    Screen: (props: { children: React.ReactNode; footer?: React.ReactNode }) => createElement('Screen', {}, props.children, props.footer) };
});
vi.mock('@/lib/haccp-export', () => ({ exportHaccpDocumentPdf: vi.fn() }));
vi.mock('@/lib/haccp-reminders', () => ({ syncHaccpReminders: vi.fn() }));

import HaccpFormScreen from '@/app/tools/haccp/[code]';
import { useHaccpDocuments } from '@/hooks/use-haccp-documents';
import * as routine from './haccp-routine-repository';
import { loadCachedHaccpDocuments } from './haccp-repository';
import { exportHaccpDocumentPdf } from './haccp-export';
import { syncHaccpReminders } from './haccp-reminders';

type Remote = { id: string; user_id: string; form_code: string; payload: Record<string, unknown>; created_at: string; updated_at: string };
type Gate = { owner: string; table: string; release: () => void };
const timestamp = '2026-11-05T08:00:00Z';
const profileKey = (owner = state.owner) => `manager247.haccp-routine-profile.v1.${owner}`;
const documentKey = (owner = state.owner) => `professional_foodcost.haccp_documents.v1.${owner}`;
const tick = () => new Promise<void>(resolve => setTimeout(resolve, 0));
let database: Remote[], profiles: Map<string, HaccpRoutineProfile>, requests: { owner: string; table: string; method: string }[];
let gates: Gate[], heldProfiles: Set<string>, heldDocuments: Set<string>, failedProfiles: Set<string>, heldSaves: Set<string>;
let trees: ReactTestRenderer[], pending: Promise<unknown>[];
function profile(owner = state.owner): HaccpRoutineProfile {
  return { defaultLocationId: `location-${owner}`, defaultLocationName: `Kitchen ${owner}`, responsibleName: 'QA operator',
    shiftStartTime: '06:00', updatedAt: timestamp, syncState: 'synced' };
}
function seedProfile(owner = state.owner) {
  const value = profile(owner); profiles.set(owner, value); state.storage.set(profileKey(owner), JSON.stringify(value)); return value;
}
function document(id: string, owner = state.owner, metadata: Record<string, string> = {}): HaccpDocument {
  return { id, formCode: 'FO-H-05-01', headerValues: { form_date: '2026-11-05', location: profile(owner).defaultLocationName,
    year: '2026', _location_id: profile(owner).defaultLocationId!, _location_name: profile(owner).defaultLocationName, ...metadata },
    rows: [{ id: `${id}-row`, values: { date: '2026-11-05', service: 'disinsection', report_number: id, responsible: 'QA identity' }, createdAt: timestamp, updatedAt: timestamp }],
    createdAt: timestamp, updatedAt: timestamp, syncState: 'synced' };
}
function seedDocuments(documents: HaccpDocument[], owner = state.owner) {
  state.storage.set(documentKey(owner), JSON.stringify(documents));
  for (const doc of documents) database.push({ id: doc.id, user_id: owner, form_code: doc.formCode,
    payload: { headerValues: doc.headerValues, rows: doc.rows, createdAt: doc.createdAt, updatedAt: doc.updatedAt }, created_at: doc.createdAt, updated_at: doc.updatedAt });
}
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  state.storage.clear(); state.owner = 'profile-owner-a'; state.locale = 'en'; state.writes = []; state.read = null; state.alert.mockClear(); state.rejectDocumentWrite = false;
  state.notification = null; state.navigate.mockClear(); vi.mocked(exportHaccpDocumentPdf).mockClear(); vi.mocked(syncHaccpReminders).mockClear();
  database = []; profiles = new Map(); requests = []; gates = []; trees = []; pending = [];
  heldProfiles = new Set(); heldDocuments = new Set(); failedProfiles = new Set(); heldSaves = new Set();
  seedProfile();
  state.client = createClient('http://127.0.0.1:9876', 'synthetic-no-network-key', {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, db: { retry: false },
    global: { fetch: async (input, init) => {
      const url = new URL(String(input)), table = url.pathname.split('/').at(-1)!, method = init?.method ?? 'GET';
      expect(url.origin).toBe('http://127.0.0.1:9876');
      const payload = method === 'POST' ? JSON.parse(String(init?.body)) : null;
      const owner = url.searchParams.get('user_id')?.slice(3) ?? (Array.isArray(payload) ? payload[0].user_id : payload?.user_id);
      expect(owner).toBeTruthy(); requests.push({ owner, table, method });
      if (table === 'haccp_routine_profiles') {
        expect(method).toBe('GET');
        if (failedProfiles.has(owner)) throw new TypeError('isolated offline profile');
        const value = profiles.get(owner);
        const response = () => Response.json(value ? { default_location_id: value.defaultLocationId, default_location_name: value.defaultLocationName,
          responsible_name: value.responsibleName, shift_start_time: value.shiftStartTime, updated_at: value.updatedAt } : null);
        if (heldProfiles.has(owner)) return new Promise<Response>(resolve => gates.push({ owner, table, release: () => resolve(response()) }));
        return response();
      }
      expect(table).toBe('haccp_documents');
      if (method === 'GET') {
        const rows = structuredClone(database.filter(row => row.user_id === owner));
        if (heldDocuments.has(owner)) return new Promise<Response>(resolve => gates.push({ owner, table, release: () => resolve(Response.json(rows)) }));
        return Response.json(rows);
      }
      if (method === 'DELETE') {
        const id = url.searchParams.get('id')?.slice(3);
        database = database.filter(row => row.user_id !== owner || row.id !== id);
        return new Response(null, { status: 204 });
      }
      expect(method).toBe('POST');
      const respond = () => {
        for (const row of payload) database = [...database.filter(old => old.id !== row.id), structuredClone(row)];
        return new Response(null, { status: 201 });
      };
      if (heldSaves.has(owner)) return new Promise<Response>(resolve => gates.push({ owner, table, release: () => resolve(respond()) }));
      return respond();
    } },
  });
});
async function releaseAll() {
  heldProfiles.clear(); heldDocuments.clear(); heldSaves.clear(); gates.splice(0).forEach(gate => gate.release()); await tick();
}
afterEach(async () => {
  state.read = null; state.rejectDocumentWrite = false;
  await act(async () => { await releaseAll(); await Promise.allSettled(pending); await tick(); trees.forEach(tree => tree.unmount()); });
  vi.unstubAllGlobals();
});
const nodes = (tree: ReactTestRenderer, type: string) => tree.root.findAll(node => String(node.type) === type);
const button = (tree: ReactTestRenderer, label: string) => nodes(tree, 'AppButton').find(node => node.props.label === label)!;
const field = (tree: ReactTestRenderer, key: string) => nodes(tree, 'HaccpField').find(node => node.props.field.key === key)!;
const text = (tree: ReactTestRenderer) => JSON.stringify(tree.toJSON());
const cards = (tree: ReactTestRenderer) => nodes(tree, 'IconButton').filter(node => node.props.label === translate(state.locale, 'haccp.exportPdf')).length;
const press = async (tree: ReactTestRenderer, label: string) => act(async () => {
  const found = button(tree, label); expect(found).toBeDefined(); expect(found.props.disabled).not.toBe(true); found.props.onPress(); await tick();
});
const set = async (tree: ReactTestRenderer, key: string, value: string) => act(async () => field(tree, key).props.onChange(value));
async function mount() {
  let tree!: ReactTestRenderer; await act(async () => { tree = create(createElement(HaccpFormScreen)); }); trees.push(tree);
  await act(async () => { await tick(); }); return tree;
}
async function remount(tree: ReactTestRenderer) { await act(async () => tree.unmount()); trees = trees.filter(item => item !== tree); return mount(); }
async function fillSave(tree: ReactTestRenderer, label = 'TEST VIRTUAL') {
  await set(tree, 'service', 'disinsection'); await set(tree, 'report_number', label); await set(tree, 'responsible', 'QA synthetic identity');
  await press(tree, 'Add row'); await press(tree, 'Save form'); await act(async () => { await tick(); });
}

it('uses the durable selected scope immediately while the real profile GET is pending; save remains visible after reload', async () => {
  heldProfiles.add(state.owner); seedDocuments([document('existing')]);
  let tree = await mount(); expect(gates.some(gate => gate.table === 'haccp_routine_profiles')).toBe(true);
  await press(tree, 'Complete a new form');
  expect(field(tree, 'location').props.value).toBe(profile().defaultLocationName);
  await fillSave(tree); await act(async () => { await releaseAll(); });
  const saved = (await loadCachedHaccpDocuments(state.owner)).find(doc => doc.id !== 'existing')!;
  expect(saved).toMatchObject({ syncState: 'synced', headerValues: { _location_id: profile().defaultLocationId, _location_name: profile().defaultLocationName } });
  tree = await remount(tree); expect(cards(tree)).toBe(2); expect(database).toHaveLength(2);
});

it('blocks new documents until a profile without any cache is resolved', async () => {
  state.storage.delete(profileKey()); heldProfiles.add(state.owner);
  const tree = await mount(); expect(button(tree, 'Complete a new form').props.disabled).toBe(true);
  // Even a stale/native event dispatched while disabled must not create a default draft.
  await act(async () => button(tree, 'Complete a new form').props.onPress()); expect(nodes(tree, 'HaccpField')).toHaveLength(0);
  await act(async () => { await releaseAll(); });
  await press(tree, 'Complete a new form'); expect(field(tree, 'location').props.value).toBe(profile().defaultLocationName);
});

it.each(['en', 'ro'] as const)('shows profile error and retry in %s instead of inventing a default scope offline', async locale => {
  state.locale = locale; state.storage.delete(profileKey()); failedProfiles.add(state.owner);
  const tree = await mount();
  expect(button(tree, translate(locale, 'haccp.newDocument')).props.disabled).toBe(true);
  expect(text(tree)).toContain(locale === 'ro' ? 'Locația formularului nu a putut fi încărcată' : 'The form location could not be loaded');
  failedProfiles.clear(); await press(tree, locale === 'ro' ? 'Reîncearcă încărcarea locației' : 'Retry loading location');
  expect(button(tree, translate(locale, 'haccp.newDocument')).props.disabled).not.toBe(true);
});

it('keeps cached scope usable when the profile network request fails', async () => {
  failedProfiles.add(state.owner); const tree = await mount(); await press(tree, 'Complete a new form');
  expect(field(tree, 'location').props.value).toBe(profile().defaultLocationName);
});

it('does not retarget an active draft or its saved-list scope when a late cloud profile selects another location', async () => {
  heldProfiles.add(state.owner); profiles.set(state.owner, { ...profile(), defaultLocationId: 'different-id', defaultLocationName: 'Different kitchen' });
  const tree = await mount(); await press(tree, 'Complete a new form');
  await act(async () => { await releaseAll(); });
  expect(field(tree, 'location').props.value).toBe(profile().defaultLocationName);
  await fillSave(tree); await press(tree, 'Forms list'); expect(cards(tree)).toBe(1);
  expect((await loadCachedHaccpDocuments(state.owner))[0].headerValues._location_id).toBe(profile().defaultLocationId);
});

it.each(['', undefined])('exposes an unassigned saved form and preserves its original assignment %s on open/save', async id => {
  const orphan = document('unassigned', state.owner, { _location_id: '', _location_name: 'Bucătărie principală' });
  if (id === undefined) { delete orphan.headerValues._location_id; delete orphan.headerValues._location_name; }
  const metadata = { ...orphan.headerValues };
  seedDocuments([orphan, document('different', state.owner, { _location_id: 'other-location-id', location: profile().defaultLocationName })]);
  const tree = await mount(); expect(text(tree)).toContain('Unassigned saved forms'); expect(cards(tree)).toBe(1);
  await act(async () => nodes(tree, 'Pressable')[0].props.onPress());
  expect(state.storage.get(documentKey())).toContain('unassigned');
  expect(requests.filter(request => request.method === 'POST')).toHaveLength(0);
  await press(tree, 'Save form');
  const saved = (await loadCachedHaccpDocuments(state.owner)).find(doc => doc.id === orphan.id)!;
  expect(saved.headerValues._location_id).toBe(metadata._location_id);
  expect(saved.headerValues._location_name).toBe(metadata._location_name);
  expect(saved.headerValues.location).toBe(metadata.location);
  expect(saved.rows).toEqual(orphan.rows);
  await press(tree, 'Forms list'); expect(cards(tree)).toBe(1); expect(text(tree)).toContain('Unassigned saved forms');
});

it('labels unassigned recovery in Romanian without changing the hidden metadata', async () => {
  state.locale = 'ro'; const orphan = document('unassigned', state.owner, { _location_id: '', _location_name: 'Old kitchen' });
  seedDocuments([orphan]); const before = JSON.stringify(orphan.headerValues); const tree = await mount();
  expect(text(tree)).toContain('Formulare salvate fără locație atribuită');
  expect(JSON.stringify((await loadCachedHaccpDocuments(state.owner))[0].headerValues)).toBe(before);
  expect(requests.filter(request => request.method === 'POST')).toHaveLength(0);
});

it('preserves malformed profile bytes, blocks create and never fetches or overwrites that profile', async () => {
  state.storage.set(profileKey(), '{corrupt profile'); const tree = await mount();
  expect(button(tree, 'Complete a new form').props.disabled).toBe(true);
  expect(text(tree)).toContain('The form location could not be loaded'); expect(state.storage.get(profileKey())).toBe('{corrupt profile');
  expect(requests.filter(request => request.table === 'haccp_routine_profiles')).toHaveLength(0);
  expect(state.writes).not.toContain(profileKey());
});

it('reads the validated profile snapshot without network, writes, default seeding or the cloud-held lock', async () => {
  expect(typeof routine.readHaccpProfileSnapshot).toBe('function');
  heldProfiles.add(state.owner); pending.push(routine.loadHaccpProfile(state.owner)); await tick();
  const count = requests.length, writes = state.writes.length;
  let snapshot: HaccpRoutineProfile | null | undefined;
  pending.push(routine.readHaccpProfileSnapshot(state.owner).then(value => { snapshot = value; })); await tick();
  expect(snapshot).toEqual(profile()); expect(requests).toHaveLength(count); expect(state.writes).toHaveLength(writes);
  expect(await routine.readHaccpProfileSnapshot('no-cache-owner')).toBeNull();
  expect(requests).toHaveLength(count); expect(state.writes).toHaveLength(writes);
});

it('accepts a successful confirmed absence for a new online profile without treating network errors as absence', async () => {
  expect(typeof routine.loadHaccpProfileForEntry).toBe('function');
  state.storage.delete(profileKey()); profiles.delete(state.owner);
  expect(await routine.loadHaccpProfileForEntry(state.owner)).toMatchObject({ defaultLocationId: null, defaultLocationName: 'Bucătărie principală' });
  failedProfiles.add(state.owner);
  await expect(routine.loadHaccpProfileForEntry(state.owner)).rejects.toThrow();
});

it('ignores late old-owner profile and document responses after an account switch', async () => {
  const ownerA = state.owner; heldProfiles.add(ownerA); heldDocuments.add(ownerA); seedDocuments([document('owner-a-record')]);
  const tree = await mount(); await press(tree, 'Complete a new form');
  state.owner = 'profile-owner-b'; seedProfile(); seedDocuments([document('owner-b-record')]);
  await act(async () => { tree.update(createElement(HaccpFormScreen)); await tick(); });
  expect(nodes(tree, 'HaccpField')).toHaveLength(0); expect(cards(tree)).toBe(1);
  await act(async () => { await releaseAll(); });
  expect(cards(tree)).toBe(1); await press(tree, 'Complete a new form');
  expect(field(tree, 'location').props.value).toBe(profile().defaultLocationName);
  await fillSave(tree, 'owner-b-new');
  expect(database.filter(row => row.user_id === state.owner)).toHaveLength(2);
  expect(database.filter(row => row.user_id === ownerA)).toHaveLength(1);
});

it('does not publish an old-owner save acknowledgement into the new owner hook state', async () => {
  let current!: ReturnType<typeof useHaccpDocuments>;
  function Probe() { current = useHaccpDocuments(state.owner); return null; }
  let tree!: ReactTestRenderer; await act(async () => { tree = create(createElement(Probe)); await tick(); }); trees.push(tree);
  const ownerA = state.owner; heldSaves.add(ownerA);
  await act(async () => { pending.push(current.save(document('slow-save'))); await tick(); });
  state.owner = 'profile-owner-b'; seedProfile(); seedDocuments([document('owner-b-record')]);
  await act(async () => { tree.update(createElement(Probe)); await tick(); });
  expect(current.documents.map(doc => doc.id)).toEqual(['owner-b-record']);
  await act(async () => { await releaseAll(); await Promise.all(pending); });
  expect(current.documents.map(doc => doc.id)).toEqual(['owner-b-record']);
});

it('ignores a late cached document read after account change', async () => {
  let releaseRead!: () => void; const ownerA = state.owner; seedDocuments([document('owner-a-record')]);
  state.read = async (key, value) => key === documentKey(ownerA) ? new Promise(resolve => { releaseRead = () => resolve(value); }) : value;
  let current!: ReturnType<typeof useHaccpDocuments>;
  function Probe() { current = useHaccpDocuments(state.owner); return null; }
  let tree!: ReactTestRenderer; await act(async () => { tree = create(createElement(Probe)); await tick(); }); trees.push(tree);
  state.owner = 'profile-owner-b'; seedProfile(); seedDocuments([document('owner-b-record')]);
  await act(async () => { tree.update(createElement(Probe)); await tick(); });
  state.read = null; await act(async () => { releaseRead(); await tick(); });
  expect(current.documents.map(doc => doc.id)).toEqual(['owner-b-record']);
});

it('labels a new or edited draft as unsaved until its actual save completes, without introducing autosave', async () => {
  const tree = await mount(); await press(tree, 'Complete a new form');
  expect(nodes(tree, 'StatusPill')[0].props.label).toBe('Unsaved changes');
  expect(await loadCachedHaccpDocuments(state.owner)).toEqual([]);
  expect(requests.filter(request => request.method === 'POST')).toHaveLength(0);
  await fillSave(tree); expect(nodes(tree, 'StatusPill')[0].props.label).toBe('Synced');
  await set(tree, 'location', 'Visible unsaved annotation');
  expect(nodes(tree, 'StatusPill')[0].props.label).toBe('Unsaved changes');
  expect((await loadCachedHaccpDocuments(state.owner))[0].headerValues.location).toBe(profile().defaultLocationName);
});

it('surfaces a corrupt documents cache without pretending there are no saved forms or overwriting its bytes', async () => {
  state.storage.set(documentKey(), '{corrupt documents'); const tree = await mount();
  expect(text(tree)).toContain('Saved forms could not be loaded or refreshed');
  expect(text(tree)).not.toContain(translate('en', 'haccp.noDocuments'));
  expect(state.storage.get(documentKey())).toBe('{corrupt documents');
  expect(requests.filter(request => request.table === 'haccp_documents')).toHaveLength(0);
  expect(state.writes).not.toContain(documentKey());
});

it.each(['save', 'saveMany'] as const)('clears an invalidated refresh indicator when %s cannot write durable data', async action => {
  heldDocuments.add(state.owner); seedDocuments([document('existing')]);
  let current!: ReturnType<typeof useHaccpDocuments>;
  function Probe() { current = useHaccpDocuments(state.owner); return null; }
  let tree!: ReactTestRenderer; await act(async () => { tree = create(createElement(Probe)); await tick(); }); trees.push(tree);
  expect(current.isSyncing).toBe(true);
  state.rejectDocumentWrite = true;
  let saveError: unknown;
  await act(async () => {
    const result = action === 'save' ? current.save(document('rejected')) : current.saveMany([document('rejected')]);
    pending.push(result.catch(error => { saveError = error; })); await tick();
  });
  expect(current.isSyncing).toBe(false);
  await act(async () => { await releaseAll(); await Promise.all(pending); });
  expect(saveError).toBeInstanceOf(Error); expect(current.isSyncing).toBe(false);
  expect((await loadCachedHaccpDocuments(state.owner)).map(doc => doc.id)).toEqual(['existing']);
  expect(requests.filter(request => request.method === 'POST')).toHaveLength(0);
});

it.each([
  ['PDF', 'owner'], ['Save form', 'owner'], ['Done, next task', 'draft'],
] as const)('cancels the %s continuation if the %s changes during the notification await', async (action, change) => {
  const tree = await mount(); await press(tree, 'Complete a new form');
  await set(tree, 'service', 'disinsection'); await set(tree, 'responsible', 'QA synthetic'); await press(tree, 'Add row');
  let release!: () => void; state.notification = () => new Promise<void>(resolve => { release = resolve; });
  await press(tree, action); expect(release).toBeTypeOf('function');
  expect(database).toHaveLength(1); // The explicit A save was accepted before the scope changed.
  if (change === 'owner') {
    state.owner = 'profile-owner-b'; seedProfile();
    await act(async () => { tree.update(createElement(HaccpFormScreen)); await tick(); });
  } else await press(tree, 'Forms list');
  await act(async () => { release(); await tick(); });
  expect(exportHaccpDocumentPdf).not.toHaveBeenCalled(); expect(syncHaccpReminders).not.toHaveBeenCalled();
  expect(state.navigate).not.toHaveBeenCalled(); expect(state.alert).not.toHaveBeenCalled();
});

it.each(['save', 'saveMany'] as const)('does not resurrect a deleted card after an older %s acknowledgement and retains unrelated saves', async action => {
  const deleted = document('delete-me'), other = document('keep-me'); seedDocuments([deleted, other]);
  let current!: ReturnType<typeof useHaccpDocuments>;
  function Probe() { current = useHaccpDocuments(state.owner); return null; }
  let tree!: ReactTestRenderer; await act(async () => { tree = create(createElement(Probe)); await tick(); }); trees.push(tree);
  heldSaves.add(state.owner);
  const changed = { ...other, headerValues: { ...other.headerValues, note: 'new unrelated batch value' } };
  await act(async () => {
    pending.push(action === 'save' ? current.save(deleted) : current.saveMany([deleted, changed])); await tick();
  });
  expect(gates.some(gate => gate.table === 'haccp_documents')).toBe(true);
  await act(async () => { pending.push(current.remove(deleted)); await tick(); });
  expect(current.documents.map(doc => doc.id)).toEqual(['keep-me']);
  await act(async () => { await releaseAll(); await Promise.all(pending); await tick(); });
  expect(database.map(row => row.id)).toEqual(['keep-me']);
  expect((await loadCachedHaccpDocuments(state.owner)).map(doc => doc.id)).toEqual(['keep-me']);
  expect(current.documents.map(doc => doc.id)).toEqual(['keep-me']);
  if (action === 'saveMany') expect(current.documents[0].headerValues.note).toBe('new unrelated batch value');
});

it('keeps a later explicit save when it follows deletion of the same document', async () => {
  const original = document('same-id'); seedDocuments([original]);
  let current!: ReturnType<typeof useHaccpDocuments>;
  function Probe() { current = useHaccpDocuments(state.owner); return null; }
  let tree!: ReactTestRenderer; await act(async () => { tree = create(createElement(Probe)); await tick(); }); trees.push(tree);
  await act(async () => {
    pending.push(current.remove(original));
    pending.push(current.save({ ...original, headerValues: { ...original.headerValues, note: 'later explicit intent' } }));
    await Promise.all(pending); await tick();
  });
  expect(database).toHaveLength(1); expect(current.documents).toHaveLength(1);
  expect(current.documents[0].headerValues.note).toBe('later explicit intent');
});
