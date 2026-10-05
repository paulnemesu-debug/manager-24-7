/**
 * MANAGER 24/7™ by PARADIM — proprietary software.
 * Copyright © 2026 PARADIM Operations SRL. All rights reserved.
 * Concept author and product director: Marius Paul Nemeșu.
 * See LICENSE-PROPRIETARY.md.
 */

import readXlsxFile from 'read-excel-file/universal';

import { normalizeText, similarity } from '@/lib/price-import';
import type { Recipe } from '@/types/recipe';

export type ParsedSaleRow = { name: string; sold: number; rowNumber: number };
export type MatchedSaleRow = { row: ParsedSaleRow; recipe: Recipe; score: number };
export type SalesImportPreview = {
  matches: MatchedSaleRow[];
  unmatched: ParsedSaleRow[];
  totalRows: number;
};

const NAME_HEADERS = ['preparat', 'produs', 'articol', 'denumire', 'item', 'name', 'product'];
const SOLD_HEADERS = ['cantitate', 'vandut', 'vandute', 'vanzari', 'bucati', 'portii', 'portions', 'qty', 'quantity', 'sold', 'sales'];

function detectDelimiter(text: string) {
  const sample = text.split(/\r?\n/).slice(0, 10).join('\n');
  const options = [';', '\t', ','].map((delimiter) => ({
    delimiter,
    count: sample.split(delimiter).length - 1,
  }));
  return options.sort((a, b) => b.count - a.count)[0]?.delimiter ?? ',';
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

export function parseSalesNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) && value >= 0 ? value : null;
  const cleaned = String(value ?? '').trim().replace(/[\s'’]/g, '').replace(/[^0-9,.-]/g, '');
  if (!cleaned || cleaned === '-' || cleaned.startsWith('-')) return null;
  const comma = cleaned.lastIndexOf(',');
  const dot = cleaned.lastIndexOf('.');
  let normalized = cleaned;
  if (comma >= 0 && dot >= 0) {
    const decimal = comma > dot ? ',' : '.';
    const grouping = decimal === ',' ? /\./g : /,/g;
    normalized = cleaned.replace(grouping, '').replace(decimal, '.');
  } else {
    const separator = comma >= 0 ? ',' : dot >= 0 ? '.' : null;
    if (separator) {
      const pieces = cleaned.split(separator);
      const last = pieces.at(-1) ?? '';
      const looksGrouped = last.length === 3 && pieces.length >= 2
        && pieces.slice(1).every((piece) => piece.length === 3);
      normalized = looksGrouped ? pieces.join('') : `${pieces.slice(0, -1).join('')}.${last}`;
    }
  }
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function headerIndex(headers: unknown[], candidates: string[]) {
  return headers.findIndex((header) => {
    const normalized = normalizeText(String(header ?? ''));
    const words = normalized.split(' ');
    return candidates.some((candidate) => words.includes(candidate) || normalized === candidate);
  });
}

function parseGrid(grid: unknown[][]): ParsedSaleRow[] {
  for (let rowIndex = 0; rowIndex < Math.min(20, grid.length); rowIndex += 1) {
    const nameIndex = headerIndex(grid[rowIndex] ?? [], NAME_HEADERS);
    const soldIndex = headerIndex(grid[rowIndex] ?? [], SOLD_HEADERS);
    if (nameIndex < 0 || soldIndex < 0) continue;
    return grid.slice(rowIndex + 1).flatMap((row, offset) => {
      const name = String(row[nameIndex] ?? '').trim();
      const sold = parseSalesNumber(row[soldIndex]);
      return name && sold !== null ? [{ name, sold, rowNumber: rowIndex + offset + 2 }] : [];
    });
  }
  return [];
}

export async function parseSalesFile(data: string | ArrayBuffer): Promise<ParsedSaleRow[]> {
  const grids: unknown[][][] = typeof data === 'string'
    ? [parseDelimited(data)]
    : (await readXlsxFile(data)).map((sheet) => sheet.data);
  for (const grid of grids) {
    const parsed = parseGrid(grid);
    if (parsed.length) return parsed;
  }
  return [];
}

export function matchSalesRows(rows: readonly ParsedSaleRow[], recipes: readonly Recipe[]): SalesImportPreview {
  const sellable = recipes.filter((recipe) => !recipe.isSubRecipe);
  const matches: MatchedSaleRow[] = [];
  const unmatched: ParsedSaleRow[] = [];
  for (const row of rows) {
    const exact = sellable.find((recipe) => normalizeText(recipe.title) === normalizeText(row.name));
    const scored = exact
      ? { recipe: exact, score: 1 }
      : sellable
        .map((recipe) => ({ recipe, score: Math.max(similarity(recipe.title, row.name), similarity(row.name, recipe.title)) }))
        .sort((a, b) => b.score - a.score)[0];
    if (!scored || scored.score < 0.6) unmatched.push(row);
    else matches.push({ row, ...scored });
  }
  return { matches, unmatched, totalRows: rows.length };
}
