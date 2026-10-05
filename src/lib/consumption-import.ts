/**
 * MANAGER 24/7™ by PARADIM — proprietary software.
 * Copyright © 2026 PARADIM Operations SRL. All rights reserved.
 * Concept author and product director: Marius Paul Nemeșu.
 * See LICENSE-PROPRIETARY.md.
 */

import readXlsxFile from 'read-excel-file/universal';

import { normalizeText, parsePrice, similarity } from '@/lib/price-import';
import { recalculateOperationalLine } from '@/lib/operations';
import type { OperationalLine } from '@/types/operations';
import type { CatalogIngredient, QuantityUnit } from '@/types/recipe';

export type ParsedConsumptionRow = {
  name: string;
  quantity: number;
  unit: QuantityUnit | null;
  unitPrice: number | null;
  rowNumber: number;
};

export type ConsumptionImportPreview = {
  lines: OperationalLine[];
  unresolved: ParsedConsumptionRow[];
  totalRows: number;
};

const NAME_HEADERS = ['ingredient', 'materie', 'produs', 'articol', 'denumire', 'name', 'item', 'material'];
const QUANTITY_HEADERS = ['cantitate', 'consum', 'cant', 'qty', 'quantity', 'issued', 'eliberat'];
const UNIT_HEADERS = ['um', 'unitate', 'unit', 'uom', 'masura'];
const PRICE_HEADERS = ['pret', 'cost', 'unitar', 'price'];

function detectDelimiter(text: string) {
  const sample = text.split(/\r?\n/).slice(0, 10).join('\n');
  return [';', '\t', ',']
    .map((delimiter) => ({ delimiter, count: sample.split(delimiter).length - 1 }))
    .sort((a, b) => b.count - a.count)[0]?.delimiter ?? ',';
}

function parseDelimited(text: string): string[][] {
  const delimiter = detectDelimiter(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"') {
      if (quoted && text[index + 1] === '"') { cell += '"'; index += 1; }
      else quoted = !quoted;
    } else if (char === delimiter && !quoted) {
      row.push(cell); cell = '';
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && text[index + 1] === '\n') index += 1;
      row.push(cell);
      if (row.some((value) => value.trim())) rows.push(row);
      row = []; cell = '';
    } else cell += char;
  }
  row.push(cell);
  if (row.some((value) => value.trim())) rows.push(row);
  return rows;
}

function headerIndex(headers: unknown[], candidates: string[]) {
  return headers.findIndex((value) => {
    const normalized = normalizeText(String(value ?? ''));
    const words = normalized.split(' ');
    return candidates.some((candidate) => words.includes(candidate) || normalized === candidate);
  });
}

function positiveNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) && value > 0 ? value : null;
  const normalized = String(value ?? '').trim().replace(/\s/g, '').replace(',', '.').replace(/[^0-9.-]/g, '');
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function parseQuantityUnit(value: unknown): QuantityUnit | null {
  const normalized = normalizeText(String(value ?? ''));
  if (/^(g|gr|gram|grame)$/.test(normalized)) return 'g';
  if (/^(kg|kgr|kilogram|kilograme)$/.test(normalized)) return 'kg';
  if (/^(ml|mililitru|mililitri)$/.test(normalized)) return 'ml';
  if (/^(l|lt|litru|litri|liter)$/.test(normalized)) return 'l';
  if (/^(buc|bucata|bucati|pcs|piece|pieces)$/.test(normalized)) return 'buc';
  return null;
}

export function normalizeScannedConsumptionRows(value: unknown): ParsedConsumptionRow[] {
  const rows = Array.isArray(value)
    ? value
    : value && typeof value === 'object' && Array.isArray((value as { rows?: unknown }).rows)
      ? (value as { rows: unknown[] }).rows
      : [];
  return rows.slice(0, 200).flatMap((entry, index) => {
    if (!entry || typeof entry !== 'object') return [];
    const row = entry as Record<string, unknown>;
    const name = String(row.name ?? row.ingredient ?? '').trim().slice(0, 180);
    const quantity = positiveNumber(row.quantity ?? row.qty);
    if (!name || quantity === null) return [];
    return [{
      name,
      quantity,
      unit: parseQuantityUnit(row.unit ?? row.uom),
      unitPrice: positiveNumber(row.unitPrice ?? row.unit_price ?? row.price),
      rowNumber: index + 1,
    }];
  });
}

function parseGrid(grid: unknown[][]): ParsedConsumptionRow[] {
  for (let rowIndex = 0; rowIndex < Math.min(20, grid.length); rowIndex += 1) {
    const header = grid[rowIndex] ?? [];
    const nameIndex = headerIndex(header, NAME_HEADERS);
    const quantityIndex = headerIndex(header, QUANTITY_HEADERS);
    if (nameIndex < 0 || quantityIndex < 0) continue;
    const unitIndex = headerIndex(header, UNIT_HEADERS);
    const priceIndex = headerIndex(header, PRICE_HEADERS);
    return grid.slice(rowIndex + 1).flatMap((row, offset) => {
      const name = String(row[nameIndex] ?? '').trim();
      const quantity = positiveNumber(row[quantityIndex]);
      if (!name || quantity === null) return [];
      return [{
        name,
        quantity,
        unit: unitIndex >= 0 ? parseQuantityUnit(row[unitIndex]) : null,
        unitPrice: priceIndex >= 0 ? parsePrice(row[priceIndex]) : null,
        rowNumber: rowIndex + offset + 2,
      }];
    });
  }
  return [];
}

export async function parseConsumptionFile(data: string | ArrayBuffer): Promise<ParsedConsumptionRow[]> {
  const grids: unknown[][][] = typeof data === 'string'
    ? [parseDelimited(data)]
    : (await readXlsxFile(data)).map((sheet) => sheet.data);
  for (const grid of grids) {
    const rows = parseGrid(grid);
    if (rows.length) return rows;
  }
  return [];
}

function matchCatalog(name: string, catalog: readonly CatalogIngredient[]) {
  const exact = catalog.find((item) => normalizeText(item.name) === normalizeText(name));
  if (exact) return exact;
  const best = catalog
    .map((item) => ({ item, score: Math.max(similarity(item.name, name), similarity(name, item.name)) }))
    .sort((left, right) => right.score - left.score)[0];
  return best && best.score >= 0.64 ? best.item : null;
}

export function buildConsumptionImportPreview(
  rows: readonly ParsedConsumptionRow[],
  catalog: readonly CatalogIngredient[],
): ConsumptionImportPreview {
  const lines: OperationalLine[] = [];
  const unresolved: ParsedConsumptionRow[] = [];
  for (const row of rows) {
    const matched = matchCatalog(row.name, catalog);
    const unit = row.unit ?? matched?.priceUnit ?? null;
    const unitPrice = row.unitPrice ?? matched?.purchasePrice ?? null;
    if (!unit || unitPrice === null) {
      unresolved.push(row);
      continue;
    }
    lines.push(recalculateOperationalLine({
      id: `import-${row.rowNumber}-${Math.random().toString(36).slice(2, 8)}`,
      catalogId: matched?.id ?? null,
      name: matched?.name ?? row.name,
      quantity: row.quantity,
      unit,
      purchasePrice: unitPrice,
      priceUnit: matched?.priceUnit ?? (unit === 'g' ? 'kg' : unit === 'ml' ? 'l' : unit),
      cost: 0,
    }));
  }
  return { lines, unresolved, totalRows: rows.length };
}
