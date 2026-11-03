import { beforeEach, expect, it, vi } from 'vitest';
import readXlsxFile from 'read-excel-file/universal';
import { unzipSync, strFromU8, zipSync } from 'fflate';
import { unzip as browserUnzip } from 'fflate/browser';
import writeXlsxFile from 'write-excel-file/universal';
vi.mock('fflate', async () => await import('fflate/browser'));
const state = vi.hoisted(() => ({
  files: new Map<string, string | Uint8Array>(), shares: [] as string[], available: true,
  picked: null as null | { name: string; uri: string; size?: number },
}));
vi.mock('react-native', () => ({ Platform: { OS: 'android' } }));
vi.mock('expo-document-picker', () => ({ getDocumentAsync: async () => state.picked ? { canceled: false, assets: [state.picked] } : { canceled: true } }));
vi.mock('expo-sharing', () => ({ isAvailableAsync: async () => state.available, shareAsync: async (uri: string) => { state.shares.push(uri); } }));
vi.mock('expo-print', () => ({ printToFileAsync: async ({ html }: { html: string }) => { state.files.set('print.pdf', html); return { uri: 'print.pdf' }; } }));
vi.mock('expo-file-system', () => ({ Paths: { cache: 'cache' }, File: class {
  uri: string; constructor(...parts: string[]) { this.uri = parts.join('/'); }
  get exists() { return state.files.has(this.uri); }
  get size() { return state.files.get(this.uri)?.length ?? 0; }
  create() { state.files.set(this.uri, ''); } delete() { state.files.delete(this.uri); }
  write(data: string | Uint8Array) { state.files.set(this.uri, data); }
  copy(target: { uri: string }) { state.files.set(target.uri, state.files.get(this.uri)!); }
  async text() { return state.files.get(this.uri); }
  async arrayBuffer() { return (state.files.get(this.uri) as Uint8Array).slice().buffer; }
} }));
import { exportOperationsGrid, exportOperationsPdf, pickOperationsGrid, nativeOperationsArchive } from './operations-transfer-files';

beforeEach(() => { state.files.clear(); state.shares = []; state.available = true; state.picked = null; });
it('uses a stored native archive so browser fflate never requests a Worker', async () => {
  vi.stubGlobal('Worker', undefined);
  try {
    const bytes = zipSync({ 'large.xml': new Uint8Array(600000).fill(97) });
    expect(() => browserUnzip(bytes, () => {})).toThrow();
    const safe = nativeOperationsArchive(bytes);
    const entries = await new Promise<Record<string, Uint8Array>>((resolve, reject) => browserUnzip(safe, (error, result) => error ? reject(error) : resolve(result)));
    expect(entries['large.xml']).toHaveLength(600000);
  } finally { vi.unstubAllGlobals(); }
});
it('preserves empty optional XLSX cells as portable empty text', async () => {
  await exportOperationsGrid('optional', [['id','notes'], ['asset-1','']], 'xlsx');
  const bytes = state.files.get('cache/optional.xlsx') as Uint8Array;
  state.files.set('file:///optional.xlsx', bytes);
  state.picked = { name: 'optional.xlsx', uri: 'file:///optional.xlsx' };
  expect(await pickOperationsGrid()).toEqual([['id','notes'], ['asset-1','']]);
});
it('imports compressed XML larger than 512 KiB on Hermes without a Worker', async () => {
  vi.stubGlobal('Worker', undefined);
  try {
    const rows = [['name', 'notes'], ...Array.from({ length: 900 }, (_, i) => [`Utilaj ${i}`, `${i}:` + 'descriere '.repeat(90)])];
    await exportOperationsGrid('large', rows, 'xlsx');
    const bytes = state.files.get('cache/large.xlsx') as Uint8Array;
    expect(Object.values(unzipSync(bytes)).some(entry => entry.length > 524288)).toBe(true);
    state.files.set('file:///large.xlsx', bytes);
    state.picked = { name: 'large.xlsx', uri: 'file:///large.xlsx', size: bytes.length };
    expect(await pickOperationsGrid()).toEqual(rows);
  } finally { vi.unstubAllGlobals(); }
});
it('normalizes Excel native date cells before validation and preview', async () => {
  const blob = await writeXlsxFile([[{ value: 'dueDate', type: String }], [{ value: new Date('2026-11-03T00:00:00Z'), type: Date, format: 'yyyy-mm-dd' }]]).toBlob();
  const bytes = new Uint8Array(await blob.arrayBuffer());
  state.files.set('file:///dates.xlsx', bytes);
  state.picked = { name: 'dates.xlsx', uri: 'file:///dates.xlsx', size: bytes.length };
  expect(await pickOperationsGrid()).toEqual([['dueDate'], ['2026-11-03']]);
});
it('writes an actual native XLSX with safe literal strings and roundtrips through the file picker', async () => {
  const rows = [['denumire', 'cost'], ['=SUM(1)', 12.5]];
  await exportOperationsGrid('utilaje', rows, 'xlsx');
  const bytes = state.files.get('cache/utilaje.xlsx') as Uint8Array;
  const xml = strFromU8(unzipSync(bytes)['xl/worksheets/sheet1.xml']);
  expect(xml).not.toMatch(/<f[ >]/);
  expect((await readXlsxFile(bytes.slice().buffer as ArrayBuffer))[0].data).toEqual(rows);
  state.files.set('file:///input.xlsx', bytes);
  state.picked = { name: 'input.xlsx', uri: 'file:///input.xlsx', size: bytes.length };
  expect(await pickOperationsGrid()).toEqual(rows);
  expect(state.shares).toEqual(['cache/utilaje.xlsx']);
});
it('writes CSV and named PDF files and rejects unavailable sharing', async () => {
  await exportOperationsGrid('fise', [['name'], ['supă']], 'csv');
  expect(state.files.get('cache/fise.csv')).toContain('supă');
  await exportOperationsPdf('productie', '<html><body>Fișă</body></html>');
  expect(state.shares).toContain('cache/productie.pdf');
  state.available = false;
  await expect(exportOperationsGrid('fise', [['name']], 'csv')).rejects.toThrow();
});
it('cancel is harmless and unsupported or oversized picks are rejected', async () => {
  expect(await pickOperationsGrid()).toBeNull();
  state.picked = { name: 'list.xls', uri: 'file:///input.xls' };
  await expect(pickOperationsGrid()).rejects.toThrow('xlsx');
  state.picked = { name: 'list.xlsx', uri: 'file:///input.xlsx', size: 9000000 };
  await expect(pickOperationsGrid()).rejects.toThrow('8 MB');
});
