import { File } from 'expo-file-system';
import { Platform } from 'react-native';

/** Browser-picked blobs and native file/content URIs need different readers. */
export async function readDocumentBytes(uri: string, maxBytes: number, tooLargeCode: string): Promise<ArrayBuffer> {
  let bytes: ArrayBuffer;
  if (Platform.OS !== 'web' && /^(file|content):/i.test(uri)) {
    const file = new File(uri);
    if (file.size > maxBytes) throw new Error(tooLargeCode);
    bytes = await file.arrayBuffer();
  } else {
    const response = await fetch(uri);
    if (!response.ok) throw new Error('DOCUMENT_READ_FAILED');
    const size = Number(response.headers.get('content-length'));
    if (size > maxBytes) throw new Error(tooLargeCode);
    bytes = await response.arrayBuffer();
  }
  if (bytes.byteLength > maxBytes) throw new Error(tooLargeCode);
  if (!bytes.byteLength) throw new Error('DOCUMENT_EMPTY');
  return bytes;
}

export function documentBytesToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let index = 0; index < bytes.length; index += 16384) binary += String.fromCharCode(...bytes.subarray(index, index + 16384));
  return globalThis.btoa(binary);
}

export async function readDocumentBase64(uri: string, maxBytes: number, tooLargeCode: string) {
  return documentBytesToBase64(await readDocumentBytes(uri, maxBytes, tooLargeCode));
}

export async function readDocumentText(uri: string, maxBytes = 10_000_000): Promise<string> {
  if (Platform.OS !== 'web' && /^(file|content):/i.test(uri)) {
    const file = new File(uri);
    if (file.size > maxBytes) throw new Error('DOCUMENT_TOO_LARGE');
    return file.text();
  }
  return new TextDecoder('utf-8').decode(await readDocumentBytes(uri, maxBytes, 'DOCUMENT_TOO_LARGE'));
}
