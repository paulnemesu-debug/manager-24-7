import { afterEach, describe, expect, it, vi } from 'vitest';
import { printHtmlInBrowser } from '@/lib/web-print';
import { installPrintDocumentMock } from '@/lib/testing/web-print-dom';

afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('browser document printing', () => {
  it('waits for document load (including images) and fonts before printing', async () => {
    let fontsReady!: () => void;
    const fonts = new Promise<void>((resolve) => { fontsReady = resolve; });
    const printed: string[] = [];
    const frames = installPrintDocumentMock((html) => printed.push(html), { autoLoad: false, fontsReady: fonts });
    const html = '<html><body><img src="data:image/png;base64,test">REPORT DOCUMENT</body></html>';
    const pending = printHtmlInBrowser(html);
    expect(printed).toEqual([]);
    frames[0].onload?.();
    await Promise.resolve();
    expect(printed).toEqual([]);
    fontsReady();
    await pending;
    expect(printed).toEqual([html]);
    expect(frames[0].removed).toBe(true);
  });

  it('cleans up after a print error', async () => {
    const frames = installPrintDocumentMock(() => { throw new Error('Printing denied'); });
    await expect(printHtmlInBrowser('<html>report</html>')).rejects.toThrow('Printing denied');
    expect(frames[0].removed).toBe(true);
  });

  it('removes a stalled document and never prints it if fonts finish after timeout', async () => {
    vi.useFakeTimers();
    let fontsReady!: () => void;
    const printed: string[] = [];
    const frames = installPrintDocumentMock((html) => printed.push(html), { autoLoad: false,
      fontsReady: new Promise<void>((resolve) => { fontsReady = resolve; }) });
    const pending = printHtmlInBrowser('<html>report</html>');
    const failure = expect(pending).rejects.toThrow('could not be loaded');
    frames[0].onload?.();
    await vi.advanceTimersByTimeAsync(15_000);
    await failure;
    fontsReady();
    await Promise.resolve();
    expect(printed).toEqual([]);
    expect(frames[0].removed).toBe(true);
  });
});
