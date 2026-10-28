import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { HaccpEquipment, HaccpEquipmentDraft, HaccpRoutineProfile } from '@/types/haccp-routine';

const state = vi.hoisted(() => ({
  storage: new Map<string, string>(),
  rows: {} as Record<string, Record<string, unknown>[]>,
  stale: {} as Record<string, Record<string, unknown>[]>,
  online: false,
  throwNetwork: false,
  rejectRead: false,
  rejectWrite: false,
  holdWrite: null as null | (() => Promise<void>),
}));

vi.mock('@react-native-async-storage/async-storage', () => ({ default: {
  getItem: async (key: string) => {
    await Promise.resolve();
    if (state.rejectRead) throw new Error('storage read failed');
    return state.storage.get(key) ?? null;
  },
  setItem: async (key: string, value: string) => {
    await Promise.resolve();
    if (state.rejectWrite) throw new Error('storage write failed');
    state.storage.set(key, value);
  },
} }));

function query(table: string) {
  let input: Record<string, unknown> | undefined;
  let update = false;
  let single = false;
  const filters: [string, unknown][] = [];
  const run = async () => {
    if (state.throwNetwork) throw new Error('network rejected');
    if (!state.online) return { data: null, error: new Error('offline') };
    const matches = (row: Record<string, unknown>) => filters.every(([key, value]) => row[key] === value);
    if (input) {
      const pause = state.holdWrite;
      state.holdWrite = null;
      if (pause) await pause();
      const rows = state.rows[table] ?? [];
      const key = input.id ? 'id' : 'user_id';
      state.rows[table] = update
        ? rows.map((row) => matches(row) ? { ...row, ...input } : row)
        : [...rows.filter((row) => row[key] !== input![key]), { ...input }];
      return { data: null, error: null };
    }
    const selected = (state.stale[table] ?? state.rows[table] ?? []).filter(matches);
    return { data: single ? selected[0] ?? null : selected, error: null };
  };
  const builder = {
    select: () => builder,
    eq: (key: string, value: unknown) => { filters.push([key, value]); return builder; },
    order: () => builder,
    upsert: (value: Record<string, unknown>) => { input = value; return builder; },
    update: (value: Record<string, unknown>) => { input = value; update = true; return builder; },
    maybeSingle: () => { single = true; return builder; },
    then: (resolve: (result: Awaited<ReturnType<typeof run>>) => unknown, reject?: (reason: unknown) => unknown) => run().then(resolve, reject),
  };
  return builder;
}

vi.mock('@/lib/supabase', () => ({
  isDemoMode: false,
  isSupabaseConfigured: true,
  supabase: { from: query },
}));

import { deactivateHaccpEquipment, defaultHaccpProfile, listHaccpEquipment, loadHaccpProfile, saveHaccpEquipment, saveHaccpProfile } from '@/lib/haccp-routine-repository';

const userId = 'routine-recovery';
const equipmentKey = `manager247.haccp-equipment.v1.${userId}`;
const profileKey = `manager247.haccp-routine-profile.v1.${userId}`;
const draft: HaccpEquipmentDraft = {
  id: 'fridge', locationId: null, name: 'Updated fridge', kind: 'cold', criticalMin: 0,
  criticalMax: 3, requiredReadings: 2, readingTimes: ['08:00', '16:00'], active: true, sortOrder: 1,
};
const remoteEquipment = {
  id: 'fridge', user_id: userId, location_id: null, name: 'Old fridge', kind: 'cold', critical_min: 0,
  critical_max: 8, required_readings: 1, reading_times: ['08:00'], active: true, sort_order: 1,
  updated_at: '2026-10-01T00:00:00Z',
};
const remoteProfile = {
  user_id: userId, default_location_id: null, default_location_name: 'Old kitchen',
  responsible_name: 'Old operator', shift_start_time: '06:00', updated_at: '2026-10-01T00:00:00Z',
};
const changedProfile = (): HaccpRoutineProfile => ({ ...defaultHaccpProfile(), responsibleName: 'New operator', shiftStartTime: '09:00' });
const cachedEquipment = (): HaccpEquipment[] => JSON.parse(state.storage.get(equipmentKey)!);
const cachedProfile = (): HaccpRoutineProfile => JSON.parse(state.storage.get(profileKey)!);

beforeEach(() => {
  state.storage.clear(); state.rows = {}; state.stale = {}; state.online = false;
  state.throwNetwork = false; state.rejectRead = false; state.rejectWrite = false; state.holdWrite = null;
});

describe('HACCP routine recovery', () => {
  it('accepts later cloud edits after acknowledgement even if this device clock was ahead', async () => {
    state.storage.set(equipmentKey, JSON.stringify([{ ...draft, updatedAt: '2099-01-01T00:00:00Z', syncState: 'synced' }]));
    state.storage.set(profileKey, JSON.stringify({ ...changedProfile(), updatedAt: '2099-01-01T00:00:00Z', syncState: 'synced' }));
    state.online = true;
    state.rows.haccp_equipment = [{ ...remoteEquipment, name: 'Later cloud edit' }];
    state.rows.haccp_routine_profiles = [{ ...remoteProfile, responsible_name: 'Later cloud operator' }];
    expect((await listHaccpEquipment(userId))[0].name).toBe('Later cloud edit');
    expect((await loadHaccpProfile(userId)).responsibleName).toBe('Later cloud operator');
  });

  it('replays an offline safety threshold before reading older cloud equipment', async () => {
    state.rows.haccp_equipment = [remoteEquipment];
    await saveHaccpEquipment(userId, draft);
    state.online = true;
    const loaded = await listHaccpEquipment(userId);
    expect(loaded[0]).toMatchObject({ name: draft.name, criticalMax: 3, syncState: 'synced' });
    expect(state.rows.haccp_equipment[0]).toMatchObject({ name: draft.name, critical_max: 3 });
  });

  it('keeps an acknowledged edit if the subsequent cloud read is stale', async () => {
    await saveHaccpEquipment(userId, draft);
    state.online = true;
    state.stale.haccp_equipment = [remoteEquipment];
    expect((await listHaccpEquipment(userId))[0].criticalMax).toBe(3);
    expect(cachedEquipment()[0].criticalMax).toBe(3);
  });

  it('replays an offline profile and retains it against a stale cloud read', async () => {
    await saveHaccpProfile(userId, changedProfile());
    state.online = true;
    state.rows.haccp_routine_profiles = [remoteProfile];
    state.stale.haccp_routine_profiles = [remoteProfile];
    expect(await loadHaccpProfile(userId)).toMatchObject({ responsibleName: 'New operator', shiftStartTime: '09:00', syncState: 'synced' });
    expect(state.rows.haccp_routine_profiles[0]).toMatchObject({ responsible_name: 'New operator', shift_start_time: '09:00' });
  });

  it('persists an offline deactivation until replay succeeds, without reseeding defaults', async () => {
    state.online = true; state.rows.haccp_equipment = [remoteEquipment];
    const [existing] = await listHaccpEquipment(userId);
    state.online = false;
    await deactivateHaccpEquipment(userId, existing);
    expect(cachedEquipment()).toEqual([expect.objectContaining({ id: existing.id, active: false, syncState: 'pending' })]);
    expect(await listHaccpEquipment(userId)).toEqual([]);
    state.online = true;
    state.stale.haccp_equipment = [remoteEquipment];
    expect(await listHaccpEquipment(userId)).toEqual([]);
    expect(state.rows.haccp_equipment[0].active).toBe(false);
    expect(cachedEquipment()[0].syncState).toBe('synced');
  });

  it('keeps both simultaneous offline equipment saves', async () => {
    await Promise.all([saveHaccpEquipment(userId, draft), saveHaccpEquipment(userId, { ...draft, id: 'second' })]);
    expect(cachedEquipment().map((item) => item.id).sort()).toEqual(['fridge', 'second']);
  });

  it('serializes profile acknowledgements so the later save remains durable', async () => {
    state.online = true;
    let release!: () => void;
    let started!: () => void;
    const didStart = new Promise<void>((resolve) => { started = resolve; });
    const paused = new Promise<void>((resolve) => { release = resolve; });
    state.holdWrite = () => { started(); return paused; };
    const first = saveHaccpProfile(userId, { ...changedProfile(), responsibleName: 'First' });
    await didStart;
    const second = saveHaccpProfile(userId, { ...changedProfile(), responsibleName: 'Second' });
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    release();
    await Promise.all([first, second]);
    expect(cachedProfile().responsibleName).toBe('Second');
    expect(state.rows.haccp_routine_profiles[0].responsible_name).toBe('Second');
  });

  it('keeps durable pending equipment and profile after rejected network promises', async () => {
    state.throwNetwork = true;
    await expect(saveHaccpEquipment(userId, draft)).resolves.toMatchObject({ syncState: 'pending' });
    await expect(saveHaccpProfile(userId, changedProfile())).resolves.toMatchObject({ syncState: 'pending' });
    expect((await listHaccpEquipment(userId))[0].criticalMax).toBe(3);
    expect((await loadHaccpProfile(userId)).responsibleName).toBe('New operator');
  });

  it.each(['[{broken', '{}', '[{"id":"irreplaceable"}]'])('preserves corrupt equipment cache %s on reads and saves', async (raw) => {
    state.storage.set(equipmentKey, raw);
    await expect(listHaccpEquipment(userId)).rejects.toThrow();
    await expect(saveHaccpEquipment(userId, draft)).rejects.toThrow();
    expect(state.storage.get(equipmentKey)).toBe(raw);
    expect(state.rows).toEqual({});
  });

  it.each(['{broken', '[]', '{"responsibleName":"irreplaceable"}'])('preserves corrupt profile cache %s on reads and saves', async (raw) => {
    state.storage.set(profileKey, raw);
    await expect(loadHaccpProfile(userId)).rejects.toThrow();
    await expect(saveHaccpProfile(userId, changedProfile())).rejects.toThrow();
    expect(state.storage.get(profileKey)).toBe(raw);
    expect(state.rows).toEqual({});
  });

  it('does not overwrite a profile after a cache read failure', async () => {
    state.storage.set(profileKey, JSON.stringify(changedProfile()));
    state.rejectRead = true;
    await expect(saveHaccpProfile(userId, { ...changedProfile(), responsibleName: 'Replacement' })).rejects.toThrow('storage read failed');
    expect(cachedProfile().responsibleName).toBe('New operator');
  });

  it('fails before uploading when the durable pending write is rejected', async () => {
    state.online = true; state.rejectWrite = true;
    await expect(saveHaccpEquipment(userId, draft)).rejects.toThrow('storage write failed');
    await expect(saveHaccpProfile(userId, changedProfile())).rejects.toThrow('storage write failed');
    expect(state.rows).toEqual({});
  });
});
