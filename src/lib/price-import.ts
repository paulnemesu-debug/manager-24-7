/**
 * MANAGER 24/7™ by PARADIM — proprietary software.
 * Copyright © 2026 PARADIM Operations SRL. All rights reserved.
 * Concept author and product director: Marius Paul Nemeșu.
 * See LICENSE-PROPRIETARY.md.
 */

import readXlsxFile from 'read-excel-file/universal';

import type { CatalogIngredient, PriceUnit } from '@/types/recipe';

export type ParsedPriceRow = {
  name: string;
  price: number;
  unit: PriceUnit | null;
  notes: string | null;
  rowNumber: number;
};

export type PriceMatch = {
  row: ParsedPriceRow;
  catalog: CatalogIngredient;
  currentPrice: number;
  newPrice: number;
  deltaPercent: number;
  score: number;
};

export type ImportResult = {
  matches: PriceMatch[];
  /** Rânduri fără potrivire în catalog și fără unitate sigură — nu pot fi adăugate automat. */
  unmatched: ParsedPriceRow[];
  /** Rânduri fără potrivire, dar cu unitate clară — pot fi adăugate ca ingrediente noi. */
  newItems: ParsedPriceRow[];
  totalRows: number;
};

const NAME_HEADERS = ['denumire', 'produs', 'articol', 'descriere', 'nume', 'name', 'description', 'item', 'material'];
const PRICE_HEADERS = ['pret', 'price', 'valoare', 'cost', 'unitar', 'net'];
const UNIT_HEADERS = ['um', 'u.m', 'unitate', 'unit', 'masura', 'uom'];
const NOTES_HEADERS = ['notes', 'note', 'observatii', 'observații', 'mentiuni', 'mențiuni'];
/** Antete care conțin „price"/„pret" dar nu sunt de fapt o coloană de preț. */
const PRICE_HEADER_EXCLUDE = ['data', 'date', 'mode', 'mod'];
/** Coloane de tip flag folosite în cataloagele curățate manual (ex. PARADIM/Metro). */
const IMPORT_FLAG_HEADERS = ['import'];
const CONFIDENCE_HEADERS = ['confidence', 'incredere', 'încredere'];

export function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function tokens(value: string): string[] {
  return normalizeText(value)
    .split(' ')
    .filter((token) => token.length > 1 && !/^\d+$/.test(token));
}

/** Acceptă atât „12,34" cât și „1.234,56" sau „1,234.56". */
export function parsePrice(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) && value > 0 ? value : null;
  if (typeof value !== 'string') return null;

  const cleaned = value.replace(/[^\d.,-]/g, '').trim();
  if (!cleaned) return null;

  const lastComma = cleaned.lastIndexOf(',');
  const lastDot = cleaned.lastIndexOf('.');
  let normalized: string;

  if (lastComma > lastDot) {
    normalized = cleaned.replace(/\./g, '').replace(',', '.');
  } else if (lastDot > lastComma) {
    normalized = cleaned.replace(/,/g, '');
  } else {
    normalized = cleaned.replace(',', '.');
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function parseUnit(value: unknown): PriceUnit | null {
  if (typeof value !== 'string') return null;
  const text = normalizeText(value);
  if (!text) return null;
  if (/^(kg|kilogram|kgr)$/.test(text) || text.includes('kilogram')) return 'kg';
  if (/^(l|lt|litru|litri|liter)$/.test(text)) return 'l';
  if (/^(buc|bucata|bucati|buc ata|pcs|piece|pieces|set|ea)$/.test(text)) return 'buc';
  return null;
}

/**
 * Caută coloana după antet. Potrivirea se face pe cuvinte întregi, altfel
 * un antet ca „Denumire produs" ar fi luat drept coloana de unitate de măsură,
 * pentru că textul conține „um".
 */
function findHeaderIndex(headers: string[], candidates: string[]): number {
  return headers.findIndex((header) => {
    const text = normalizeText(header);
    if (!text) return false;
    const words = text.split(' ');
    return candidates.some((candidate) => (
      words.includes(candidate)
      || (candidate.length >= 4 && text.includes(candidate))
    ));
  });
}

/** Ultima coloană care se potrivește cu o listă de antete candidate. */
function findLastHeaderIndex(headers: string[], candidates: string[]): number {
  const matches: number[] = [];
  headers.forEach((header, index) => {
    const text = normalizeText(header);
    if (!text) return;
    const words = text.split(' ');
    const isMatch = candidates.some((candidate) => (
      words.includes(candidate)
      || (candidate.length >= 4 && text.includes(candidate))
    ));
    if (isMatch) matches.push(index);
  });
  return matches.length ? matches[matches.length - 1] : -1;
}

/**
 * Coloana de preț, tratată separat de restul antetelor: unele fișiere de
 * furnizori au mai multe coloane care conțin cuvântul „price"/„pret" (ex.
 * „price_date", „price_mode"), care nu sunt prețul propriu-zis. Excludem
 * antetele evident greșite și, dacă rămân mai multe potriviri, alegem ultima
 * — coloanele calculate/finale de preț apar de regulă mai la dreapta decât
 * cele descriptive, într-un export tipic.
 */
function findPriceHeaderIndex(headers: string[]): number {
  const matches: number[] = [];
  headers.forEach((header, index) => {
    const text = normalizeText(header);
    if (!text) return;
    const words = text.split(' ');
    if (PRICE_HEADER_EXCLUDE.some((bad) => words.includes(bad))) return;
    const isMatch = PRICE_HEADERS.some((candidate) => (
      words.includes(candidate)
      || (candidate.length >= 4 && text.includes(candidate))
    ));
    if (isMatch) matches.push(index);
  });
  return matches.length ? matches[matches.length - 1] : -1;
}

/** Fișierele de la furnizori vin cu punct și virgulă, virgulă sau tab. */
function detectDelimiter(text: string): string {
  const sample = text.split(/\r?\n/).slice(0, 10).join('\n');
  const counts: Record<string, number> = {
    ';': (sample.match(/;/g) ?? []).length,
    '\t': (sample.match(/\t/g) ?? []).length,
    ',': (sample.match(/,/g) ?? []).length,
  };
  const [best] = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  return best && best[1] > 0 ? best[0] : ',';
}

/** Parser CSV mic, compatibil cu separatorii uzuali și câmpurile între ghilimele. */
function parseDelimitedText(text: string): unknown[][] {
  const delimiter = detectDelimiter(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"') {
      if (quoted && text[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === delimiter && !quoted) {
      row.push(cell);
      cell = '';
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && text[index + 1] === '\n') index += 1;
      row.push(cell);
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += char;
    }
  }

  row.push(cell);
  if (row.some((value) => value.trim())) rows.push(row);
  return rows;
}

function findHeaderRow(grid: unknown[][]): {
  headerRow: number;
  nameIndex: number;
  priceIndex: number;
  unitIndex: number;
  notesIndex: number;
  importFlagIndex: number;
  confidenceIndex: number;
} | null {
  for (let index = 0; index < Math.min(grid.length, 20); index += 1) {
    const headers = (grid[index] ?? []).map((cell) => String(cell ?? ''));
    const nameIndex = findHeaderIndex(headers, NAME_HEADERS);
    const priceIndex = findPriceHeaderIndex(headers);
    if (nameIndex >= 0 && priceIndex >= 0) {
      return {
        headerRow: index,
        nameIndex,
        priceIndex,
        unitIndex: findHeaderIndex(headers, UNIT_HEADERS),
        notesIndex: findLastHeaderIndex(headers, NOTES_HEADERS),
        importFlagIndex: findHeaderIndex(headers, IMPORT_FLAG_HEADERS),
        confidenceIndex: findHeaderIndex(headers, CONFIDENCE_HEADERS),
      };
    }
  }
  return null;
}

function extractRows(
  grid: unknown[][],
  headerRow: number,
  nameIndex: number,
  priceIndex: number,
  unitIndex: number,
  notesIndex = -1,
  importFlagIndex = -1,
  confidenceIndex = -1,
): ParsedPriceRow[] {
  const rows: ParsedPriceRow[] = [];
  for (let index = headerRow + 1; index < grid.length; index += 1) {
    const cells = grid[index] ?? [];

    // Cataloagele curățate manual (ex. PARADIM/Metro) marchează explicit ce
    // NU trebuie importat sau ce mai trebuie verificat — respectăm alegerea,
    // nu doar prezența unui preț pe rând.
    if (importFlagIndex >= 0) {
      const flag = String(cells[importFlagIndex] ?? '').trim().toUpperCase();
      if (flag === 'NU') continue;
    }
    if (confidenceIndex >= 0) {
      const confidence = String(cells[confidenceIndex] ?? '').trim().toLowerCase();
      if (confidence === 'check') continue;
    }

    const name = String(cells[nameIndex] ?? '').trim();
    const price = priceIndex >= 0
      ? parsePrice(cells[priceIndex])
      : cells.slice(1).map(parsePrice).find((value) => value !== null) ?? null;
    if (!name || price === null) continue;
    const notes = notesIndex >= 0 ? String(cells[notesIndex] ?? '').trim() || null : null;
    rows.push({
      name,
      price,
      unit: unitIndex >= 0 ? parseUnit(cells[unitIndex]) : null,
      notes,
      rowNumber: index + 1,
    });
  }
  return rows;
}

/**
 * Citește un fișier Metro (sau orice listă de prețuri) în format Excel sau CSV.
 * Un catalog curățat manual (ca cel din PARADIM) are de regulă mai multe foi —
 * una de parametri/TVA, una cu catalogul propriu-zis, una cu rânduri „de
 * verificat" excluse intenționat. Căutăm mai întâi, pe toate foile, un antet
 * recunoscut cert (nume + preț); ghicitul de coloane — folosit doar pentru
 * fișiere fără antet, ca un CSV simplu de la furnizor — se aplică abia dacă
 * nicio foaie nu are un antet real, altfel ar prinde greșit primul rând
 * numeric dintr-o foaie de parametri sau de note.
 */
export async function parsePriceList(data: ArrayBuffer | string): Promise<ParsedPriceRow[]> {
  const grids: unknown[][][] = typeof data === 'string'
    ? [parseDelimitedText(data)]
    : (await readXlsxFile(data)).map((sheet) => sheet.data);

  for (const grid of grids) {
    const found = findHeaderRow(grid);
    if (!found) continue;
    const rows = extractRows(
      grid,
      found.headerRow,
      found.nameIndex,
      found.priceIndex,
      found.unitIndex,
      found.notesIndex,
      found.importFlagIndex,
      found.confidenceIndex,
    );
    if (rows.length) return rows;
  }

  // Nicio foaie nu are un antet recunoscut — probabil un CSV fără cap de
  // tabel. Ghicim: prima coloană e denumirea, prima celulă numerică e prețul.
  const [firstGrid] = grids;
  return firstGrid ? extractRows(firstGrid, -1, 0, -1, -1) : [];
}

/** Cât de bine acoperă rândul din fișier denumirea din catalog (0…1). */
export function similarity(catalogName: string, rowName: string): number {
  const catalogTokens = tokens(catalogName);
  if (!catalogTokens.length) return 0;
  const rowTokens = new Set(tokens(rowName));
  const matched = catalogTokens.filter((token) => rowTokens.has(token)).length;
  return matched / catalogTokens.length;
}

export const MATCH_THRESHOLD = 0.6;

export function matchPriceList(
  rows: readonly ParsedPriceRow[],
  catalog: readonly CatalogIngredient[],
): ImportResult {
  const matches: PriceMatch[] = [];
  const usedCatalogIds = new Set<string>();
  const unmatched: ParsedPriceRow[] = [];
  const newItems: ParsedPriceRow[] = [];

  for (const row of rows) {
    let best: { entry: CatalogIngredient; score: number } | null = null;
    for (const entry of catalog) {
      if (usedCatalogIds.has(entry.id)) continue;
      const score = similarity(entry.name, row.name);
      if (score >= MATCH_THRESHOLD && (!best || score > best.score)) {
        best = { entry, score };
      }
    }

    if (!best) {
      // Fără potrivire în catalog: dacă rândul are o unitate clară (kg/l/buc),
      // e un candidat sigur de adăugat ca ingredient nou. Fără unitate, nu
      // putem ști cum se calculează costul, deci rămâne doar „neasociat".
      if (row.unit) newItems.push(row);
      else unmatched.push(row);
      continue;
    }

    // Prețul are sens doar dacă e exprimat în aceeași unitate ca în catalog.
    if (row.unit && row.unit !== best.entry.priceUnit) {
      unmatched.push(row);
      continue;
    }

    usedCatalogIds.add(best.entry.id);
    const currentPrice = best.entry.purchasePrice;
    matches.push({
      row,
      catalog: best.entry,
      currentPrice,
      newPrice: row.price,
      deltaPercent: currentPrice > 0
        ? Math.round(((row.price - currentPrice) / currentPrice) * 1000) / 10
        : 0,
      score: best.score,
    });
  }

  return { matches, unmatched, newItems, totalRows: rows.length };
}
