/**
 * MANAGER 24/7™ by PARADIM — proprietary software.
 * Copyright © 2026 PARADIM Operations SRL. All rights reserved.
 * Concept author and product director: Marius Paul Nemeșu.
 * See LICENSE-PROPRIETARY.md.
 */

import readXlsxFile from 'read-excel-file/universal';

import { normalizeText, similarity } from '@/lib/price-import';
import { normalizeQuantity } from '@/lib/calculations';
import { recalculateOperationalLine } from '@/lib/operations';
import type { OperationalLine } from '@/types/operations';
import type { CatalogIngredient, QuantityUnit } from '@/types/recipe';

export type ConsumptionImportIssue = 'missing_name' | 'invalid_quantity' | 'invalid_unit' | 'invalid_price'
  | 'missing_unit' | 'missing_price' | 'incompatible_unit';

export type ParsedConsumptionRow = {
  name: string;
  quantity: number | null;
  unit: QuantityUnit | null;
  unitPrice: number | null;
  rowNumber: number;
  raw: { name: string; quantity: string; unit: string; unitPrice: string };
  issues: ConsumptionImportIssue[];
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
      rows.push(row);
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

function nonnegativeNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) && value >= 0 ? value : null;
  const normalized = String(value ?? '').trim();
  if (!/^\d+(?:[.,]\d+)?$/.test(normalized)) return null;
  const parsed = Number(normalized.replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
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

function parseRow(nameValue: unknown, quantityValue: unknown, unitValue: unknown, priceValue: unknown, rowNumber: number): ParsedConsumptionRow {
  const raw = { name: String(nameValue ?? ''), quantity: String(quantityValue ?? ''), unit: String(unitValue ?? ''), unitPrice: String(priceValue ?? '') };
  const name = raw.name.trim();
  const parsedQuantity = nonnegativeNumber(quantityValue);
  const quantity = parsedQuantity !== null && parsedQuantity > 0 ? parsedQuantity : null;
  const unit = parseQuantityUnit(unitValue);
  const unitPrice = nonnegativeNumber(priceValue);
  const issues: ConsumptionImportIssue[] = [];
  if (!name) issues.push('missing_name');
  if (quantity === null) issues.push('invalid_quantity');
  if (raw.unit.trim() && unit === null) issues.push('invalid_unit');
  if (raw.unitPrice.trim() && unitPrice === null) issues.push('invalid_price');
  return { name, quantity, unit, unitPrice, rowNumber, raw, issues };
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
    return [parseRow(row.name ?? row.ingredient, row.quantity ?? row.qty, row.unit ?? row.uom,
      row.unitPrice ?? row.unit_price ?? row.price, index + 1)];
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
      if (!row.some(value => String(value ?? '').trim())) return [];
      return [parseRow(row[nameIndex], row[quantityIndex], unitIndex >= 0 ? row[unitIndex] : null,
        priceIndex >= 0 ? row[priceIndex] : null, rowIndex + offset + 2)];
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
    if (row.issues.length || row.quantity === null) {
      unresolved.push(row);
      continue;
    }
    const matched = matchCatalog(row.name, catalog);
    const unit = row.unit ?? matched?.priceUnit ?? null;
    const unitPrice = row.unitPrice ?? matched?.purchasePrice ?? null;
    const issues: ConsumptionImportIssue[] = [];
    if (!unit) issues.push('missing_unit');
    if (unitPrice === null) issues.push('missing_price');
    else if (!Number.isFinite(unitPrice) || unitPrice < 0) issues.push('invalid_price');
    if (!unit || unitPrice === null || issues.length) {
      unresolved.push({ ...row, issues });
      continue;
    }
    const priceUnit = matched?.priceUnit ?? (unit === 'g' ? 'kg' : unit === 'ml' ? 'l' : unit);
    if (normalizeQuantity(row.quantity, unit, priceUnit) === null) {
      unresolved.push({ ...row, issues: ['incompatible_unit'] });
      continue;
    }
    lines.push(recalculateOperationalLine({
      id: `import-${row.rowNumber}-${Math.random().toString(36).slice(2, 8)}`,
      catalogId: matched?.id ?? null,
      name: matched?.name ?? row.name,
      quantity: row.quantity,
      unit,
      purchasePrice: unitPrice,
      priceUnit,
      cost: 0,
    }));
  }
  return { lines, unresolved, totalRows: rows.length };
}
