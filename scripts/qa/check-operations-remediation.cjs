const { resolveSourceName, sourceFile, evaluateSource } = require('./source-loader.cjs');
const fs = require('fs'), path = require('path'), assert = require('node:assert/strict');
const React = require('react'), { create, act } = require('react-test-renderer');
global.IS_REACT_ACT_ENVIRONMENT = true;
const project = path.resolve(__dirname, '../..'), cache = new Map(), e = React.createElement;
const storage = new Map(), alerts = [], writes = [], checks = [];
let userId = 'qa-user', params = {}, tree, pickedText = 'Preparat;Portii\nQA dish;5\nQA dish;2,5\n', documents = [], managementSnapshots = [], deferVoucherLoad = false, finishVoucherLoad;
const node = type => props => e(type, props, props.children, type === 'Screen' ? props.footer : null);
const t = (key, values) => load('@/i18n/translations').translate('en', key, values);
const catalog = [{ id: 'milk', name: 'QA Milk', purchasePrice: 8, priceUnit: 'l', defaultLossPercent: 0, supplier: 'QA', active: true, notes: null, allergens: [], updatedAt: '', offers: [] }];
let recipes = [];
const mocks = {
  react: React,
  'react-native': { View: 'View', Text: 'Text', TextInput: 'TextInput', Switch:'Switch', Pressable: 'Pressable', Platform: { OS:'android', select:x=>x.android??x.default }, StyleSheet:{ create:x=>x }, Alert:{alert:(...x)=>alerts.push(x)} },
  '@react-native-async-storage/async-storage': { __esModule:true, default:{getItem:async key=>storage.get(key)??null, setItem:async(key,value)=>storage.set(key,value), removeItem:async key=>storage.delete(key)} },
  '@expo/vector-icons': {Ionicons:node('Icon')},
  'expo-router': {useRouter:()=>({push:()=>{}, replace:()=>{}, setParams:p=>{params={...params,...p};}}), useLocalSearchParams:()=>params},
  'expo-document-picker':{getDocumentAsync:async()=>({canceled:false,assets:[{uri:'file:///fixture',name:'sales.csv'}]})},
  'expo-image-picker':{},
  '@/components/ui':Object.fromEntries(['AppButton','Body','Card','Field','IconButton','Screen','SectionHeader','StatusPill','Title','EmptyStateGraphic','LoadingState'].map(k=>[k,node(k)])),
  '@/components/inputs':Object.fromEntries(['Select','ChoiceRow','ChipGroup'].map(k=>[k,node(k)])),
  '@/components/nutrition-fields':{NutritionFields:node('NutritionFields')},
  '@/components/price-sparkline':{PriceSparkline:node('PriceSparkline')},
  '@/components/tool-header':{ToolHeader:node('ToolHeader')},
  '@/components/haccp-date-input':{HaccpDateInput:node('HaccpDateInput')},
  '@/components/haccp-label-card':{HaccpLabelCard:node('HaccpLabelCard')},
  '@/components/folder-section':{FolderHub:node('FolderHub'),FolderSection:node('FolderSection')},
  '@/components/menu-engineering-matrix':{MenuEngineeringMatrix:node('MenuEngineeringMatrix')},
  '@/contexts/auth-context':{useAuth:()=>({user:{id:userId}})},
  '@/contexts/locale-context':{useI18n:()=>({t,locale:'en'})},
  '@/contexts/preferences-context':{usePreferences:()=>({format:{money:String,percent:String,number:String,date:String}})},
  '@/contexts/subscription-context':{useSubscription:()=>({isViewer:false})},
  '@/contexts/workspace-context':{useWorkspace:()=>({recipes,catalog,saveCatalogIngredient:async draft=>writes.push({type:'ingredient',draft}),removeCatalogIngredient:async()=>{}})},
  '@/hooks/use-focused-sync-retry':{useFocusedSyncRetry:()=>{}},
  '@/lib/catalog-repository':{listPriceHistory:async()=>[]},
  '@/lib/document-bytes':{readDocumentText:async()=>pickedText},
  '@/lib/telemetry':{trackEvent:async()=>{}},
  '@/lib/share-links':{shareOnWhatsApp:async()=>{},shareByEmail:async()=>{}},
  '@/lib/consumption-scan':{scanConsumptionDocument:async()=>{}},
  '@/lib/locations-repository':{listLocations:async()=>[]},
  '@/lib/management-repository':{createManagementId:()=> 'count1',loadManagementSnapshots:async()=>managementSnapshots,saveInventoryCount:async(_,d)=>({...d,syncState:'pending'})},
  '@/lib/operations-control-repository':{loadOperationsControlData:async()=>({policies:[],orders:[],waste:[],schedules:[]}), saveStockPolicy:async()=>{},saveSupplierOrder:async()=>{},saveInventorySchedule:async(_,d)=>{writes.push({type:'schedule',draft:d});return {...d,id:'schedule1'};},saveWasteEntry:async(_,d)=>{writes.push({type:'waste',draft:d});return {...d,id:'waste1',value:d.quantity*d.unitCost};}},
  '@/lib/operations-storage':{currentSalesPeriod:()=> '2026-10-01',loadSales:async()=>({other:9}),saveSales:async(_,d)=>writes.push({type:'sales',draft:d})},
  '@/lib/production-documents-repository':{createProductionDocumentId:()=> 'issue1',syncConsumptionVouchers:async()=>deferVoucherLoad ? new Promise(resolve=>{finishVoucherLoad=resolve;}) : documents,saveConsumptionVoucher:async(_,d)=>{documents=[{...d,totalCost:d.lines.reduce((s,l)=>s+l.cost,0),syncState:'pending'}];return documents[0];}},
};
function load(name, importer){ name=resolveSourceName(name,importer,project);if(mocks[name])return mocks[name];if(!name.startsWith('@/'))return require(name);const stem=path.join(project,'src',name.slice(2));if(name.endsWith('.json'))return JSON.parse(fs.readFileSync(stem,'utf8'));return evaluateSource(sourceFile(stem),load,cache); }
const find=(type,p=()=>true)=>tree.root.findAll(n=>n.type===type&&p(n));
const button=label=>find('AppButton',n=>n.props.label===label)[0];
const field=label=>find('Field',n=>n.props.label===label)[0];
const press=async n=>{assert(n,'Expected control');await act(async()=>{n.props.onPress();await new Promise(r=>setImmediate(r));});};
const change=async(label,value)=>{const n=field(label);assert(n,`Field ${label}`);await act(async()=>{n.props.onChangeText(value);await new Promise(r=>setImmediate(r));});};
async function mount(Component,props={}){if(tree)await act(async()=>tree.unmount());await act(async()=>{tree=create(e(Component,props));await new Promise(r=>setImmediate(r));});}
async function check(id,fn){writes.length=0;alerts.length=0;params={};try{await fn();checks.push({id,status:'PASS'});}catch(error){checks.push({id,status:'FAIL',error:error.message});}}
(async()=>{
 const old=console.error;console.error=(...a)=>{if(!String(a[0]).includes('react-test-renderer is deprecated'))old(...a);};
 const draft={id:'dish',title:'QA dish',category:'main',servings:4,cookingMethod:'none',cookingLossPercent:0,salePriceGross:20,vatPercent:11,targetFoodCost:30,isSubRecipe:false,yieldQuantity:1,yieldUnit:'kg',ingredients:[],manualAllergens:[],allergens:[],createdAt:'',updatedAt:''};
 recipes=[{...draft,totals:load('@/lib/calculations').calculateRecipeTotals(draft)}];
 await check('OP02 negative direct catalog price is rejected',async()=>{await mount(load('@/components/ingredient-editor').IngredientEditor);await change('Name','QA Ingredient');await press(button('Show advanced fields'));await change('Purchase price','-12.5');await press(button('Save ingredient'));assert.equal(writes.length,0,'Invalid price must not reach save');assert(alerts.length,'Validation feedback required');});
 await check('OP12 plan survives remount and is scoped per account',async()=>{const C=load('@/app/tools/production').ProductionWorkspace;await mount(C);await act(async()=>find('TextInput')[0].props.onChangeText('QA'));await press(find('Pressable',n=>n.props.accessibilityLabel==='Add QA dish')[0]);await change('Portions','6.5');await mount(C);assert.equal(field('Portions')?.props.value,'6.5');userId='second';await mount(C);assert.equal(field('Portions'),undefined,'Other account must start empty');userId='qa-user';await mount(C);assert.equal(field('Portions')?.props.value,'6.5');});userId='qa-user';
 await check('Production portions keep the decimal separator while typing',async()=>{const C=load('@/app/tools/production').ProductionWorkspace;await mount(C);await change('Portions','0.');assert.equal(field('Portions').props.value,'0.');await change('Portions','0.5');await mount(C);assert.equal(field('Portions').props.value,'0.5');});
 await check('OP16 history can reopen and edit existing manual issue',async()=>{documents=[{id:'saved',documentDate:'2026-10-19',reference:'QA history',notes:'original',source:'manual',sourceReference:null,lines:[{id:'line',catalogId:'milk',name:'QA Milk',quantity:.75,unit:'l',priceUnit:'l',purchasePrice:8,cost:6}],totalCost:6,syncState:'pending'}];await mount(load('@/app/tools/consumption-vouchers').default);await press(find('Pressable',n=>n.props.accessibilityLabel==='Open stock issue QA history')[0]);assert.equal(field('Quantity').props.value,'0.75');await change('Quantity','1.25');await press(button('Save stock issue'));assert.equal(documents[0].id,'saved');assert.equal(documents[0].totalCost,10);});
 await check('OP16 reopening history does not overwrite edits when sync finishes later',async()=>{params={};await mount(load('@/app/tools/consumption-vouchers').default);deferVoucherLoad=true;await press(find('Pressable',n=>n.props.accessibilityLabel==='Open stock issue QA history')[0]);await change('Quantity','2');await act(async()=>finishVoucherLoad(documents));assert.equal(field('Quantity').props.value,'2');});deferVoucherLoad=false;
 await check('OP16 older stock issues remain reachable from paginated history',async()=>{documents=Array.from({length:9},(_,i)=>({...documents[0],id:`history${i}`,reference:`History ${i}`}));params={};await mount(load('@/app/tools/consumption-vouchers').default);await press(button('Show more stock issues'));await press(find('Pressable',n=>n.props.accessibilityLabel==='Open stock issue History 8')[0]);assert.equal(field('Number / reference').props.value,'History 8');});
 await check('OP18 duplicate sales rows aggregate before applying',async()=>{await mount(load('@/app/tools/menu-engineering').default);await press(button('Import sales CSV/XLSX'));await press(button('Confirm and apply'));assert.equal(writes.find(x=>x.type==='sales')?.draft.dish,7.5);assert.equal(writes.find(x=>x.type==='sales')?.draft.other,9);});
 await check('OP20 negative waste is rejected rather than made positive',async()=>{params={mode:'waste'};await mount(load('@/app/tools/operations-control').default);await change('Quantity','-0.25');await press(button('Add to register'));assert.equal(writes.length,0,'Negative quantity must not reach save');assert(alerts.length,'Validation feedback required');});
 await check('OP22 invalid monthly day is rejected before saving',async()=>{params={mode:'inventory'};await mount(load('@/app/tools/operations-control').default);await act(async()=>find('ChoiceRow',n=>n.props.label==='Frequency')[0].props.onChange('monthly'));await change('Day of the month (1–28)','31');await press(button('Save schedule'));assert.equal(writes.length,0,'Day31 must not be stored');assert(alerts.length,'Validation feedback required');});
 await check('Legacy pending management snapshot is visibly marked for reconciliation',async()=>{managementSnapshots=[{id:'legacy',date:'2026-10-18',inventory:[],sales:[],labor:[],syncState:'pending',syncIssue:'legacy_daily_requires_review'}];await mount(load('@/app/tools/management-control').default);assert(find('Body',n=>JSON.stringify(n.props.children).includes('Reconciliation required')).length,'Unresolved legacy data needs a clear visible reason');});
 if(tree)await act(async()=>tree.unmount());console.error=old;const result={checks,passed:checks.filter(x=>x.status==='PASS').length,failed:checks.filter(x=>x.status==='FAIL').length};console.log(JSON.stringify(result,null,2));if(result.failed)process.exitCode=1;
})().catch(error=>{console.error(error);process.exitCode=1;});
