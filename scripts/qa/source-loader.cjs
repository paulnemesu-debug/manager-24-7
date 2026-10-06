const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

/** Resolve each relative import against its importer, preserving existing @/ adapters. */
function resolveSourceName(name, importer, project) {
  if (!name.startsWith('./') && !name.startsWith('../')) return name;
  if (!importer) throw new Error(`Relative QA import has no importer: ${name}`);
  const absolute = path.resolve(path.dirname(importer), name);
  return '@/'+path.relative(path.join(project, 'src'), absolute).split(path.sep).join('/');
}

function sourceFile(stem) {
  const file = [stem, stem + '.ts', stem + '.tsx', path.join(stem, 'index.ts'), path.join(stem, 'index.tsx')]
    .find(candidate => fs.existsSync(candidate) && fs.statSync(candidate).isFile());
  if (!file) throw new Error(`Missing QA source: ${stem}`);
  return file;
}

/** Cache before evaluation for cycles, but never retain partially initialized failures. */
function evaluateSource(file, load, cache) {
  if (cache.has(file)) return cache.get(file).exports;
  const module = { exports: {} };
  cache.set(file, module);
  try {
    const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
      fileName: file,
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
    }).outputText;
    new Function('require', 'module', 'exports', code)(name => load(name, file), module, module.exports);
    return module.exports;
  } catch (error) {
    cache.delete(file);
    throw error;
  }
}

module.exports = { resolveSourceName, sourceFile, evaluateSource };
