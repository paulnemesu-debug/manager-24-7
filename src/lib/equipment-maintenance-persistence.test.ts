import { beforeEach, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({
    storage: new Map<string, string>(), failSuccessor: false
}));
vi.mock('@react-native-async-storage/async-storage', () => ({
    default: {
        getItem: async (k: string) => state.storage.get(k) ?? null, setItem: async (k: string, v: string) => {
            if (state.failSuccessor && v.includes('maintenance-next-')) {
                state.failSuccessor = false;
                throw Error('disk failure');
            }
            state.storage.set(k, v);
        }
    }
}));
vi.mock('@/lib/supabase', () => ({
    isDemoMode: true, isSupabaseConfigured: false, supabase: null
}));
vi.mock('@/lib/haccp-routine-repository', () => ({
    listHaccpEquipmentRegistry: async () => []
}));
import { emptyAsset, emptyMaintenance, loadEquipmentRegistry, loadMaintenance, saveEquipment, saveMaintenance, finishMaintenance, resolveMaintenance } from './equipment-maintenance';
beforeEach(() => {
    state.storage.clear();
    state.failSuccessor = false;
});
it('keeps two owners isolated and fails closed preserving corrupt bytes', async () => {
    const a = {
        ...emptyAsset(), name: 'Mixer'
    };
    await saveEquipment('one', a);
    expect(await loadEquipmentRegistry('two')).toEqual([]);
    expect(await loadEquipmentRegistry('one')).toHaveLength(1);
    state.storage.set('manager247.asset-profiles.v1.two', 'bad bytes');
    await expect(loadEquipmentRegistry('two')).rejects.toThrow();
    expect(state.storage.get('manager247.asset-profiles.v1.two')).toBe('bad bytes');
});
it('rejects unknown equipment without writing maintenance', async () => {
    await expect(saveMaintenance('one', {
        ...emptyMaintenance('missing'), title: 'Clean', responsible: 'Ana', dueDate: '2026-11-01'
    })).rejects.toThrow();
    expect(state.storage.has('manager247.maintenance-entries.v1.one')).toBe(false);
});
it('serializes repeated completion, creates one recurrence, and protects completed history', async () => {
    const a = {
        ...emptyAsset(), name: 'Mixer'
    };
    await saveEquipment('one', a);
    const m = await saveMaintenance('one', {
        ...emptyMaintenance(a.id), title: 'Clean', responsible: 'Ana', dueDate: '2026-11-01', recurrenceDays: 7
    });
    await Promise.all([finishMaintenance('one', m, '2026-11-03', 1, 2), finishMaintenance('one', m, '2026-11-03', 1, 2)]);
    const all = await loadMaintenance('one');
    expect(all).toHaveLength(2);
    const done = all.find(e => e.id === m.id)!;
    expect(done.completedDate).toBe('2026-11-03');
    await expect(saveMaintenance('one', {
        ...done, title: 'Changed'
    })).rejects.toThrow();
});
it('repairs a failed successor write on retry without duplicating completion', async () => {
    const a = {
        ...emptyAsset(), name: 'Mixer'
    };
    await saveEquipment('one', a);
    const m = await saveMaintenance('one', {
        ...emptyMaintenance(a.id), title: 'Clean', responsible: 'Ana', dueDate: '2026-11-01', recurrenceDays: 7
    });
    state.failSuccessor = true;
    await expect(finishMaintenance('one', m, '2026-11-03', 1, 2)).rejects.toThrow('disk failure');
    expect(await loadMaintenance('one')).toHaveLength(1);
    await finishMaintenance('one', m, '2026-11-03', 1, 2);
    await finishMaintenance('one', m, '2026-11-03', 1, 2);
    expect(await loadMaintenance('one')).toHaveLength(2);
});
it('keeps completed remote maintenance conflict intact when local overwrite is requested', async () => {
    const draft = {
        ...emptyMaintenance('asset'), id: 'conflict', title: 'Repair', responsible: 'Ana', dueDate: '2026-11-01', syncState: 'conflict' as const,
        remoteConflict: {
            data: {
                ...emptyMaintenance('asset'), id: 'conflict', title: 'Repair', responsible: 'Ana', dueDate: '2026-11-01', completedDate: '2026-11-03', actualParts: 1, actualLabor: 2, actualTravel: 0, actualConsumables: 0
            }, version: 2, updated_at: '2026-11-03T00:00:00Z'
        }
    };
    const key = 'manager247.maintenance-entries.v1.one';
    state.storage.set(key, JSON.stringify([draft]));
    const original = state.storage.get(key);
    await expect(resolveMaintenance('one', 'conflict', 'local')).rejects.toThrow(/cloud|cloud/i);
    expect(state.storage.get(key)).toBe(original);
    const resolved = await resolveMaintenance('one', 'conflict', 'remote');
    expect(resolved[0]).toMatchObject({
        completedDate: '2026-11-03', syncState: 'synced'
    });
});
