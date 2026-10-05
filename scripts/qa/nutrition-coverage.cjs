/* Audit the shipped recipe library against the same nutrition calculator as the app. */
const fs = require('fs');
const path = require('path');
const project = path.resolve(__dirname, '../..');
const output = process.env.MANAGER_QA_OUTPUT || path.join(project, 'qa-results');
const ts = require('typescript');
const cache = new Map();
function load(name) {
  if (!name.startsWith('@/')) return require(name);
  const stem = path.join(project, 'src', name.slice(2));
  if (name.endsWith('.json')) return JSON.parse(fs.readFileSync(stem, 'utf8'));
  const file = ['.ts', '.tsx'].map(ext => stem + ext).find(fs.existsSync);
  if (!file) throw Error('Missing source: ' + name);
  if (cache.has(file)) return cache.get(file).exports;
  const module = { exports: {} };
  cache.set(file, module);
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  new Function('require', 'module', 'exports', code)(load, module, module.exports);
  return module.exports;
}
const { RECIPE_TEMPLATES: templates } = load('@/constants/recipe-templates');
const { draftFromM1Template } = load('@/lib/recipe-templates');
const { calculateRecipeNutrition, DECLARED_NUTRIENT_KEYS } = load('@/lib/nutrition');
const { findAutomaticNutrition } = load('@/lib/nutrition-auto');
const { NUTRITION_ALIASES, NUTRITION_ESTIMATED_ALIASES } = load('@/constants/nutrition-aliases');
let rows = 0, automatic = 0, covered = 0, allValues = 0, allNineValues = 0;
const missing = new Map(), unmapped = new Map(), incompleteSources = new Map();
const available = Object.fromEntries(DECLARED_NUTRIENT_KEYS.map(key => [key, 0]));
function increment(map, name) { map.set(name, (map.get(name) || 0) + 1); }
for (const template of templates) {
  const draft = draftFromM1Template(template, 11);
  const result = calculateRecipeNutrition(draft);
  rows += result.ingredientCount;
  automatic += result.autoIngredientCount;
  covered += result.coveredIngredientCount;
  if (!result.missingRequired.length) allValues++;
  if (DECLARED_NUTRIENT_KEYS.every(key => result.per100g[key] !== null)) allNineValues++;
  for (const key of DECLARED_NUTRIENT_KEYS) if (result.perPortion[key] !== null) available[key]++;
  for (const name of result.missingIngredients) {
    increment(missing, name);
    increment(findAutomaticNutrition(name) ? incompleteSources : unmapped, name);
  }
}
const ranked = map => [...map].sort((a, b) => b[1] - a[1]);
const report = {
  recipes: templates.length, rows, automatic_rows: automatic, complete_rows: covered,
  recipes_with_all_required_values: allValues, recipes_with_all_nine_values: allNineValues,
  recipes_with_value_per_portion: available,
  localized_foods: Object.keys(NUTRITION_ALIASES).length,
  exact_aliases: Object.values(NUTRITION_ALIASES).reduce((sum, names) => sum + names.length, 0),
  estimated_aliases: Object.values(NUTRITION_ESTIMATED_ALIASES).reduce((sum, entry) => sum + entry.names.length, 0),
  unmatched_names: ranked(unmapped), source_missing_values: ranked(incompleteSources),
  explanation: 'Numeric coverage only; generic-source values and cooked weight estimates require review. Missing nutrients never become zero.',
};
fs.mkdirSync(output, { recursive: true });
fs.writeFileSync(path.join(output, 'nutrition-coverage.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ ...report, unmatched_names: report.unmatched_names.slice(0, 15), source_missing_values: report.source_missing_values.slice(0, 10) }, null, 2));
