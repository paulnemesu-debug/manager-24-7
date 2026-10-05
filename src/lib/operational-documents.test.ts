import { beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ storage: new Map<string, string>(), rows: new Map<string, { id: string; user_id: string; data: Record<string, unknown>; version: number; updated_at: string }>(), offline: false, loseAck: false, calls: 0, user: 'one' }));
vi.mock('@react-native-async-storage/async-storage', () => ({ default: {
  getItem: async (key: string) => state.storage.get(key) ?? null,
  setItem: async (key: string, value: string) => { state.storage.set(key, value); },
} }));
vi.mock('@/lib/supabase', () => ({ isDemoMode: false, isSupabaseConfigured: true, supabase: {
  rpc: async (_: string, args: { p_kind: string; p_id: string; p_data: Record<string, unknown>; p_expected_version: number }) => {
    state.calls++;
    if (state.offline) return { error: new Error('offline'), data: null };
    const key = `${state.user}:${args.p_kind}:${args.p_id}`;
    const row = state.rows.get(key);
    const clean = (data: Record<string, unknown>) => { const { updatedAt: _time, ...rest } = data; return JSON.stringify(rest); };
    if (row && clean(row.data) === clean(args.p_data)) return { data: { applied: true, record: row } };
    if ((row?.version ?? 0) !== args.p_expected_version) return { data: { applied: false, record: row } };
    const saved = { id: args.p_id, user_id: state.user, data: args.p_data, version: (row?.version ?? 0) + 1, updated_at: new Date().toISOString() };
    state.rows.set(key, saved);
    if (state.loseAck) { state.loseAck = false; state.offline = true; throw new Error('response lost'); }
    return { data: { applied: true, record: saved } };
  },
  from: (table: string) => ({ select: () => ({ eq: (_: string, userId: string) => ({ order: () => ({ range: async (start: number, end: number) => {
    state.calls++;
    if (state.offline) return { error: new Error('offline'), data: null };
    return { data: [...state.rows.entries()].filter(([key]) => key.startsWith(`${userId}:${table}:`)).map(([, row]) => row).slice(start, end + 1), error: null };
  } }) }) }) }),
} }));
import { documentExpiryStatus, loadOperationalDocuments, saveOperationalDocument, resolveOperationalDocument } from './operational-documents';
import { defaultHrLifecycle, loadHrLifecycle, saveHrLifecycle, validateHrLifecycle, hrLifecycleProgress, applyHrLifecycle } from './hr-lifecycle';
const draft = { title: 'Autorizație', owner: 'Manager', category: 'authorization' as const, issueDate: '2026-01-01', expiryDate: '2026-10-04', notes: '' };
beforeEach(() => { state.storage.clear(); state.rows.clear(); state.offline = false; state.loseAck = false; state.calls = 0; state.user = 'one'; });
describe('calendar expiry', () => {
  const now = new Date('2026-10-04T12:00:00');
  it('marks yesterday expired even at the start of the day', () => expect(documentExpiryStatus('2026-10-03', new Date('2026-10-04T00:01:00')).days).toBe(-1));
  it('keeps today valid until the next local date', () => expect(documentExpiryStatus('2026-10-04', now)).toMatchObject({ days: 0, tone: 'watch', label: 'Expiră azi' }));
  it('uses calendar days across daylight saving', () => expect(documentExpiryStatus('2026-11-03', now).days).toBe(30));
  it('distinguishes invalid, absent and distant dates', () => {
    expect(documentExpiryStatus('2026-02-30', now).tone).toBe('danger');
    expect(documentExpiryStatus('', now).tone).toBe('neutral');
    expect(documentExpiryStatus('2027-01-01', now).tone).toBe('healthy');
  });
  it('rejects invalid dates and inverted date ranges before writing', async () => {
    await expect(saveOperationalDocument('one', { ...draft, expiryDate: '2026-02-30' })).rejects.toThrow('Data');
    await expect(saveOperationalDocument('one', { ...draft, issueDate: '2027-01-01' })).rejects.toThrow('Expirarea');
    expect(state.storage.size).toBe(0);
  });
});
describe('operational synchronization', () => {
  it('persists offline, retries, and loads on a fresh device', async () => {
    state.offline = true;
    const saved = await saveOperationalDocument('one', draft);
    expect(saved.syncState).toBe('pending');
    expect((await loadOperationalDocuments('one'))[0].title).toBe(draft.title);
    state.offline = false;
    expect((await loadOperationalDocuments('one'))[0].syncState).toBe('synced');
    state.storage.clear();
    expect((await loadOperationalDocuments('one'))[0].id).toBe(saved.id);
  });
  it('serializes concurrent edits to different documents', async () => {
    state.offline = true;
    await Promise.all([saveOperationalDocument('one', { ...draft, id: 'a' }), saveOperationalDocument('one', { ...draft, id: 'b' })]);
    expect(await loadOperationalDocuments('one')).toHaveLength(2);
  });
  it('detects a stale open editor even if background refresh already fetched the new revision', async () => {
    const first = await saveOperationalDocument('one', { ...draft, id: 'a' });
    const remote = state.rows.get('one:operational_documents:a')!;
    state.rows.set('one:operational_documents:a', { ...remote, data: { ...remote.data, title: 'Other device' }, version: 2 });
    await loadOperationalDocuments('one');
    const saved = await saveOperationalDocument('one', { ...first, title: 'Local edit' });
    expect(saved.syncState).toBe('conflict');
    expect(saved.title).toBe('Local edit');
    expect(saved.remoteConflict?.data.title).toBe('Other device');
    await resolveOperationalDocument('one', 'a', 'local');
    expect(state.rows.get('one:operational_documents:a')?.data.title).toBe('Local edit');
    expect(state.rows.get('one:operational_documents:a')?.version).toBe(3);
  });
  it('can keep the remote version after a conflict', async () => {
    const first = await saveOperationalDocument('one', { ...draft, id: 'a' });
    await saveOperationalDocument('one', { ...first, title: 'Remote edit' });
    await saveOperationalDocument('one', { ...first, title: 'Stale edit' });
    const items = await resolveOperationalDocument('one', 'a', 'remote');
    expect(items[0]).toMatchObject({ title: 'Remote edit', syncState: 'synced' });
  });
  it('retries a lost acknowledgement without duplicating or conflicting', async () => {
    state.loseAck = true;
    const first = await saveOperationalDocument('one', { ...draft, id: 'a' });
    expect(first.syncState).toBe('pending');
    state.offline = false;
    expect((await loadOperationalDocuments('one'))[0].syncState).toBe('synced');
    expect(state.rows.size).toBe(1);
    expect(state.rows.get('one:operational_documents:a')?.version).toBe(1);
  });
  it('preserves archived records across devices without resurrecting them', async () => {
    const item = await saveOperationalDocument('one', draft);
    await saveOperationalDocument('one', { ...item, archived: true });
    state.storage.clear();
    expect((await loadOperationalDocuments('one'))[0].archived).toBe(true);
  });
  it('migrates legacy document IDs and isolates accounts and demo', async () => {
    state.storage.set('manager247.operational-documents.v1.one', JSON.stringify([{ ...draft, id: 'doc-legacy', updatedAt: '2026-10-01T12:00:00Z' }]));
    expect((await loadOperationalDocuments('one'))[0].syncState).toBe('synced');
    expect(await loadOperationalDocuments('two')).toEqual([]);
    const calls = state.calls;
    await saveOperationalDocument('demo', draft);
    await loadOperationalDocuments('demo');
    expect(state.calls).toBe(calls);
  });
  it('keeps corrupt local storage untouched and surfaces an error', async () => {
    state.storage.set('manager247.operational-documents.v1.one', '{bad');
    await expect(loadOperationalDocuments('one')).rejects.toThrow();
    expect(state.storage.get('manager247.operational-documents.v1.one')).toBe('{bad');
  });
});
describe('HR lifecycle', () => {
  it('persists checklist fields and dates and deactivates a departure locally', async () => {
    const item = { ...defaultHrLifecycle({ id: 'employee', active: true }), status: 'left' as const, hireDate: '2026-01-01', exitDate: '2026-10-04', equipmentReturned: true, keysReturned: true };
    await saveHrLifecycle('demo', item);
    expect((await loadHrLifecycle('demo'))[0]).toMatchObject({ equipmentReturned: true, keysReturned: true, status: 'left' });
    expect(hrLifecycleProgress(item)).toEqual({ completed: 2, total: 5 });
    const employee = { id: 'employee', name: 'Test', role: '', active: true, locationId: null, locationName: '', grossSalary: null, netSalary: null, createdAt: '', updatedAt: '' };
    expect(applyHrLifecycle([employee], [item])[0].active).toBe(false);
    expect(employee.active).toBe(true);
  });
  it('requires a departure date and checks date order', () => {
    const item = { ...defaultHrLifecycle({ id: 'employee', active: true }), status: 'left' as const };
    expect(() => validateHrLifecycle(item)).toThrow('data plecării');
    expect(() => validateHrLifecycle({ ...item, hireDate: '2026-10-04', exitDate: '2026-10-03' })).toThrow('preceda');
  });
  it('migrates old HR booleans without marking new tasks completed', async () => {
    state.storage.set('manager247.hr-lifecycle.v1.demo', JSON.stringify([{ employeeId: 'employee', status: 'onboarding', documents: true, medical: true, training: true }]));
    const [item] = await loadHrLifecycle('demo');
    expect(hrLifecycleProgress(item)).toEqual({ completed: 3, total: 5 });
  });
});
