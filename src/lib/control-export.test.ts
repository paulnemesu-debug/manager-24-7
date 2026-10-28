import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const output = vi.hoisted(() => ({ os: 'web', available: true, failPrint: false, printed: [] as string[], shared: [] as string[], files: new Map<string, string>() }));
vi.mock('react-native', () => ({ Platform: { get OS() { return output.os; } } }));
vi.mock('expo-print', () => ({
  printAsync: async () => { output.printed.push('APPLICATION UI, HTML OPTION IGNORED'); },
  printToFileAsync: async ({ html }: { html: string }) => { if (output.failPrint) throw new Error('Printer failed'); output.printed.push(html); output.files.set('file:///generated.pdf', html); return { uri: 'file:///generated.pdf' }; },
}));
vi.mock('expo-file-system', () => ({ Paths: { cache: 'file:///cache' }, File: class {
  uri: string;
  constructor(...parts: string[]) { this.uri = parts.join('/'); }
  get exists() { return output.files.has(this.uri); }
  delete() { output.files.delete(this.uri); }
  copy(target: { uri: string }) { const data = output.files.get(this.uri); if (!data) throw new Error('Missing generated file'); output.files.set(target.uri, data); }
} }));
vi.mock('expo-sharing', () => ({ isAvailableAsync: async () => output.available, shareAsync: async (uri: string) => { output.shared.push(uri); } }));

import { exportControlDossierPdf } from './control-export';
import type { ControlReportData } from './control-report';
import { installPrintDocumentMock } from '@/lib/testing/web-print-dom';

const snapshot: ControlReportData = { date: '2026-10-05', updatedAt: '2026-10-05T10:00:00Z', location: 'Test', pendingSync: 0,
  input: { documentCount: 0, haccpDocuments: 0, haccpPending: 0, activeEmployees: 0, attendanceRecorded: 0, pendingLifecycle: 0, expiredDocuments: 0, expiringDocuments: 0 },
  documents: [], haccpDocuments: [], haccpTasks: [], employees: [],
};

beforeEach(() => { output.os = 'web'; output.available = true; output.failPrint = false; output.printed = []; output.shared = []; output.files.clear();
  installPrintDocumentMock((html) => output.printed.push(html));
});
afterEach(() => vi.unstubAllGlobals());

describe('inspection dossier export', () => {
  it('prints the freshly loaded authority and locale on web', async () => {
    await exportControlDossierPdf(async () => snapshot, 'ITM', 'en');
    expect(output.printed).toHaveLength(1);
    expect(output.printed[0]).toContain('Inspection dossier');
    expect(output.printed[0]).toContain('HR evidence');
    expect(output.shared).toEqual([]);
  });
  it('does not print or share a previous snapshot after the next load fails', async () => {
    await exportControlDossierPdf(async () => snapshot, 'AUDIT', 'en');
    output.printed = [];
    await expect(exportControlDossierPdf(async () => { throw new Error('Data unavailable'); }, 'ITM', 'en')).rejects.toThrow('Data unavailable');
    expect(output.printed).toEqual([]);
    expect(output.shared).toEqual([]);
  });
  it('shares the newly rendered PDF on native and never reuses it after a print error', async () => {
    output.os = 'android';
    await exportControlDossierPdf(async () => snapshot, 'DSVSA', 'ro');
    expect(output.shared).toHaveLength(1);
    expect(output.files.get(output.shared[0])).toContain('Dosar de control');
    expect(output.shared[0]).toMatch(/DSVSA.*2026-10-05.*\.pdf$/);
    output.shared = [];
    output.failPrint = true;
    await expect(exportControlDossierPdf(async () => snapshot, 'DSVSA', 'ro')).rejects.toThrow('Printer failed');
    expect(output.shared).toEqual([]);
  });
  it('reports unavailable native sharing in the active language', async () => {
    output.os = 'android'; output.available = false;
    await expect(exportControlDossierPdf(async () => snapshot, 'ITM', 'en')).rejects.toThrow('File sharing is not available');
    expect(output.shared).toEqual([]);
  });
});
