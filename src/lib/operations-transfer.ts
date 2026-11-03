/** Portable operational grids. No formulas or HTML from imported data are executed. */
export type OperationsCell = string | number | boolean | null;
const MAX_ROWS = 10001;
const MAX_COLUMNS = 80;
const MAX_CELL = 20000;
const invalid = () => new Error('Fișier invalid sau prea mare / Invalid or oversized file');

export function escapeOperationsHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!);
}

export function validateOperationsGrid(grid: unknown[][]): void {
  if (!Array.isArray(grid) || !grid.length || grid.length > MAX_ROWS) throw invalid();
  const columns = grid[0]?.length ?? 0;
  if (!columns || columns > MAX_COLUMNS) throw invalid();
  for (const row of grid) {
    if (!Array.isArray(row) || row.length > columns) throw invalid();
    for (const cell of row) {
      if (cell !== null && cell !== undefined && typeof cell !== 'string' && typeof cell !== 'number' && typeof cell !== 'boolean') throw invalid();
      if ((typeof cell === 'number' && !Number.isFinite(cell)) || String(cell ?? '').length > MAX_CELL) throw invalid();
    }
  }
}

function delimiterFor(text: string): string {
  let quoted = false;
  const counts = { ';': 0, ',': 0, '\t': 0 };
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (char === '"') {
      if (quoted && text[index + 1] === '"') index++;
      else quoted = !quoted;
    } else if (!quoted && (char === '\r' || char === '\n')) break;
    else if (!quoted && char in counts) counts[char as keyof typeof counts]++;
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
}

/** Exported string protection is reversible; numeric cells remain numeric text. */
const unprotect = (cell: string) => /^'(?:'|\s*[=+@\-\t\r])/.test(cell) ? cell.slice(1) : cell;
export function csvToGrid(source: string): string[][] {
  if (source.length > 8 * 1024 * 1024) throw invalid();
  const text = source.replace(/^\uFEFF/, '');
  const delimiter = delimiterFor(text);
  const grid: string[][] = [];
  let row: string[] = [], cell = '', quoted = false, closed = false;
  const endCell = () => { row.push(unprotect(cell)); cell = ''; closed = false; };
  const endRow = () => { endCell(); if (row.some(value => value.trim())) grid.push(row); row = []; if (grid.length > MAX_ROWS) throw invalid(); };
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') { cell += '"'; index++; }
      else if (char === '"') { quoted = false; closed = true; }
      else cell += char;
    } else if (char === delimiter) endCell();
    else if (char === '\n' || char === '\r') { if (char === '\r' && text[index + 1] === '\n') index++; endRow(); }
    else if (char === '"' && !cell && !closed) quoted = true;
    else { if (closed || char === '"') throw invalid(); cell += char; }
    if (cell.length > MAX_CELL || row.length > MAX_COLUMNS) throw invalid();
  }
  if (quoted) throw invalid();
  endRow();
  validateOperationsGrid(grid);
  return grid;
}

export function gridToCsv(grid: OperationsCell[][]): string {
  validateOperationsGrid(grid);
  return '\ufeff' + grid.map(row => row.map(value => {
    let text = String(value ?? '');
    if (typeof value === 'string' && /^(?:'|\s*[=+@\-\t\r])/.test(text)) text = "'" + text;
    return '"' + text.replace(/"/g, '""') + '"';
  }).join(';')).join('\r\n');
}

/** Inspect ZIP central-directory sizes before a spreadsheet parser allocates inflated files. */
export function validateOperationsArchive(bytes: Uint8Array): void {
  if (bytes.length < 22 || bytes.length > 8 * 1024 * 1024) throw invalid();
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) { end = i; break; }
  }
  if (end < 0 || view.getUint16(end + 4, true) || view.getUint16(end + 6, true)) throw invalid();
  const count = view.getUint16(end + 10, true);
  const size = view.getUint32(end + 12, true);
  let cursor = view.getUint32(end + 16, true), expanded = 0;
  if (!count || count > 512 || cursor + size > end) throw invalid();
  for (let i = 0; i < count; i++) {
    if (cursor + 46 > end || view.getUint32(cursor, true) !== 0x02014b50 || (view.getUint16(cursor + 8, true) & 1)) throw invalid();
    expanded += view.getUint32(cursor + 24, true);
    if (expanded > 30 * 1024 * 1024) throw invalid();
    cursor += 46 + view.getUint16(cursor + 28, true) + view.getUint16(cursor + 30, true) + view.getUint16(cursor + 32, true);
    if (cursor > end) throw invalid();
  }
}
