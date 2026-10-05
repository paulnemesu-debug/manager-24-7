import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ os: 'web', bytes: new Uint8Array([1, 2, 3]), nativeReads: 0 }));
vi.mock('react-native', () => ({ Platform: { get OS() { return state.os; } } }));
vi.mock('expo-file-system', () => ({ File: class {
  size = state.bytes.length;
  arrayBuffer = async () => { state.nativeReads++; return state.bytes.buffer; };
  text = async () => { state.nativeReads++; return new TextDecoder().decode(state.bytes); };
} }));
import { documentBytesToBase64, readDocumentBase64, readDocumentBytes, readDocumentText } from '@/lib/document-bytes';
beforeEach(() => { state.os = 'web'; state.bytes = new Uint8Array([1, 2, 3]); state.nativeReads = 0; });
afterEach(() => vi.unstubAllGlobals());
it('reads a web data URI without using native files', async () => {
  expect(await readDocumentBase64('data:application/pdf;base64,AQID', 10, 'large')).toBe('AQID'); expect(state.nativeReads).toBe(0);
});
it('reads native file URIs with the file API', async () => {
  state.os = 'android'; expect(await readDocumentBase64('file:///photo.jpg', 10, 'large')).toBe('AQID'); expect(state.nativeReads).toBe(1);
});
it('supports native content URIs', async () => { state.os = 'android'; await readDocumentBytes('content://photo/one', 10, 'large'); expect(state.nativeReads).toBe(1); });
it('rejects a large native file before reading it', async () => { state.os = 'android'; await expect(readDocumentBytes('file:///x', 2, 'large')).rejects.toThrow('large'); expect(state.nativeReads).toBe(0); });
it('checks actual web bytes even without a size header', async () => { await expect(readDocumentBytes('data:image/jpeg;base64,AQID', 2, 'large')).rejects.toThrow('large'); });
it('rejects empty files and failed responses', async () => {
  await expect(readDocumentBytes('data:image/jpeg;base64,', 10, 'large')).rejects.toThrow('DOCUMENT_EMPTY');
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 404 })));
  await expect(readDocumentBytes('blob:missing', 10, 'large')).rejects.toThrow('DOCUMENT_READ_FAILED');
});
it('encodes more than one chunk without dropping bytes', () => {
  const bytes = new Uint8Array(40000).map((_, i) => i % 256);
  expect(new Uint8Array(Buffer.from(documentBytesToBase64(bytes.buffer), 'base64'))).toEqual(bytes);
});
it('reads UTF-8 XML and CSV chosen in the browser', async () => {
  const xml = '<Invoice><Name>Brânză</Name></Invoice>';
  expect(await readDocumentText(`data:text/xml;charset=utf-8,${encodeURIComponent(xml)}`)).toBe(xml);
  expect(state.nativeReads).toBe(0);
});
it('reads UTF-8 XML and CSV on Android', async () => {
  state.os = 'android'; state.bytes = new TextEncoder().encode('Denumire;Preț\nBrânză;12,50');
  expect(await readDocumentText('content://file/one')).toContain('Brânză;12,50'); expect(state.nativeReads).toBe(1);
});
it('checks the native text file size before loading it', async () => {
  state.os = 'android'; await expect(readDocumentText('file:///large', 2)).rejects.toThrow(); expect(state.nativeReads).toBe(0);
});
