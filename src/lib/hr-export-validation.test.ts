import { beforeEach, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ writes: 0, prints: 0 }));
vi.mock('react-native', () => ({ Platform: { OS: 'android' } }));
vi.mock('expo-file-system', () => ({ Paths: { cache: 'file:///cache' }, File: class {
  uri = 'file:///report'; exists = false;
  create() { state.writes++; } write() { state.writes++; } copy() { state.writes++; }
} }));
vi.mock('expo-print', () => ({ printToFileAsync: async () => { state.prints++; return { uri: 'file:///printed.pdf' }; } }));
vi.mock('expo-sharing', () => ({ isAvailableAsync: async () => true, shareAsync: async () => undefined }));
import { exportHrExcel, exportHrPdf } from '@/lib/hr-export';

beforeEach(() => { state.writes = 0; state.prints = 0; });
it.each(['', '2026-99', '2026-00', '2026-2', 'abcd', '0000-01', '2026-10/../other'])('rejects invalid month %s before producing a PDF or spreadsheet', async period => {
  await expect(exportHrPdf([], [], period)).rejects.toThrow(/AAAA-LL/);
  await expect(exportHrExcel([], [], period)).rejects.toThrow(/AAAA-LL/);
  expect(state).toEqual({ writes: 0, prints: 0 });
});
it('reports invalid months in the selected language', async () => {
  await expect(exportHrPdf([], [], '2026-99', 'All', 'en')).rejects.toThrow(/YYYY-MM/);
  expect(state.prints).toBe(0);
});
