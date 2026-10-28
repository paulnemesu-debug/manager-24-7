import { vi } from 'vitest';

interface PrintDocumentMockFrame {
  srcdoc: string; style: Record<string, string>; removed: boolean;
  onload: (() => void) | null; onerror: (() => void) | null;
  setAttribute: ReturnType<typeof vi.fn>; remove(): void;
  contentDocument: { fonts: { ready: Promise<unknown> } };
  contentWindow: { focus: ReturnType<typeof vi.fn>; print(): void; addEventListener(event: string, listener: () => void): void };
}

export function installPrintDocumentMock(onPrint: (html: string) => void, options: { autoLoad?: boolean; fontsReady?: Promise<unknown> } = {}) {
  const frames: PrintDocumentMockFrame[] = [];
  function createFrame(): PrintDocumentMockFrame {
    let afterPrint: (() => void) | undefined;
    const frame: PrintDocumentMockFrame = {
      srcdoc: '', style: {} as Record<string, string>, removed: false,
      onload: null as (() => void) | null, onerror: null as (() => void) | null,
      setAttribute: vi.fn(), remove: () => { frame.removed = true; },
      contentDocument: { fonts: { ready: options.fontsReady ?? Promise.resolve() } },
      contentWindow: {
        focus: vi.fn(),
        print: () => { onPrint(frame.srcdoc); afterPrint?.(); },
        addEventListener: (event: string, listener: () => void) => { if (event === 'afterprint') afterPrint = listener; },
      },
    };
    frames.push(frame);
    return frame;
  }
  vi.stubGlobal('document', {
    createElement: (tag: string) => { if (tag !== 'iframe') throw new Error(`Unexpected element ${tag}`); return createFrame(); },
    body: { appendChild: (frame: ReturnType<typeof createFrame>) => { if (options.autoLoad !== false) queueMicrotask(() => frame.onload?.()); } },
  });
  return frames;
}
