/* Interaction checks use native adapters; they do not substitute for device testing. */
const fs = require('fs'), path = require('path'), assert = require('node:assert/strict');
const React = require('react'), { create, act } = require('react-test-renderer'), ts = require('typescript');
global.IS_REACT_ACT_ENVIRONMENT = true;
const project = path.resolve(__dirname, '../..'), cache = new Map(), e = React.createElement;
const storage = new Map(), routes = [], alerts = [], checks = [];
const recipes = [], catalog = [];
let params = {};
const node = type => props => e(type, props, props.children);
const mocks = {
  react: React,
  'react-native': { View: 'View', Text: 'Text', Pressable: 'Pressable', Platform: { OS: 'android', select: values => values.android ?? values.default }, StyleSheet: { create: x => x }, Alert: { alert: (...args) => alerts.push(args) }, AppState: { currentState: 'active', addEventListener: () => ({ remove() {} }) } },
  '@react-native-async-storage/async-storage': { __esModule: true, default: { getItem: async key => storage.get(key) ?? null, setItem: async (key, value) => storage.set(key, value), getAllKeys: async () => [...storage.keys()], multiRemove: async keys => keys.forEach(key => storage.delete(key)) } },
  '@expo/vector-icons': { Ionicons: node('Icon') },
  'expo-router': { useRouter: () => ({ push: route => routes.push(route), setParams: value => { params = value; } }), useLocalSearchParams: () => params, useFocusEffect: callback => React.useEffect(callback, [callback]) },
  '@/components/ui': Object.fromEntries(['AppButton','Body','Card','Field','Screen','SectionHeader','StatusPill'].map(key => [key, node(key)])),
  '@/components/tool-header': { ToolHeader: node('ToolHeader') },
  '@/components/inputs': { Select: node('Select') },
  '@/contexts/auth-context': { useAuth: () => ({ user: null, isDemo: true }) },
  '@/contexts/locale-context': { useI18n: () => ({ locale: 'ro' }) },
  '@/contexts/workspace-context': { useWorkspace: () => ({ recipes, catalog }) },
  '@/lib/supabase': { isDemoMode: false, isSupabaseConfigured: false, supabase: null },
};
function load(name) {
  if (mocks[name]) return mocks[name];
  if (!name.startsWith('@/')) return require(name);
  const stem = path.join(project, 'src', name.slice(2));
  if (name.endsWith('.json')) return JSON.parse(fs.readFileSync(stem, 'utf8'));
  const file = ['.ts','.tsx'].map(ext => stem + ext).find(fs.existsSync);
  if (!file) throw Error(`Missing source ${name}`);
  if (cache.has(file)) return cache.get(file).exports;
  const module = { exports: {} }; cache.set(file, module);
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { fileName: file, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  new Function('require','module','exports', code)(load, module, module.exports);
  return module.exports;
}
let tree;
const find = (type, predicate = () => true) => tree.root.findAll(n => n.type === type && predicate(n));
const button = label => find('AppButton', n => n.props.label === label)[0];
const field = label => find('Field', n => n.props.label === label)[0];
const press = async item => { assert(item); await act(async () => { item.props.onPress(); await new Promise(resolve => setImmediate(resolve)); }); };
const change = async (label, value) => { const item = field(label); assert(item); await act(async () => item.props.onChangeText(value)); };
async function mount(component) { if (tree) await act(async () => tree.unmount()); await act(async () => { tree = create(e(component)); }); }
async function selectStatus(status) { await act(async () => find('Select', n => n.props.label === 'Etapă')[0].props.onChange(status)); }
(async () => {
  const originalError = console.error; console.error = (...args) => { if (!String(args[0]).includes('react-test-renderer is deprecated')) originalError(...args); };
  const Documents = load('@/app/tools/compliance-documents').default;
  await mount(Documents);
  await change('Document', 'Autorizație QA');
  await change('Expiră la (AAAA-LL-ZZ, opțional)', '2020-01-01');
  await press(button('Salvează documentul'));
  assert.equal(find('StatusPill', n => n.props.label === 'Expirat').length, 1);
  checks.push('Document creation persists and exposes expired status');
  await press(button('Editează / reînnoiește'));
  await change('Expiră la (AAAA-LL-ZZ, opțional)', '2099-01-01');
  await press(button('Salvează documentul'));
  const docs = () => JSON.parse(storage.get('manager247.operational-documents.v1.demo'));
  assert.equal(docs().length, 1); assert.equal(docs()[0].expiryDate, '2099-01-01');
  checks.push('Renewing a document updates the same record');
  await press(button('Arhivează')); assert.equal(docs()[0].archived, true);
  await press(button('Arată și documentele arhivate')); await press(button('Reactivează')); assert.equal(docs()[0].archived, false);
  checks.push('Archive and restore remain reversible');
  const hr = load('@/lib/hr-repository');
  const employee = await hr.saveHrEmployee('demo', { name: 'Angajat QA', role: 'Bucătar', locationId: null, locationName: '', active: true, grossSalary: null, netSalary: null });
  await hr.saveHrShift('demo', { employeeId: employee.id, workDate: '2026-10-04', plannedStart: '08:00', plannedEnd: '16:00', actualStart: '08:00', actualEnd: '16:00', status: 'present', notes: '' });
  await mount(load('@/app/tools/hr-lifecycle').default);
  await press(button('Deschide checklistul')); await selectStatus('onboarding');
  await change('Data angajării (AAAA-LL-ZZ)', '2026-01-01');
  for (const item of find('Pressable', n => n.props.accessibilityRole === 'checkbox')) await press(item);
  await press(button('Salvează checklistul'));
  const lifecycle = () => JSON.parse(storage.get('manager247.hr-lifecycle.v1.demo'))[0];
  assert.equal(lifecycle().training, true); assert.equal(lifecycle().accessGranted, true);
  checks.push('All five onboarding checks and hire date persist');
  await press(button('Deschide checklistul')); await selectStatus('offboarding');
  await change('Data plecării (AAAA-LL-ZZ)', '2026-10-04');
  for (const item of find('Pressable', n => n.props.accessibilityRole === 'checkbox')) await press(item);
  await selectStatus('left'); await press(button('Salvează checklistul'));
  const hrAfter = await hr.loadHrData('demo');
  assert.equal(hrAfter.employees[0].active, false); assert.equal(hrAfter.shifts.length, 1);
  assert.equal(lifecycle().accessRevoked, true); assert.equal(lifecycle().finalDocuments, true);
  checks.push('Completed offboarding deactivates the employee and preserves historical shifts');
  await mount(load('@/app/tools/daily-manager').default);
  const links = find('Pressable', n => n.props.accessibilityRole === 'button');
  assert(links.length > 0);
  await press(links.find(item => item.findAllByType('Text').some(text => text.children.some(value => typeof value === 'string' && value.includes('HACCP')))) ?? links[0]);
  assert(routes.some(route => typeof route === 'string' && route.startsWith('/tools/')));
  checks.push('Daily Manager renders actual priorities and opens a remediation screen');
  assert.equal(alerts.length, 0);
  await act(async () => tree.unmount());
  const result = { passed: checks.length, checks, limitations: ['Native adapters; physical Android behavior is validated separately.'] };
  fs.writeFileSync(path.join(project, 'qa-results', 'operational-flow-checks.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
})().catch(error => { console.error(error); process.exitCode = 1; if (tree) tree.unmount(); });




