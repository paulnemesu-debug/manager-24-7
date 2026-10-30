/* Compatibility adapter for Expo Router 57's query-string 7 dependency.
 * decode-uri-component 0.5.1 fixes the malformed-input DoS advisories but is
 * ESM-only. query-string 7 loads it with CommonJS, so retain the exact 0.5.1
 * algorithm and convert only its module boundary after every npm install.
 */
const fs = require('node:fs');
const path = require('node:path');

const queryPackagePath = require.resolve('query-string/package.json');
const queryMetadata = JSON.parse(fs.readFileSync(queryPackagePath, 'utf8'));
if (queryMetadata.version !== '7.1.3') {
  throw new Error(`Query decoder adapter requires query-string 7.1.3; found ${queryMetadata.version}`);
}

const decoderEntry = require.resolve('decode-uri-component', { paths: [path.dirname(queryPackagePath)] });
const decoderPackagePath = path.join(path.dirname(decoderEntry), 'package.json');
const decoderMetadata = JSON.parse(fs.readFileSync(decoderPackagePath, 'utf8'));
if (decoderMetadata.version !== '0.5.1') {
  throw new Error(`Secure query decoder requires decode-uri-component 0.5.1; found ${decoderMetadata.version}`);
}

const source = fs.readFileSync(decoderEntry, 'utf8');
const esmBoundary = 'export default function decodeUriComponent(encodedURI) {';
const commonJsBoundary = 'module.exports = function decodeUriComponent(encodedURI) {';

if (!source.includes(commonJsBoundary)) {
  const occurrences = source.split(esmBoundary).length - 1;
  if (occurrences !== 1) {
    throw new Error(`Unexpected secure decoder entry; expected one ESM boundary, found ${occurrences}`);
  }
  fs.writeFileSync(decoderEntry, source.replace(esmBoundary, commonJsBoundary));
}
if (decoderMetadata.type !== 'commonjs') {
  decoderMetadata.type = 'commonjs';
  fs.writeFileSync(decoderPackagePath, `${JSON.stringify(decoderMetadata, null, 2)}\n`);
}

console.log('Installed secure query decoder adapter (query-string 7.1.3 + decode-uri-component 0.5.1).');
