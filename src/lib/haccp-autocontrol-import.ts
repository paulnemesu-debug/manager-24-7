/**
 * MANAGER 24/7™ by PARADIM — proprietary software.
 * Copyright © 2026 PARADIM Operations SRL. All rights reserved.
 * Concept author and product director: Marius Paul Nemeșu.
 * See LICENSE-PROPRIETARY.md.
 */

import readXlsxFile from 'read-excel-file/universal';

import { combineLocalDateTime, isIsoDate, isIsoTime, localIsoDate } from '@/lib/local-date-time';
import type { HaccpAutocontrolDraft, HaccpAutocontrolStatus, HaccpAutocontrolType } from '@/types/haccp-autocontrol';

const TYPE_HEADERS = ['tip', 'categorie', 'control', 'autocontrol', 'type'];
const TITLE_HEADERS = ['denumire', 'activitate', 'test', 'proba', 'probă', 'titlu', 'title'];
const DATE_HEADERS = ['data', 'date', 'data programata', 'data programată', 'scheduled date'];
const TIME_HEADERS = ['ora', 'time', 'ora programata', 'ora programată', 'scheduled time'];
const REMINDER_DATE_HEADERS = ['data reamintire', 'data alerta', 'reminder date'];
const REMINDER_TIME_HEADERS = ['ora reamintire', 'ora alerta', 'reminder time'];

function normalize(value: unknown) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function exactHeader(headers: string[], candidates: string[]) {
  const normalizedCandidates = candidates.map(normalize);
  return headers.findIndex((header) => normalizedCandidates.includes(normalize(header)));
}

function containsHeader(headers: string[], candidates: string[]) {
  const normalizedCandidates = candidates.map(normalize);
  return headers.findIndex((header) => {
    const value = normalize(header);
    return normalizedCandidates.some((candidate) => value === candidate || value.includes(candidate));
  });
}

function detectDelimiter(text: string) {
  const sample = text.split(/\r?\n/).slice(0, 10).join('\n');
  const entries = [';', '\t', ','].map((delimiter) => [delimiter, sample.split(delimiter).length - 1] as const);
  return entries.sort((left, right) => right[1] - left[1])[0]?.[0] ?? ',';
}

function parseDelimited(text: string): unknown[][] {
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
      if (row.some((entry) => entry.trim())) rows.push(row);
      row = []; cell = '';
    } else cell += char;
  }
  row.push(cell);
  if (row.some((entry) => entry.trim())) rows.push(row);
  return rows;
}

function dateValue(value: unknown): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return localIsoDate(value);
  if (typeof value === 'number' && value > 20_000 && value < 100_000) {
    const excelEpoch = new Date(Date.UTC(1899, 11, 30));
    const parsed = new Date(excelEpoch.getTime() + value * 86_400_000);
    return parsed.toISOString().slice(0, 10);
  }
  const raw = String(value ?? '').trim();
  if (isIsoDate(raw)) return raw;
  const match = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/.exec(raw);
  if (!match) return null;
  const candidate = `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`;
  return isIsoDate(candidate) ? candidate : null;
}

function timeValue(value: unknown): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${String(value.getHours()).padStart(2, '0')}:${String(value.getMinutes()).padStart(2, '0')}`;
  }
  if (typeof value === 'number' && value >= 0 && value < 1) {
    const minutes = Math.round(value * 24 * 60) % (24 * 60);
    return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
  }
  const raw = String(value ?? '').trim();
  const match = /^(\d{1,2}):(\d{2})/.exec(raw);
  if (!match) return null;
  const candidate = `${match[1].padStart(2, '0')}:${match[2]}`;
  return isIsoTime(candidate) ? candidate : null;
}

export function parseAutocontrolType(value: unknown): HaccpAutocontrolType | null {
  const text = normalize(value);
  if (!text) return null;
  if (text.includes('aliment') || text.includes('food') || text.includes('proba')) return 'food_sample';
  if (text.includes('igien') || text.includes('sanit') || text.includes('hygiene')) return 'hygiene_test';
  if (text.includes('apa') || text.includes('water')) return 'water_test';
  return null;
}

function parseStatus(value: unknown): HaccpAutocontrolStatus {
  const text = normalize(value);
  if (text.includes('final') || text.includes('efect') || text.includes('complete') || text.includes('realizat')) return 'completed';
  if (text.includes('anulat') || text.includes('cancel')) return 'cancelled';
  return 'scheduled';
}

const DEFAULT_TITLE: Record<HaccpAutocontrolType, string> = {
  food_sample: 'Probă alimentară',
  hygiene_test: 'Test de igienă',
  water_test: 'Test de apă',
};

function parseGrid(grid: unknown[][], sourceFileName: string): HaccpAutocontrolDraft[] {
  for (let headerRow = 0; headerRow < Math.min(grid.length, 20); headerRow += 1) {
    const headers = (grid[headerRow] ?? []).map(String);
    const typeIndex = containsHeader(headers, TYPE_HEADERS);
    const dateIndex = exactHeader(headers, DATE_HEADERS);
    if (typeIndex < 0 || dateIndex < 0) continue;
    const titleIndex = containsHeader(headers, TITLE_HEADERS);
    const timeIndex = exactHeader(headers, TIME_HEADERS);
    const reminderDateIndex = exactHeader(headers, REMINDER_DATE_HEADERS);
    const reminderTimeIndex = exactHeader(headers, REMINDER_TIME_HEADERS);
    const locationIndex = containsHeader(headers, ['locatie', 'locație', 'punct de lucru', 'location']);
    const responsibleIndex = containsHeader(headers, ['responsabil', 'responsible']);
    const laboratoryIndex = containsHeader(headers, ['laborator', 'laboratory']);
    const notesIndex = containsHeader(headers, ['observatii', 'observații', 'note', 'notes']);
    const resultIndex = containsHeader(headers, ['rezultat', 'result']);
    const statusIndex = containsHeader(headers, ['status', 'stare']);
    const events: HaccpAutocontrolDraft[] = [];

    for (let rowIndex = headerRow + 1; rowIndex < grid.length; rowIndex += 1) {
      const row = grid[rowIndex] ?? [];
      const controlType = parseAutocontrolType(row[typeIndex] ?? row[titleIndex]);
      const date = dateValue(row[dateIndex]);
      if (!controlType || !date) continue;
      const time = timeValue(row[timeIndex]) ?? '09:00';
      const reminderDate = dateValue(row[reminderDateIndex]);
      const reminderTime = timeValue(row[reminderTimeIndex]);
      const status = parseStatus(row[statusIndex]);
      const completedAt = status === 'completed' ? combineLocalDateTime(date, time) : null;
      const optionalText = (index: number) => index >= 0 ? String(row[index] ?? '').trim() || null : null;
      events.push({
        controlType,
        title: optionalText(titleIndex) ?? DEFAULT_TITLE[controlType],
        scheduledAt: combineLocalDateTime(date, time),
        reminderAt: reminderTime ? combineLocalDateTime(reminderDate ?? date, reminderTime) : null,
        location: optionalText(locationIndex),
        responsiblePerson: optionalText(responsibleIndex),
        laboratory: optionalText(laboratoryIndex),
        notes: optionalText(notesIndex),
        result: optionalText(resultIndex),
        status,
        source: 'import',
        sourceFileName,
        completedAt,
      });
    }
    if (events.length) return events;
  }
  return [];
}

export async function parseHaccpAutocontrolImport(
  data: ArrayBuffer | string,
  sourceFileName: string,
): Promise<HaccpAutocontrolDraft[]> {
  const grids: unknown[][][] = typeof data === 'string'
    ? [parseDelimited(data)]
    : (await readXlsxFile(data)).map((sheet) => sheet.data);
  for (const grid of grids) {
    const events = parseGrid(grid, sourceFileName);
    if (events.length) return events;
  }
  return [];
}
