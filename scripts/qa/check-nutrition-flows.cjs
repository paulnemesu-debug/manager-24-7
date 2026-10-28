const { resolveSourceName, sourceFile, evaluateSource } = require('./source-loader.cjs');
const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');
const project = path.resolve(__dirname, '../..');
const output = process.env.MANAGER_QA_OUTPUT || path.join(project, 'qa-results');
fs.mkdirSync(output, {recursive:true});
const React = require('react');
const { act, create } = require('react-test-renderer');
global.IS_REACT_ACT_ENVIRONMENT = true;
const e = React.createElement;
const cache = new Map();
const storage = new Map();
const routes = []; const alerts = []; const saves = [];
let failSave = false; let refreshed = 0;
const photo = {permission:true,calls:0,canceled:false};
const workspace = { recipes: [], catalog: [], subRecipes: [], isLoading: false, error: null,
  refresh: async () => { refreshed++; }, removeRecipe: async () => undefined,
  saveRecipe: async (draft) => { if (failSave) throw new Error('RECIPE_CONFLICT'); saves.push(draft); return { id: draft.id || 'saved-new' }; } };
const format = { money: (v) => String(v ?? 0), percent: (v) => String(v ?? 0), number: (v) => String(v ?? 0), date: (v) => String(v) };
const native = { View: 'View', Text: 'Text', Pressable: 'Pressable', Switch: 'Switch', TextInput: 'TextInput',
  StyleSheet: { create: (styles) => styles }, Platform: { OS: 'android', select: (options) => options.android ?? options.default }, UIManager: {},
  LayoutAnimation: { configureNext() {}, Presets: { easeInEaseOut: {} } },
  useWindowDimensions: () => ({ width: 360, height: 800 }),
  Alert: { alert: (...args) => alerts.push(args) } };
const widgets = new Proxy({}, { get: (_, name) => (props) => e(String(name), props, props.children) });
const ui = { ...Object.fromEntries(['AppButton', 'Body', 'Card', 'Field', 'IconButton', 'SectionHeader', 'StatusPill', 'Title', 'BrandHeader', 'EmptyStateGraphic', 'ListSkeleton'].map((name) => [name, (props) => e(name, props, props.children)])),
  Screen: (props) => e('Screen', props, props.children, props.footer) };
function load(name, importer) {
  name = resolveSourceName(name, importer, project);
  if (name === 'react') return React;
  if (name === 'react/jsx-runtime') return require('react/jsx-runtime');
  if (name === 'react-native') return native;
  if (name === '@expo/vector-icons') return { Ionicons: (props) => e('Icon', props) };
  if (name === 'expo-router') return { useRouter: () => ({ push: (...args) => routes.push(['push', ...args]), replace: (...args) => routes.push(['replace', ...args]), back() {} }),
    useLocalSearchParams: () => ({ section: 'mine' }), useFocusEffect: (fn) => React.useEffect(fn, [fn]) };
  if (name === 'expo-haptics') return { notificationAsync: async () => undefined, impactAsync: async () => undefined, selectionAsync: async()=>undefined, NotificationFeedbackType: {}, ImpactFeedbackStyle: {} };
  if (name === 'expo-image-picker') return {
    requestCameraPermissionsAsync: async()=>({granted:photo.permission}), requestMediaLibraryPermissionsAsync: async()=>({granted:photo.permission}),
    launchCameraAsync: async()=>{photo.calls++;return{canceled:photo.canceled,assets:[{uri:'file:///cache/picked.jpg'}]}},
    launchImageLibraryAsync: async()=>{photo.calls++;return{canceled:photo.canceled,assets:[{uri:'file:///cache/picked.jpg'}]}} };
  if (name === 'expo-image-manipulator') return { SaveFormat: {} };
  if (name === '@react-native-async-storage/async-storage') return { __esModule: true, default: {
    getItem: async (key) => storage.get(key) ?? null, setItem: async (key, value) => { storage.set(key, value); }, removeItem: async (key) => { storage.delete(key); } } };
  if (name === '@/contexts/auth-context') return { useAuth: () => ({ user: { id: 'qa-account', email: 'qa@example.test' } }) };
  if (name === '@/contexts/locale-context') return { useI18n: () => ({ locale: 'ro', t: (key, args) => load('@/i18n/translations').translate('ro', key, args) }) };
  if (name === '@/contexts/preferences-context') return { usePreferences: () => ({ format, defaultVatPercent: 11, currency: 'RON' }) };
  if (name === '@/contexts/subscription-context') return { useSubscription: () => ({ isViewer: false, plan: 'professional' }) };
  if (name === '@/contexts/workspace-context') return { useWorkspace: () => workspace };
  if (name === '@/components/ui') return ui;
  if (name.startsWith('@/components/') && name !== '@/components/recipe-nutrition-summary') return widgets;
  if (name === '@/app/(app)/ingredients') return { IngredientsCatalog: () => e('IngredientsCatalog') };
  if (name === '@/lib/offline-workspace') return { isOfflineId: (id) => Boolean(id?.startsWith('offline-')), workspaceErrorMessage: (error, fallback) => error?.message || fallback };
  if (name === '@/lib/recipes-repository') return { listRecipeVersions: async () => [], RecipeSaveIncompleteError: class extends Error {} };
  if (name === '@/lib/production-documents-repository') return { loadCachedBulkBatches: async () => [], syncBulkBatches: async () => [] };
  if (name === '@/lib/recipe-export') return {};
  if (name === '@/lib/recipe-photo') return { prepareRecipePhoto: async picked => picked.canceled ? null : 'file:///documents/qa-photo.jpg' };
  if (name.startsWith('@/') && name.endsWith('.json')) return JSON.parse(fs.readFileSync(path.join(project, 'src', name.slice(2)), 'utf8'));
  if (name.startsWith('@/')) return evaluateSource(sourceFile(path.join(project, 'src', name.slice(2))), load, cache);
  throw Error('Unexpected QA import ' + name);
}
function component(file) {
  return evaluateSource(path.join(project, 'src', file), load, cache);
}
const { RecipeEditor } = component('components/recipe-editor.tsx');
const { NutritionFields } = component('components/nutrition-fields.tsx');
const { createEmptyRecipe, calculateRecipeTotals } = load('@/lib/calculations');
const { findAutomaticNutrition } = load('@/lib/nutrition-auto');
const { loadRecipeDrafts } = load('@/lib/recipe-drafts');
const textContent = tree => tree.root.findAll(n => n.type === 'Text' || n.type === 'Body').map(n => n.props.children).flat(Infinity).join(' ');
const checks = [];
async function close(tree) { await act(async () => tree.unmount()); }
(async () => {
  const oldError = console.error;
  console.error = (...args) => { if (!String(args[0]).includes('react-test-renderer is deprecated')) oldError(...args); };
  const oldFetch = global.fetch; let reads = 0;
  global.fetch = async () => { reads++; throw Error('offline test'); };
  let tree;
  await act(async () => { tree = create(e(RecipeEditor, {})); });
  const row = () => tree.root.findAll(n => n.type === 'IngredientRow')[0];
  await act(async () => tree.root.findAll(n => n.type === 'Field' && n.props.label === 'Denumire preparat')[0].props.onChangeText('Pui de verificat'));
  await act(async () => row().props.onChange({ name: 'Piept de pui', quantity: 200, purchasePrice: 30 }));
  assert.equal(row().props.ingredient.nutrition.values.protein, 23.4);
  assert.equal(row().props.ingredient.nutrition.automaticMatch.foodCode, '36017');
  assert.equal(reads, 0);
  checks.push('typing a Romanian ingredient completes official nutrition offline');
  assert.equal(tree.root.findAll(n => n.type === 'SectionHeader' && n.props.title === 'Nutriția rețetei · calcul automat').length, 1);
  for (const label of ['Grăsimi', 'Glucide', 'Fibre', 'Proteine', 'Sare', 'din care zaharuri', 'din care acizi grași saturați']) assert(textContent(tree).includes(label));
  assert(textContent(tree).includes('23.4 g'));
  assert.equal(tree.root.findAll(n => n.type === 'SectionHeader' && n.props.title === 'Valori nutriționale și conformitate').length, 0);
  checks.push('all nine nutrients are visible on the ingredients page without opening the nutrition tab');
  await act(async () => tree.root.findAll(n => n.type === 'AppButton' && n.props.label === 'Salvează')[0].props.onPress());
  assert.equal(saves.at(-1).ingredients[0].nutrition.automaticMatch.foodCode, '36017');
  assert.equal(saves.at(-1).ingredients[0].nutrition.source, 'accepted_database');
  const savedDraft = saves.at(-1);
  assert.equal((await loadRecipeDrafts('qa-account')).length, 0);
  checks.push('saving carries automatic values, qualifiers and provenance in the actual editor draft');
  await close(tree);
  const final = { ...savedDraft, id: 'nutrition-saved', totals: calculateRecipeTotals(savedDraft), allergens: [], createdAt: '2026-10-04', updatedAt: '2026-10-04' };
  await act(async () => { tree = create(e(RecipeEditor, { recipe: final })); });
  assert(textContent(tree).includes('23.4 g'));
  assert.equal((await loadRecipeDrafts('qa-account')).length, 0);
  checks.push('reopening a saved recipe displays nutrition without creating an edited draft');
  await act(async () => row().props.onChange({ name: 'Preparat necunoscut' }));
  assert.equal(row().props.ingredient.nutrition.values.energyKcal, null);
  assert(textContent(tree).includes('Date de completat pentru: Preparat necunoscut.'));
  checks.push('renaming an automatic ingredient clears stale values and identifies missing data');
  await close(tree); storage.clear();
  let value = findAutomaticNutrition('morcov');
  function Fields() { const [current, setCurrent] = React.useState(value); return e(NutritionFields, { ingredientName: 'morcov', value: current, onChange: next => { value = next; setCurrent(next); } }); }
  await act(async () => { tree = create(e(Fields)); });
  await act(async () => tree.root.findAll(n => n.type === 'Field' && n.props.label === 'Denumire sau cod de bare')[0].props.onChangeText('orez fiert'));
  await act(async () => tree.root.findAll(n => n.type === 'AppButton' && n.props.label === 'Caută în baza gratuită · offline')[0].props.onPress());
  const cooked = tree.root.findAll(n => n.type === 'Pressable' && n.props.accessibilityLabel === 'Orez alb fiert, fără sare')[0];
  assert(cooked); await act(async () => cooked.props.onPress());
  assert(value.sourceReference.includes('9104'));
  assert.equal(value.automaticDisabled, true);
  assert.equal(reads, 0);
  checks.push('local search lets the operator explicitly choose cooked food without network calls');
  await act(async () => tree.root.findAll(n => n.type === 'Field' && n.props.label === 'Proteine (g)')[0].props.onChangeText('9.25'));
  assert.equal(value.values.protein, 9.25); assert.equal(value.automaticDisabled, true); assert.equal(value.automaticMatch, undefined);
  checks.push('manual label edits opt out of automatic replacement');
  await act(async () => tree.root.findAll(n => n.type === 'Field' && n.props.label === 'Greutate netă 1 bucată (g)')[0].props.onChangeText('50'));
  assert.equal(value.gramsPerUnit, 50);
  checks.push('the ingredient form retains an explicit edible mass for future calculations');
  await close(tree); global.fetch = oldFetch; console.error = oldError;
  const result = { checks_passed: checks.length, checks, renderer: 'Actual recipe editor, nutrition fields, final summary and draft persistence with native/service adapters', nutrition_network_calls: reads, physical_device: false };
  fs.writeFileSync(path.join(output, 'nutrition-flow-checks.json'), JSON.stringify(result, null, 2)+'\n');
  console.log(JSON.stringify(result));
})().catch(error => { console.error(error); process.exit(1); });
