import { describe, expect, it, vi } from 'vitest';
vi.mock('@/lib/operational-sync', () => ({
    createOperationalStore: () => ({})
}));
vi.mock('@/lib/haccp-routine-repository', () => ({
    listHaccpEquipmentRegistry: vi.fn()
}));
import { mergeEquipmentRegistry, normalizeAsset, normalizeMaintenance, completeMaintenance, maintenanceStatus } from './equipment-maintenance';
import { parseEquipmentTransfer, equipmentGrid, maintenanceGrid, equipmentPdf } from './equipment-maintenance-transfer';
const asset = {
    id: 'a', name: 'Mixer', available: true, brand: '', location: '', model: '', serial: '', provider: '', acquisitionDate: '', warrantyDate: '', manual: '', photo: '', notes: '', updatedAt: ''
};
const entry = {
    id: 'm', assetId: 'a', kind: 'repair' as const, title: 'Repair', responsible: 'Ana', dueDate: '2026-11-01', recurrenceDays: 7, completedDate: '', estimatedParts: 10, estimatedLabor: 20, estimatedTravel: 0, estimatedConsumables: 0, actualParts: null, actualLabor: null, actualTravel: null, actualConsumables: null, notes: '', updatedAt: ''
};
describe('equipment safety', () => {
    it('preserves HACCP identity and rename, excludes disabled profile availability', () => {
        const merged = mergeEquipmentRegistry([{
                id: 'a', name: 'New fridge', active: true
            }] as never, [{
                ...asset, available: false
            }]);
        expect(merged[0]).toMatchObject({
            id: 'a', name: 'New fridge', available: false, haccp: true
        });
    });
    it('rejects malformed dates, missing booleans and nonfinite costs', () => {
        expect(normalizeAsset({
            ...asset, available: 'yes'
        })).toBeNull();
        expect(normalizeMaintenance({
            ...entry, dueDate: '2026-02-30'
        })).toBeNull();
        expect(normalizeMaintenance({
            ...entry, estimatedParts: Infinity
        })).toBeNull();
    });
    it('never completes an overdue task and schedules recurrence only after explicit actual completion', () => {
        expect(maintenanceStatus(entry, '2026-11-03')).toBe('overdue');
        expect(() => completeMaintenance(entry, '', 1, 2)).toThrow();
        const result = completeMaintenance(entry, '2026-11-03', 3, 4);
        expect(result.completed.completedDate).toBe('2026-11-03');
        expect(result.next?.dueDate).toBe('2026-11-10');
        expect(result.next?.actualParts).toBeNull();
    });
    it('roundtrips templates without trusting sync identity and rejects whole invalid imports', () => {
        const grid = equipmentGrid([asset]);
        expect(parseEquipmentTransfer(grid).assets[0]).toMatchObject({
            name: 'Mixer'
        });
        grid.push([...grid[1]]);
        grid[2][3] = 'yes';
        expect(parseEquipmentTransfer(grid).errors.length).toBeGreaterThan(0);
        expect(parseEquipmentTransfer(grid).assets).toEqual([]);
    });
});
it('roundtrips maintenance breakdown and rejects executable numeric text or imported enums', () => {
    const grid = maintenanceGrid([entry]);
    expect(parseEquipmentTransfer(grid).entries[0]).toMatchObject({
        estimatedTravel: 0, actualConsumables: null
    });
    const bad = grid.map(r => [...r]);
    bad[1][bad[0].indexOf('estimatedTravel')] = '=1+1';
    expect(parseEquipmentTransfer(bad).entries).toEqual([]);
    expect(parseEquipmentTransfer(bad).errors).toHaveLength(1);
});
it('keeps deactivated HACCP identity unavailable without hiding maintenance history', () => {
    expect(mergeEquipmentRegistry([{
            id: 'a', name: 'Old fridge', active: false
        }] as never, [asset])[0]).toMatchObject({
        id: 'a', name: 'Old fridge', available: false, haccp: true
    });
});
it('bounds recurring identities across a long service history', () => {
    let task: import('@/types/equipment-maintenance').MaintenanceEntry = entry;
    for (let i = 0; i < 500; i++) {
        const result = completeMaintenance(task, task.dueDate, 0, 0);
        expect(result.next!.id.length).toBeLessThanOrEqual(160);
        task = result.next!;
    }
});
it('imports source completion as an unconfirmed draft while preserving supplied evidence', () => {
    const { completed } = completeMaintenance(entry, '2026-11-03', 1, 2, 3, 4);
    const imported = parseEquipmentTransfer(maintenanceGrid([completed]));
    expect(imported.errors).toEqual([]);
    expect(imported.entries[0]).toMatchObject({
        completedDate: '', actualParts: null, actualTravel: null
    });
    expect(imported.entries[0].notes).toContain('2026-11-03');
});

it('exports readable localized escaped PDF HTML',()=>{const html=equipmentPdf('Utilaje',equipmentGrid([{...asset,name:'<script>alert(1)</script>'}]),'ro');expect(html).toContain('MANAGER 24/7');expect(html).toContain('Denumire');expect(html).toContain('&lt;script&gt;');expect(html).not.toContain('<script>');const maintenance=equipmentPdf('Work',maintenanceGrid([entry]),'en');expect(maintenance).toContain('Estimated labor');expect(maintenance).toContain('20.00');});
