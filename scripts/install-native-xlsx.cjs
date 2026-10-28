/* Byte-output adapter for the pinned writer. Reapplied by npm postinstall.
 * React Native's Blob rejects binary input and Hermes has no Web Workers.
 * Keep the upstream XML/image generation; use synchronous ZIP output only.
 */
const fs = require('node:fs');
const path = require('node:path');

const packagePath = require.resolve('write-excel-file/package.json');
const packageRoot = path.dirname(packagePath);
const metadata = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
if (metadata.version !== '4.1.1') {
  throw new Error(`Native XLSX adapter requires write-excel-file 4.1.1; found ${metadata.version}`);
}
const adapterPath = path.join(packageRoot, 'manager247-native');
fs.mkdirSync(adapterPath, { recursive: true });
fs.writeFileSync(path.join(adapterPath, 'index.js'), `
import generateXlsxFileContents from '../modules/xlsx/generateXlsxFileContents.js';
import convertFilesContentToUint8Arrays from '../modules/export/convertFilesContentToUint8Arrays.js';
import { zipSync } from 'fflate';

export default async function writeXlsxBytes(sheets) {
  const files = generateXlsxFileContents(sheets);
  const bytes = await convertFilesContentToUint8Arrays(files, async content => {
    if (content && typeof content.arrayBuffer === 'function') {
      return new Uint8Array(await content.arrayBuffer());
    }
    throw new Error('Unsupported native XLSX image content');
  });
  return zipSync(bytes);
}
`);
fs.writeFileSync(path.join(adapterPath, 'index.d.ts'), `
import type { Sheet } from '../types/Sheet.js';
export default function writeXlsxBytes(sheets: Sheet<Blob | Uint8Array>[]): Promise<Uint8Array>;
`);
metadata.exports['./manager247-native'] = {
  types: './manager247-native/index.d.ts',
  default: './manager247-native/index.js',
};
fs.writeFileSync(packagePath, `${JSON.stringify(metadata, null, 2)}\n`);
console.log('Installed MANAGER 24/7 native XLSX byte adapter (write-excel-file 4.1.1).');
