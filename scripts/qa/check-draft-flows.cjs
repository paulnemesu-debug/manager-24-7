const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');
const project = path.resolve(__dirname, '../..');
const output = process.env.MANAGER_QA_OUTPUT || path.join(project, 'qa-results');
fs.mkdirSync(output, {recursive:true});
const ts = require(project + '/node_modules/typescript');
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
function load(name) {
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
  if (name === '@/contexts/locale-context') return { useI18n: () => ({ locale: 'ro', t: (key) => key }) };
  if (name === '@/contexts/preferences-context') return { usePreferences: () => ({ format, defaultVatPercent: 11, currency: 'RON' }) };
  if (name === '@/contexts/subscription-context') return { useSubscription: () => ({ isViewer: false, plan: 'professional' }) };
  if (name === '@/contexts/workspace-context') return { useWorkspace: () => workspace };
  if (name === '@/components/ui') return ui;
  if (name.startsWith('@/components/')) return widgets;
  if (name === '@/app/(app)/ingredients') return { IngredientsCatalog: () => e('IngredientsCatalog') };
  if (name === '@/lib/offline-workspace') return { isOfflineId: (id) => Boolean(id?.startsWith('offline-')), workspaceErrorMessage: (error, fallback) => error?.message || fallback };
  if (name === '@/lib/recipes-repository') return { listRecipeVersions: async () => [], RecipeSaveIncompleteError: class extends Error {} };
  if (name === '@/lib/production-documents-repository') return { loadCachedBulkBatches: async () => [], syncBulkBatches: async () => [] };
  if (name === '@/lib/recipe-export') return {};
  if (name === '@/lib/recipe-photo') return { prepareRecipePhoto: async picked => picked.canceled ? null : 'file:///documents/qa-photo.jpg' };
  if (name.startsWith('@/') && name.endsWith('.json')) return JSON.parse(fs.readFileSync(path.join(project, 'src', name.slice(2)), 'utf8'));
  if (name.startsWith('@/')) {
    const file = project + '/src/' + name.slice(2) + '.ts';
    if (cache.has(file)) return cache.get(file).exports;
    const module = { exports: {} }; cache.set(file, module);
    const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
    new Function('require', 'module', 'exports', code)(load, module, module.exports);
    return module.exports;
  }
  throw Error('Unexpected QA import ' + name);
}
function component(file) {
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(project + '/src/' + file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  new Function('require', 'module', 'exports', code)(load, module, module.exports);
  return module.exports;
}
const { RecipeEditor } = component('components/recipe-editor.tsx');
const Recipes = component('app/(app)/recipes.tsx').default;
const { createEmptyRecipe, calculateRecipeTotals } = load('@/lib/calculations');
const { loadRecipeDrafts } = load('@/lib/recipe-drafts');
const findTitle = (tree) => tree.root.findAll((n) => n.type === 'Field' && n.props.label === 'editor.fieldTitle')[0];
const findSave = (tree) => tree.root.findAll((n) => n.type === 'AppButton' && n.props.label === 'common.save')[0];
async function mount(props) { let tree; await act(async () => { tree = create(e(RecipeEditor, props)); }); return tree; }
async function close(tree) { await act(async () => tree.unmount()); }
const checks = [];
(async () => {
  const originalConsole = console.error;
  console.error = (...args) => { if (!String(args[0]).includes('react-test-renderer is deprecated')) originalConsole(...args); };
  let tree = await mount({});
  await act(async () => findTitle(tree).props.onChangeText('Ciorbă de recuperat'));
  assert.equal((await loadRecipeDrafts('qa-account'))[0].draft.title, 'Ciorbă de recuperat');
  await close(tree); tree = await mount({});
  assert.equal(findTitle(tree).props.value, 'Ciorbă de recuperat');
  checks.push('typing persists a new draft and reopening restores the title');
  await close(tree);
  await act(async () => { tree = create(e(Recipes)); });
  const link = tree.root.findAll((n) => n.type === 'FolderLink' && n.props.title === 'Ciorbă de recuperat')[0];
  assert(link); await act(async () => link.props.onPress());
  assert.equal(routes.at(-1)[1].pathname, '/recipe/new'); assert.equal(routes.at(-1)[1].params.draftSlot, 'new');
  checks.push('My recipes resumes the matching local draft');
  await close(tree); storage.clear(); routes.length = 0;
  const draft = { ...createEmptyRecipe(), title: 'Saved recipe' };
  draft.ingredients = draft.ingredients.map((item) => ({ ...item, name: 'Original ingredient', quantity: 100, purchasePrice: 10 }));
  const recipe = { ...draft, id: 'cloud-id', allergens: [], totals: calculateRecipeTotals(draft), createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-03T00:00:00Z', serverUpdatedAt: '2026-10-03T00:00:00Z' };
  workspace.recipes = [recipe]; tree = await mount({ recipe });
  assert.equal((await loadRecipeDrafts('qa-account')).length, 0);
  checks.push('opening a completed recipe without edits creates no pending draft');
  await act(async () => findTitle(tree).props.onChangeText('My revised recipe'));
  failSave = true; await act(async () => findSave(tree).props.onPress());
  assert.equal((await loadRecipeDrafts('qa-account'))[0].draft.title, 'My revised recipe');
  assert(refreshed > 0); assert.equal(routes.length, 0);
  checks.push('a failed conflicting save retains the draft and refreshes cloud data');
  failSave = false;
  const newRecipe = { ...recipe, updatedAt: '2026-10-04T00:00:00Z', serverUpdatedAt: '2026-10-04T00:00:00Z' };
  await act(async () => tree.update(e(RecipeEditor, { recipe: newRecipe })));
  assert.equal(findSave(tree).props.disabled, true);
  const keep = tree.root.findAll((n) => n.type === 'AppButton' && n.props.label === 'Am comparat · păstrez schița')[0];
  await act(async () => keep.props.onPress());
  await act(async () => alerts.at(-1)[2][1].onPress());
  assert.equal(findSave(tree).props.disabled, false);
  // Supply a valid ingredient through the original editor callback.
  const ingredientRow = tree.root.findAll((n) => n.type === 'IngredientRow')[0];
  await act(async () => ingredientRow.props.onChange({ name: 'Ingredient', quantity: 100, purchasePrice: 10 }));
  await act(async () => findSave(tree).props.onPress());
  assert.equal(saves.at(-1).expectedUpdatedAt, newRecipe.serverUpdatedAt);
  assert.equal((await loadRecipeDrafts('qa-account')).length, 0);
  assert.equal(routes.at(-1)[1].params.section, 'mine');
  checks.push('comparison confirmation rebases the save, clears the draft and returns to My recipes');
  await close(tree); storage.clear(); tree = await mount({});
  await act(async()=>findTitle(tree).props.onChangeText('Recipe with a photo'));
  const photoButton = key => tree.root.findAll(n=>n.type==='AppButton' && n.props.label===key)[0];
  photo.permission=false;await act(async()=>photoButton('editor.photoTake').props.onPress());assert.equal(photo.calls,0);
  checks.push('camera permission denial shows feedback without launching capture');
  photo.permission=true;photo.canceled=true;await act(async()=>photoButton('editor.photoPick').props.onPress());
  assert.equal((await loadRecipeDrafts('qa-account'))[0]?.draft.photoUri ?? null,null);
  checks.push('canceling photo selection keeps the original draft');
  photo.canceled=false;await act(async()=>photoButton('editor.photoPick').props.onPress());
  assert.equal((await loadRecipeDrafts('qa-account'))[0].draft.photoUri,'file:///documents/qa-photo.jpg');
  await close(tree);tree=await mount({});assert.equal(tree.root.findAll(n=>n.type==='RecipeCover')[0].props.uri,'file:///documents/qa-photo.jpg');
  checks.push('selected photo persists in the draft and reappears after reopening');
  await act(async()=>photoButton('editor.photoRemove').props.onPress());
  assert.equal((await loadRecipeDrafts('qa-account'))[0].draft.photoAction,'remove');
  checks.push('removing a photo stores an explicit removal intent');
  await close(tree); console.error = originalConsole;
  const result = { checks_passed: checks.length, checks, renderer: 'React test renderer using actual editor, recipe list and draft storage', native_adapters: true, physical_device: false };
  fs.writeFileSync(path.join(output,'draft-flow-checks.json'), JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result));
})().catch((error) => { console.error(error); process.exit(1); });
