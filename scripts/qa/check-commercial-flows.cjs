const { resolveSourceName, sourceFile, evaluateSource } = require('./source-loader.cjs');
/* Execute commercial screen flows using native adapters; this is not a device test. */
const fs = require('fs'), path = require('path'), assert = require('node:assert/strict');
const React = require('react'), { create, act } = require('react-test-renderer');
global.IS_REACT_ACT_ENVIRONMENT = true;
const project = path.resolve(__dirname, '../..'), cache = new Map(), e = React.createElement;
const routes = [], writes = [], remembered = [], alerts = [], checks = [];
let workspace = { recipes: [], catalog: [] }, viewer = false, invoice, params = {}, pickedName = 'factura.pdf';
const node = type => props => e(type, props, props.children, type === 'Screen' ? props.footer : null);
const t = (key, values) => key + (values?.count !== undefined ? `:${values.count}` : '');
const mocks = {
  'react': React,
  'react-native': { View: 'View', Text: 'Text', Pressable: 'Pressable', Platform: { OS: 'android', select: values => values.android ?? values.default }, StyleSheet: { create: x => x }, Alert: { alert: (...args) => alerts.push(args) } },
  '@expo/vector-icons': { Ionicons: node('Icon') },
  'expo-router': { useRouter: () => ({ push: p => routes.push(p), replace: p => routes.push(p) }), useLocalSearchParams: () => params },
  'expo-document-picker': { getDocumentAsync: async () => ({ canceled: false, assets: [{ uri: 'file:///fixture', name: pickedName, mimeType: 'application/pdf' }] }) },
  'expo-image-picker': { requestCameraPermissionsAsync: async () => ({ granted: true }), launchCameraAsync: async () => ({ canceled: false, assets: [{ uri: 'file:///photo', mimeType: 'image/jpeg' }] }) },
  '@/components/ui': Object.fromEntries(['AppButton','Body','Card','Field','Screen','SectionHeader','StatusPill','EmptyStateGraphic'].map(k => [k, node(k)])),
  '@/components/tool-header': { ToolHeader: node('ToolHeader') },
  '@/components/inputs': { Select: node('Select') },
  '@/components/menu-engineering-matrix': { MenuEngineeringMatrix: node('MenuEngineeringMatrix') },
  '@/contexts/auth-context': { useAuth: () => ({ user: { id: 'qa-user' } }) },
  '@/contexts/locale-context': { useI18n: () => ({ t, locale: 'ro' }) },
  '@/contexts/preferences-context': { usePreferences: () => ({ format: { money: x => String(x), percent: x => String(x), number: x => String(x), date: x => x } }) },
  '@/contexts/subscription-context': { useSubscription: () => ({ isViewer: viewer }) },
  '@/contexts/workspace-context': { useWorkspace: () => ({ ...workspace,
    applyPriceUpdates: async rows => { writes.push(...rows); return 1; }, importNewCatalogItems: async rows => { writes.push(...rows); return rows.length; } }) },
  '@/lib/invoice-scan': { scanInvoiceDocument: async () => invoice },
  '@/lib/invoice-mappings': { loadInvoiceProductMappings: async () => [], rememberInvoiceProductMappings: async (_, rows) => remembered.push(...rows) },
  '@/lib/operations-storage': { currentSalesPeriod: () => '2026-10-01', loadSales: async () => ({}), saveSales: async (_, rows) => writes.push(rows) },
  '@/lib/price-alert-history': { recordPriceAlert: async () => {} },
  '@/lib/price-alert-notifier': { notifyPriceAlert: async () => {}, priceAlertMessage: () => null },
  '@/lib/document-bytes': { readDocumentText: async () => 'Preparat;Portii\nPui;20', readDocumentBytes: async () => { throw Error('Unexpected byte read'); } },
};
function load(name, importer) {
  name = resolveSourceName(name, importer, project);
  if (mocks[name]) return mocks[name];
  if (!name.startsWith('@/')) return require(name);
  const stem = path.join(project, 'src', name.slice(2));
  if (name.endsWith('.json')) return JSON.parse(fs.readFileSync(stem, 'utf8'));
  return evaluateSource(sourceFile(stem), load, cache);
}
let tree;
const find = (type, predicate = () => true) => tree.root.findAll(n => n.type === type && predicate(n));
const button = key => find('AppButton', n => n.props.label.startsWith(key))[0];
const field = key => find('Field', n => n.props.label === key)[0];
const press = async n => { assert(n); await act(async () => n.props.onPress()); };
const change = async (n, value) => { assert(n); await act(async () => n.props.onChangeText(value)); };
const select = async (key, value) => { const n = find('Select', n => n.props.label === key)[0]; assert(n); await act(async () => n.props.onChange(value)); };
const checked = label => find('Pressable', n => n.props.accessibilityRole === 'checkbox' && n.props.accessibilityLabel === label)[0];
const review = () => checked('invoice.reviewed');
async function mount(component) { if (tree) await act(async () => tree.unmount()); await act(async () => { tree = create(e(component)); }); }
(async () => {
  const originalError = console.error; console.error = (...args) => { if (!String(args[0]).includes('react-test-renderer is deprecated')) originalError(...args); };
  const { calculateRecipeTotals } = load('@/lib/calculations');
  const source = { id: 'dish', title: 'Pui', category: 'main', servings: 10, cookingMethod: 'none', cookingLossPercent: 0,
    salePriceGross: 33.3, vatPercent: 11, targetFoodCost: 30, isSubRecipe: false, yieldQuantity: 1, yieldUnit: 'kg',
    ingredients: [{ id: 'line', kind: 'product', catalogId: 'chicken', name: 'Pui', quantity: 1, unit: 'kg',
      purchasePrice: 20, priceUnit: 'kg', lossPercent: 0, allergens: [] }], manualAllergens: [], allergens: [], createdAt: '', updatedAt: '' };
  source.totals = calculateRecipeTotals(source);
  const catalog = { id: 'chicken', name: 'Pui', purchasePrice: 20, priceUnit: 'kg', defaultLossPercent: 0,
    supplier: 'METRO', active: true, notes: null, allergens: [], updatedAt: '', offers: [{ id: 'offer', supplierName: 'Selgros', unitPrice: 10,
      priceUnit: 'kg', packageQuantity: null, packagePrice: null, source: null, sourceDate: null, isActive: false }] };
  const Simulator = load('@/app/tools/simulator').default;
  await mount(Simulator);
  workspace = { recipes: [source], catalog: [catalog] };
  await act(async () => tree.update(e(Simulator)));
  assert.equal(field('simulator.salePrice').props.value, '33.3'); checks.push('Simulator initializes after asynchronous recipe loading');
  const frozen = JSON.stringify(workspace);
  await select('simulator.ingredient', 'line'); await select('simulator.supplierOffer', 'offer');
  await change(find('Field', n => n.props.label === 'simulator.quantity')[0], '0.');
  assert.equal(find('Field', n => n.props.label === 'simulator.quantity')[0].props.value, '0.');
  checks.push('Decimal quantities preserve the separator while typing');
  await change(find('Field', n => n.props.label === 'simulator.quantity')[0], '0.8');
  assert.equal(JSON.stringify(workspace), frozen); assert.equal(writes.length, 0); checks.push('Quantity and alternate supplier scenario leaves saved recipe and catalog unchanged');
  await press(button('simulator.reset')); assert.equal(field('simulator.salePrice').props.value, '33.3'); checks.push('Scenario reset restores the baseline');

  const { normalizeScannedInvoice } = load('@/lib/invoice-import');
  invoice = normalizeScannedInvoice({ supplier: 'METRO', currency: 'RON', rows: [
    { name: 'Pui', unit: 'kg', price: 30, confidence: 0.99 }, { name: 'PUI', unit: 'kg', price: 35, confidence: 0.99 } ] });
  const Invoice = load('@/app/tools/invoice-import').default;
  await mount(Invoice); await press(button('invoice.pick'));
  assert(button('invoice.confirmApply').props.disabled); await press(button('invoice.confirmApply')); assert.equal(writes.length, 0); checks.push('Scanning and preview do not write prices or learned mappings');
  await press(checked('Pui')); await press(checked('PUI'));
  assert(!checked('Pui').props.accessibilityState.checked); assert(checked('PUI').props.accessibilityState.checked); checks.push('Duplicate invoice lines cannot update one product with two prices');
  await press(review()); assert(!button('invoice.confirmApply').props.disabled);
  await change(find('Field', n => n.props.label === 'invoice.confirmedPrice')[1], '36');
  assert(button('invoice.confirmApply').props.disabled); checks.push('Editing a price invalidates the previous confirmation');
  await change(find('Field', n => n.props.label === 'invoice.confirmedPrice')[1], '-5');
  await press(review()); assert(button('invoice.confirmApply').props.disabled);
  await press(button('invoice.confirmApply')); assert.equal(writes.length, 0);
  checks.push('A negative corrected invoice price cannot silently become positive');
  await change(find('Field', n => n.props.label === 'invoice.confirmedPrice')[1], '36');
  await press(review()); await press(button('invoice.confirmApply'));
  assert.equal(writes.length, 1); assert.equal(writes[0].purchasePrice, 36); assert.equal(remembered.length, 1); checks.push('Only confirmed selected prices are applied and learned');
  writes.length = 0;
  invoice = normalizeScannedInvoice({ supplier: 'METRO', currency: 'EUR', rows: [{ name: 'Pui', unit: 'kg', price: 5 }] });
  await mount(Invoice); await press(button('invoice.pick')); await press(checked('Pui')); await press(review());
  assert(button('invoice.confirmApply').props.disabled); await press(button('invoice.confirmApply')); assert.equal(writes.length, 0); checks.push('Foreign currency cannot silently become a RON price');
  viewer = true; await mount(Invoice); await press(button('invoice.pick')); assert(!button('invoice.confirmApply')); checks.push('Viewer cannot start invoice import'); viewer = false;

  pickedName = 'vanzari.csv';
  const Menu = load('@/app/tools/menu-engineering').default; await mount(Menu);
  await press(button('menu.importSales')); assert.equal(writes.length, 0);
  await press(button('menu.importConfirm')); assert.equal(writes.length, 1);
  assert(find('MenuEngineeringMatrix')[0].props.items[0].sold === 20); checks.push('CSV sales import requires confirmation and feeds the margin matrix');
  await press(button('menu.testAction')); assert(routes.at(-1).includes('recipeId=dish')); checks.push('Menu action opens a simulation for the selected dish');
  console.error = originalError;
  const report = { mode: 'React screen execution with native/cloud adapters', checks: checks.map(name => ({ name, passed: true })), passed: checks.length,
    limitations: ['No physical phone, live OTP, real payment, camera hardware or native crash ingestion is tested by this script.'] };
  fs.mkdirSync(path.join(project, 'qa-results'), { recursive: true });
  fs.writeFileSync(path.join(project, 'qa-results/commercial-flow-checks.json'), JSON.stringify(report, null, 2)+'\n');
  console.log(JSON.stringify(report, null, 2));
})().catch(error => { console.error(error); process.exitCode = 1; });
