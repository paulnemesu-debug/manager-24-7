import { withStorageLock } from '@/lib/storage-lock';
import { createOperationalStore } from '@/lib/operational-sync';
import { listHaccpEquipmentRegistry } from '@/lib/haccp-routine-repository';
import { isIsoDate } from '@/lib/local-date-time';
import type { HaccpEquipment } from '@/types/haccp-routine';
import type { EquipmentAsset, MaintenanceEntry } from '@/types/equipment-maintenance';
export const equipmentId = () => `asset-${Date.now()}-${Math.random().toString(36).slice(2)}`;
export const emptyAsset = (): EquipmentAsset => ({
    id: equipmentId(), name: '', available: true, brand: '', location: '', model: '', serial: '', provider: '', acquisitionDate: '', warrantyDate: '', manual: '', photo: '', notes: '', updatedAt: ''
});
export const emptyMaintenance = (assetId: string): MaintenanceEntry => ({
    id: equipmentId(), assetId, kind: 'preventive', title: '', responsible: '', dueDate: '', recurrenceDays: 0, completedDate: '', estimatedParts: 0, estimatedLabor: 0, estimatedTravel: 0, estimatedConsumables: 0, actualParts: null, actualLabor: null, actualTravel: null, actualConsumables: null, notes: '', updatedAt: ''
});
const text = (v: unknown, max = 4000) => typeof v === 'string' && v.length <= max;
const date = (v: unknown) => v === '' || (typeof v === 'string' && isIsoDate(v));
const cost = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v >= 0;
export function normalizeAsset(value: unknown): EquipmentAsset | null {
    if (!value || typeof value !== 'object')
        return null;
    const a = value as EquipmentAsset;
    if (!text(a.id, 160) || !a.id || !text(a.name, 200) || !a.name.trim() || typeof a.available !== 'boolean' || !['brand', 'location', 'model', 'serial', 'provider', 'manual', 'photo', 'notes', 'updatedAt'].every(k => text(a[k as keyof EquipmentAsset])) || !date(a.acquisitionDate) || !date(a.warrantyDate))
        return null;
    return {
        ...a
    };
}
export function normalizeMaintenance(value: unknown): MaintenanceEntry | null {
    if (!value || typeof value !== 'object')
        return null;
    const a = value as MaintenanceEntry;
    if (!text(a.id, 160) || !a.id || !text(a.assetId, 160) || !a.assetId || !text(a.title, 200) || !a.title.trim() || !text(a.responsible, 200) || !a.responsible.trim() || !text(a.notes) || !text(a.updatedAt) || !['cleaning', 'upkeep', 'preventive', 'repair'].includes(a.kind) || !isIsoDate(a.dueDate) || !date(a.completedDate) || !Number.isSafeInteger(a.recurrenceDays) || a.recurrenceDays < 0 || a.recurrenceDays > 36500 || ![a.estimatedParts, a.estimatedLabor, a.estimatedTravel, a.estimatedConsumables].every(cost) || ![a.actualParts, a.actualLabor, a.actualTravel, a.actualConsumables].every(v => v === null || cost(v)) || (a.completedDate && [a.actualParts, a.actualLabor, a.actualTravel, a.actualConsumables].some(v => v === null)))
        return null;
    return {
        ...a
    };
}
const assets = createOperationalStore<EquipmentAsset>({
    key: u => `manager247.asset-profiles.v1.${u}`, table: 'asset_profiles', id: a => a.id, normalize: normalizeAsset
});
const entries = createOperationalStore<MaintenanceEntry>({
    key: u => `manager247.maintenance-entries.v1.${u}`, table: 'maintenance_entries', id: a => a.id, normalize: normalizeMaintenance
});
export function mergeEquipmentRegistry(haccp: readonly HaccpEquipment[], profiles: readonly EquipmentAsset[]): EquipmentAsset[] {
    const merged = new Map(profiles.map(a => [a.id, {
            ...a, haccp: false
        }]));
    for (const h of haccp) {
        const p = merged.get(h.id);
        merged.set(h.id, {
            ...emptyAsset(), ...p, id: h.id, name: h.name, available: h.active && (p?.available ?? true), haccp: true
        });
    }
    return [...merged.values()];
}
export async function loadEquipmentRegistry(userId: string): Promise<EquipmentAsset[]> {
    const [h, p] = await Promise.all([listHaccpEquipmentRegistry(userId), assets.load(userId)]);
    return mergeEquipmentRegistry(h, p);
}
export const loadMaintenance = entries.load;
export const resolveEquipment = assets.resolve;
export function resolveMaintenance(userId:string,id:string,choice:'local'|'remote') {
    return withStorageLock(`maintenance-actions.${userId}`,async()=>{
        const item=(await entries.cached(userId)).find(entry=>entry.id===id);
        if(choice==='local' && item?.remoteConflict?.data.completedDate) {
            throw Error('Lucrarea este finalizată în cloud. Folosiți versiunea cloud; înregistrați o lucrare nouă pentru corecții. / This task is completed in the cloud. Use the cloud version; record a new task for corrections.');
        }
        return entries.resolve(userId,id,choice);
    });
}
export async function saveEquipment(userId: string, a: EquipmentAsset) {
    if (!normalizeAsset(a))
        throw Error('Invalid equipment / Utilaj invalid');
    return assets.save(userId, a);
}
async function saveMaintenanceUnlocked(userId: string, a: MaintenanceEntry) {
    if (!normalizeMaintenance(a))
        throw Error('Invalid maintenance / Mentenanță invalidă');
    const registry = await loadEquipmentRegistry(userId);
    if (!registry.some(e => e.id === a.assetId))
        throw Error('Unknown equipment / Utilaj necunoscut');
    const old = (await entries.cached(userId)).find(e => e.id === a.id);
    if (old?.completedDate)
        throw Error('Completed history is immutable / Istoricul finalizat nu poate fi modificat');
    return entries.save(userId, a);
}
export function saveMaintenance(userId: string, a: MaintenanceEntry) {
    return withStorageLock(`maintenance-actions.${userId}`, () => saveMaintenanceUnlocked(userId, a));
}
/** Completion and recurrence are serialized; a deterministic successor ID makes retries safe. */
export function finishMaintenance(userId: string, a: MaintenanceEntry, actualDate: string, parts: number, labor: number, travel = 0, consumables = 0) {
    return withStorageLock(`maintenance-actions.${userId}`, async () => {
        const current = (await entries.cached(userId)).find(e => e.id === a.id);
        if (current?.syncState === 'conflict') throw Error('Resolve cloud conflict first / Rezolvați conflictul cloud');
        if (current?.completedDate) {
            const { next } = completeMaintenance({
                ...current, completedDate: '', actualParts: null, actualLabor: null
            }, current.completedDate, current.actualParts!, current.actualLabor!, current.actualTravel!, current.actualConsumables!);
            if (next && !(await entries.cached(userId)).some(e => e.id === next.id))
                await saveMaintenanceUnlocked(userId, next);
            return current;
        }
        const { completed, next } = completeMaintenance(a, actualDate, parts, labor, travel, consumables);
        const saved = await saveMaintenanceUnlocked(userId, completed);
        if (saved.syncState === 'conflict')
            return saved;
        if (next && !(await entries.cached(userId)).some(e => e.id === next.id))
            await saveMaintenanceUnlocked(userId, next);
        return saved;
    });
}
export const maintenanceStatus = (a: MaintenanceEntry, today: string) => a.completedDate ? 'completed' : a.dueDate < today ? 'overdue' : 'scheduled';
export function completeMaintenance(a: MaintenanceEntry, actualDate: string, parts: number, labor: number, travel = 0, consumables = 0) {
    if (a.completedDate || !isIsoDate(actualDate) || ![parts, labor, travel, consumables].every(cost))
        throw Error('Actual date and costs required / Data și costurile efective sunt obligatorii');
    const completed = {
        ...a, completedDate: actualDate, actualParts: parts, actualLabor: labor, actualTravel: travel, actualConsumables: consumables
    };
    const next = a.recurrenceDays ? {
        ...a, id: recurrenceId(a.id, actualDate), dueDate: new Date(Date.parse(`${actualDate}T00:00:00Z`) + a.recurrenceDays * 86400000).toISOString().slice(0, 10), completedDate: '', actualParts: null, actualLabor: null, actualTravel: null, actualConsumables: null, serverVersion: undefined, syncState: undefined, remoteConflict: undefined
    } : null;
    return {
        completed, next
    };
}
function recurrenceId(id: string, date: string) {
    let hash = 14695981039346656037n;
    for (const c of `${id}:${date}`) {
        hash ^= BigInt(c.codePointAt(0)!);
        hash = BigInt.asUintN(64, hash * 1099511628211n);
    }
    return `maintenance-next-${hash.toString(16)}-${date}`;
}
