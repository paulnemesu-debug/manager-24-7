import { emptyAsset, emptyMaintenance, normalizeAsset, normalizeMaintenance } from './equipment-maintenance';
import { escapeOperationsHtml } from './operations-transfer';
import type { EquipmentAsset, MaintenanceEntry } from '@/types/equipment-maintenance';
type Cell = string | number | boolean | null;
const assetKeys = ['id', 'name', 'available', 'brand', 'location', 'model', 'serial', 'provider', 'acquisitionDate', 'warrantyDate', 'manual', 'photo', 'notes'] as const;
const maintenanceKeys = ['id', 'assetId', 'kind', 'title', 'responsible', 'dueDate', 'recurrenceDays', 'completedDate', 'estimatedParts', 'estimatedLabor', 'estimatedTravel', 'estimatedConsumables', 'actualParts', 'actualLabor', 'actualTravel', 'actualConsumables', 'notes'] as const;
export const equipmentGrid = (items: readonly EquipmentAsset[]): Cell[][] => [['equipment-v1', ...assetKeys], ...items.map(a => ['equipment-v1', ...assetKeys.map(k => a[k])])];
export const maintenanceGrid = (items: readonly MaintenanceEntry[]): Cell[][] => [['maintenance-v1', ...maintenanceKeys], ...items.map(a => ['maintenance-v1', ...maintenanceKeys.map(k => a[k])])];
export function parseEquipmentTransfer(grid: unknown[][]): {
    assets: EquipmentAsset[];
    entries: MaintenanceEntry[];
    errors: string[];
} {
    const errors: string[] = [];
    const result: {
        assets: EquipmentAsset[];
        entries: MaintenanceEntry[];
        errors: string[];
    } = {
        assets: [], entries: [], errors
    };
    const mode = grid[0]?.[0];
    const keys = mode === 'equipment-v1' ? assetKeys : mode === 'maintenance-v1' ? maintenanceKeys : null;
    if (!keys || JSON.stringify(grid[0]) !== JSON.stringify([mode, ...keys]))
        return {
            ...result, errors: ['Invalid template / Șablon invalid']
        };
    const ids = new Set<string>();
    grid.slice(1).forEach((row, i) => {
        if (row.every(v => v === '' || v === null))
            return;
        try {
            if (row.length !== keys.length + 1 || row[0] !== mode)
                throw Error();
            const value: Record<string, unknown> = {
                ...(mode === 'equipment-v1' ? emptyAsset() : emptyMaintenance(''))
            };
            keys.forEach((key, j) => {
                const raw = row[j + 1];
                if (key === 'available') {
                    if (![true, false, 'true', 'false'].includes(raw as never))
                        throw Error();
                    value[key] = raw === true || raw === 'true';
                }
                else if (['recurrenceDays', 'estimatedParts', 'estimatedLabor', 'estimatedTravel', 'estimatedConsumables', 'actualParts', 'actualLabor', 'actualTravel', 'actualConsumables'].includes(key)) {
                    if ((raw === '' || raw === null) && key.startsWith('actual'))
                        value[key] = null;
                    else {
                        if (typeof raw !== 'number' && (typeof raw !== 'string' || !/^\d+(?:[.,]\d+)?$/.test(raw)))
                            throw Error();
                        value[key] = Number(String(raw).replace(',', '.'));
                    }
                }
                else {
                    if (typeof raw !== 'string')
                        throw Error();
                    value[key] = raw;
                }
            });
            const normalized = mode === 'equipment-v1' ? normalizeAsset(value) : normalizeMaintenance(value);
            if (!normalized || ids.has(normalized.id))
                throw Error();
            ids.add(normalized.id);
            if (mode === 'equipment-v1')
                result.assets.push(normalized as EquipmentAsset);
            else {
                const entry = normalized as MaintenanceEntry;
                const note = entry.completedDate ? `Imported source completion (unconfirmed): ${entry.completedDate}; parts ${entry.actualParts}; labor ${entry.actualLabor}; travel ${entry.actualTravel}; consumables ${entry.actualConsumables}.` : '';
                const notes = [entry.notes, note].filter(Boolean).join('\n');
                if (notes.length > 4000)
                    throw Error();
                result.entries.push({
                    ...entry, completedDate: '', actualParts: null, actualLabor: null, actualTravel: null, actualConsumables: null, notes
                });
            }
        }
        catch {
            errors.push(`Row / Rând ${i + 2}: invalid values / valori invalide`);
        }
    });
    if (errors.length) {
        result.assets = [];
        result.entries = [];
    }
    return result;
}
const labels: Record<string, [
    string,
    string
]> = {
    id: ['ID', 'ID'], name: ['Denumire', 'Name'], available: ['Disponibil', 'Available'], brand: ['Marcă', 'Brand'], location: ['Locație', 'Location'], model: ['Model', 'Model'], serial: ['Serie', 'Serial'], provider: ['Furnizor service', 'Service provider'], acquisitionDate: ['Data achiziției', 'Acquisition date'], warrantyDate: ['Garanție până la', 'Warranty until'], manual: ['URL / referință manual', 'Manual URL / reference'], photo: ['URL / referință foto', 'Photo URL / reference'], notes: ['Note', 'Notes'], assetId: ['ID utilaj', 'Equipment ID'], kind: ['Tip lucrare', 'Task type'], title: ['Lucrare', 'Task'], responsible: ['Responsabil', 'Responsible'], dueDate: ['Scadență', 'Due date'], recurrenceDays: ['Recurență (zile)', 'Recurrence (days)'], completedDate: ['Data finalizării', 'Completion date'], estimatedParts: ['Piese estimate', 'Estimated parts'], estimatedLabor: ['Manoperă estimată', 'Estimated labor'], estimatedTravel: ['Deplasare estimată', 'Estimated travel'], estimatedConsumables: ['Consumabile estimate', 'Estimated consumables'], actualParts: ['Cost efectiv piese', 'Actual parts cost'], actualLabor: ['Cost efectiv manoperă', 'Actual labor cost'], actualTravel: ['Cost efectiv deplasare', 'Actual travel cost'], actualConsumables: ['Cost efectiv consumabile', 'Actual consumables cost']
};
export function equipmentPdf(title: string, grid: Cell[][], locale: 'ro' | 'en' = 'ro') {
    const headers = grid[0] ?? [];
    const lang = locale === 'ro' ? 0 : 1;
    const kinds: Record<string, [
        string,
        string
    ]> = {
        cleaning: ['Curățare', 'Cleaning'], upkeep: ['Întreținere', 'Upkeep'], preventive: ['Mentenanță preventivă', 'Preventive maintenance'], repair: ['Reparație', 'Repair']
    };
    const display = (key: string, value: Cell) => typeof value === 'boolean' ? (value ? (lang === 0 ? 'Da' : 'Yes') : (lang === 0 ? 'Nu' : 'No')) : key === 'kind' ? (kinds[String(value)]?.[lang] ?? value) : typeof value === 'number' && (key.startsWith('estimated') || key.startsWith('actual')) ? value.toLocaleString(locale === 'ro' ? 'ro-RO' : 'en-GB', {
        minimumFractionDigits: 2, maximumFractionDigits: 2
    }) : value ?? '';
    return `<html><head><meta charset="utf-8"><style>@page{size:A4;margin:16mm}body{font:13px sans-serif;color:#172b40}table{border-collapse:collapse;width:100%;margin:12px 0 24px}td,th{border:1px solid #aaa;padding:7px;overflow-wrap:anywhere;text-align:left}th{width:36%}tr{page-break-inside:avoid}</style></head><body><p>MANAGER 24/7™ by PARADIM</p><h1>${escapeOperationsHtml(title)}</h1>${grid.slice(1).map(r => `<table>${r.slice(1).map((c, i) => {
        const key = String(headers[i + 1]);
        return `<tr><th>${escapeOperationsHtml(labels[key]?.[lang] ?? key)}</th><td>${escapeOperationsHtml(display(key, c))}</td></tr>`;
    }).join('')}</table>`).join('')}</body></html>`;
}
