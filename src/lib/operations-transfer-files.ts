import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';
import readXlsxFile from 'read-excel-file/universal';
import { unzipSync, zipSync } from 'fflate';
import { readDocumentBytes, readDocumentText } from '@/lib/document-bytes';
import { createExcelWorkbook, workbookToBlob, workbookToBytes } from '@/lib/excel-workbook';
import { downloadWebFile } from '@/lib/web-download';
import { printHtmlInBrowser } from '@/lib/web-print';
import { csvToGrid, gridToCsv, validateOperationsArchive, validateOperationsGrid, type OperationsCell } from '@/lib/operations-transfer';

const limit = 8 * 1024 * 1024;
const safeName = (name: string) => name.replace(/\.(csv|xlsx|pdf)$/i, '').replace(/[^a-zA-Z0-9._-]/g, '-').slice(0, 110) || 'manager247';
const xlsxMime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** Bounded synchronous inflation plus stored entries avoids fflate's Web Worker path on Hermes. */
export function nativeOperationsArchive(bytes: Uint8Array): Uint8Array {
  validateOperationsArchive(bytes);
  return zipSync(unzipSync(bytes), { level: 0 });
}

export async function pickOperationsGrid(): Promise<unknown[][] | null> {
  const result = await DocumentPicker.getDocumentAsync({ type: [xlsxMime, 'text/csv', 'text/comma-separated-values', 'text/plain', '*/*'], copyToCacheDirectory: true, multiple: false });
  if (result.canceled || !result.assets[0]) return null;
  const file = result.assets[0];
  if ((file.size ?? 0) > limit) throw new Error('Fișier peste 8 MB / File exceeds 8 MB');
  if (/\.csv$/i.test(file.name)) return csvToGrid(await readDocumentText(file.uri, limit));
  if (!/\.xlsx$/i.test(file.name)) throw new Error('Alege un fișier .xlsx sau .csv / Choose an .xlsx or .csv file');
  const buffer = await readDocumentBytes(file.uri, limit, 'FILE_TOO_LARGE');
  validateOperationsArchive(new Uint8Array(buffer));
  const input = Platform.OS === 'web' ? buffer : nativeOperationsArchive(new Uint8Array(buffer)).slice().buffer as ArrayBuffer;
  // Preserve snapshot chunk whitespace and notes. Spreadsheet dates are calendar values, not device-local instants.
  const sheets = await readXlsxFile(input, { trim: false });
  if (sheets.length !== 1) throw new Error('Folosește un singur tabel în prima foaie / Use a single-sheet workbook');
  const grid = (sheets[0]?.data ?? []).map(row => row.map(cell => cell instanceof Date
    ? (Number.isFinite(cell.getTime()) ? cell.toISOString().slice(0, 10) : cell)
    : cell ?? ''));
  validateOperationsGrid(grid);
  return grid;
}

async function shareFile(name: string, data: string | Uint8Array, mimeType: string) {
  if (!(await Sharing.isAvailableAsync())) throw new Error('Partajarea nu este disponibilă / File sharing is unavailable');
  const file = new File(Paths.cache, name);
  file.create({ overwrite: true, intermediates: true });
  file.write(data);
  await Sharing.shareAsync(file.uri, { mimeType, dialogTitle: name });
}

export async function exportOperationsGrid(filename: string, grid: OperationsCell[][], format: 'xlsx' | 'csv'): Promise<void> {
  validateOperationsGrid(grid);
  const name = `${safeName(filename)}.${format}`;
  if (format === 'csv') {
    const text = gridToCsv(grid);
    if (Platform.OS === 'web') downloadWebFile(text, name, 'text/csv;charset=utf-8');
    else await shareFile(name, text, 'text/csv');
    return;
  }
  const workbook = createExcelWorkbook([{ name: 'Manager247', rows: grid.map((row, rowIndex) => row.map(value => ({
    value: value ?? '', type: typeof value === 'number' ? Number : typeof value === 'boolean' ? Boolean : String,
    ...(rowIndex === 0 ? { fontWeight: 'bold' as const, backgroundColor: '#14293B', color: '#FFFFFF' } : {}),
  }))), columns: grid[0].map(() => ({ width: 25 })), stickyRowsCount: 1 }]);
  if (Platform.OS === 'web') downloadWebFile(await workbookToBlob(workbook), name, xlsxMime);
  else await shareFile(name, await workbookToBytes(workbook), xlsxMime);
}

export async function exportOperationsPdf(filename: string, html: string): Promise<void> {
  if (Platform.OS === 'web') { await printHtmlInBrowser(html); return; }
  if (!(await Sharing.isAvailableAsync())) throw new Error('Partajarea nu este disponibilă / File sharing is unavailable');
  const printed = await Print.printToFileAsync({ html });
  const file = new File(Paths.cache, `${safeName(filename)}.pdf`);
  if (file.exists) file.delete();
  new File(printed.uri).copy(file);
  await Sharing.shareAsync(file.uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: filename });
}
