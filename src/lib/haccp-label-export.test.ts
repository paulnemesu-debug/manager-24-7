import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const output = vi.hoisted(() => ({ os: 'web', available: true, fail: false, files: [] as string[], shared: [] as string[] }));
vi.mock('react-native', () => ({ Platform: { get OS() { return output.os; } } }));
vi.mock('expo-print', () => ({ printToFileAsync: async ({ html }: { html: string }) => {
  if (output.os === 'web') return undefined; // Actual Expo web contract: no file URI.
  if (output.fail) throw new Error('Printer failed');
  output.files.push(html);
  return { uri: 'file:///label.pdf' };
} }));
vi.mock('expo-sharing', () => ({ isAvailableAsync: async () => output.available,
  shareAsync: async (uri: string) => { output.shared.push(uri); } }));

import { exportHaccpLabelPdf } from '@/lib/haccp-label-export';

const html = '<!doctype html><html><head><style>@page { size: 40mm 60mm; }</style></head><body>Burger PARADIM · 24 hours</body></html>';
let frame: { style: Record<string, string>; srcdoc: string; onload?: () => void; onerror?: () => void;
  setAttribute: ReturnType<typeof vi.fn>; remove: ReturnType<typeof vi.fn>; contentWindow: { focus: ReturnType<typeof vi.fn>; print: ReturnType<typeof vi.fn>; addEventListener: ReturnType<typeof vi.fn> } };

beforeEach(() => {
  output.os = 'web'; output.available = true; output.fail = false; output.files = []; output.shared = [];
  vi.useFakeTimers();
  frame = { style: {}, srcdoc: '', setAttribute: vi.fn(), remove: vi.fn(), contentWindow: { focus: vi.fn(), print: vi.fn(), addEventListener: vi.fn() } };
  vi.stubGlobal('document', { createElement: vi.fn(() => frame), body: { appendChild: vi.fn() } });
});
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('production label PDF export', () => {
  it('prints the supplied label document in web, without expecting a native file URI', async () => {
    const exported = exportHaccpLabelPdf(html);
    frame.onload?.();
    await expect(exported).resolves.toBeNull();
    expect(frame.srcdoc).toBe(html);
    expect(frame.contentWindow.print).toHaveBeenCalledOnce();
    expect(output.files).toEqual([]);
    expect(output.shared).toEqual([]);
    const afterPrint = frame.contentWindow.addEventListener.mock.calls.find(([name]) => name === 'afterprint')?.[1];
    expect(afterPrint).toBeTypeOf('function');
    afterPrint();
    expect(frame.remove).toHaveBeenCalled();
  });

  it('creates and shares the label PDF on native, and propagates printer errors', async () => {
    output.os = 'android';
    await expect(exportHaccpLabelPdf(html)).resolves.toBeNull();
    expect(output.files).toEqual([html]);
    expect(output.shared).toEqual(['file:///label.pdf']);
    output.fail = true;
    await expect(exportHaccpLabelPdf(html)).rejects.toThrow('Printer failed');
    expect(output.shared).toHaveLength(1);
  });

  it('returns the generated native file when sharing is unavailable', async () => {
    output.os = 'ios'; output.available = false;
    await expect(exportHaccpLabelPdf(html)).resolves.toBe('file:///label.pdf');
    expect(output.shared).toEqual([]);
  });
});
