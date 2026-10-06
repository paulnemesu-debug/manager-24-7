const path = require('node:path');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { resolveSourceName, sourceFile, evaluateSource } = require('./source-loader.cjs');
const project = path.resolve(__dirname, '../..');

function createLoader(cache) {
  return function load(name, importer) {
    const resolved = resolveSourceName(name, importer, project);
    assert(resolved.startsWith('@/'));
    return evaluateSource(sourceFile(path.join(project, 'src', resolved.slice(2))), load, cache);
  };
}

test('relative source imports resolve from the importing module', () => {
  const importer = path.join(project, 'src/i18n/translations.ts');
  assert.equal(resolveSourceName('./waste-translations', importer, project), '@/i18n/waste-translations');
  assert.equal(resolveSourceName('../lib/pnl', importer, project), '@/lib/pnl');
});

test('the QA loader evaluates and caches the actual bilingual dictionaries', () => {
  const load = createLoader(new Map());
  const dictionaries = load('@/i18n/translations');
  assert.equal(dictionaries.translate('ro', 'waste.savePlan'), 'Salvează planul');
  assert.equal(dictionaries.translate('en', 'waste.savePlan'), 'Save plan');
  assert.equal(load('@/i18n/translations'), dictionaries);
});

test('a failed source initialization cannot poison the next render with partial exports', () => {
  const cache = new Map();
  const file = sourceFile(path.join(project, 'src/i18n/translations'));
  assert.throws(() => evaluateSource(file, () => { throw Error('missing dependency'); }, cache), /missing dependency/);
  assert.equal(cache.has(file), false);
  assert.equal(createLoader(cache)('@/i18n/translations').translate('en', 'signIn.sendCode'), 'Send access code');
});
