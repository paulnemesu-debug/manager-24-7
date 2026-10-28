/** TARGETED FAULT-INJECTION QA. Production repository functions are imported unchanged.
 * AsyncStorage and Supabase are in-memory adapters; no live service is contacted.
 * Failed assertions describe unmet desired behavior, not test-runner failures.
 */
import { beforeEach, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({
  storage: new Map<string,string>(), rows: {} as Record<string, any[]>, online: false,
  calls: [] as any[], writes: [] as any[],
  rejectWrite: null as null | ((key: string, value: string) => boolean),
  rejectRead: false, loseAckTable: null as string | null,
}));
vi.mock('@react-native-async-storage/async-storage', () => ({ default: {
  getItem: async (key: string) => { if(state.rejectRead) throw new Error('InjectedReadError'); return state.storage.get(key) ?? null; },
  setItem: async (key: string, value: string) => {
    if(state.rejectWrite?.(key,value)) throw new Error('InjectedQuotaExceeded');
    state.writes.push({key,value}); state.storage.set(key,value);
  },
  removeItem: async (key: string) => { state.storage.delete(key); },
} }));
function query(table: string) {
  let op='select', values:any[]=[], single=false, cap=Infinity, start=0, end=Infinity;
  const filters:[string,any][]=[];
  const builder:any = {
    select: () => builder, eq: (key:string,value:any) => { filters.push([key,value]); return builder; },
    order: () => builder, limit: (n:number) => {cap=n; return builder;},
    range: (a:number,b:number) => { start=a; end=b; return builder; },
    upsert: (input:any) => {op='upsert';values=Array.isArray(input)?input:[input];return builder;},
    insert: (input:any) => {op='insert';values=Array.isArray(input)?input:[input];return builder;},
    update: (input:any) => {op='update';values=[input];return builder;},
    delete: () => {op='delete';return builder;},
    single: () => {single=true;return builder;}, maybeSingle: () => {single=true;return builder;},
    then: (resolve:any,reject:any) => Promise.resolve().then(() => {
      state.calls.push({table,op,values:structuredClone(values),filters,online:state.online});
      if(!state.online) return {data:null,error:new Error('InjectedOffline')};
      let rows=state.rows[table]??[];
      const matches=(r:any)=>filters.every(([k,v])=>r[k]===v);
      if(op==='upsert') {
        values.forEach((v:any)=>{
          const keys = v.id ? ['id'] : v.recipe_id ? ['user_id','recipe_id','period_start'] : ['user_id'];
          rows=[...rows.filter(r=>!keys.every(k=>r[k]===v[k])), structuredClone(v)];
        });
        state.rows[table]=rows;
      } else if(op==='insert') {state.rows[table]=[...rows,...structuredClone(values)];}
      else if(op==='update') {state.rows[table]=rows.map(r=>matches(r)?{...r,...values[0]}:r);}
      else if(op==='delete') {state.rows[table]=rows.filter(r=>!matches(r));}
      if (state.loseAckTable===table && op!=='select') { state.loseAckTable=null; state.online=false; return {data:null,error:new Error('InjectedLostAcknowledgement')}; }
      const selected=op==='select'?rows.filter(matches).slice(start,Math.min(end+1,start+cap)):values;
      return {data:single?selected[0]??null:selected,error:null};
    }).then(resolve,reject),
  };
  return builder;
}
vi.mock('@/lib/supabase', () => ({ isDemoMode:false, isSupabaseConfigured:true, supabase: {
  from:(table:string)=>query(table),
  rpc:async (name:string,args:any) => {
    state.calls.push({rpc:name,args,online:state.online});
    return {data:null,error:new Error('InjectedOffline')};
  },
} }));
import * as sales from '@/lib/operations-storage';
import * as haccp from '@/lib/haccp-repository';
import * as production from '@/lib/production-documents-repository';
import * as management from '@/lib/management-repository';
import * as routine from '@/lib/haccp-routine-repository';
import * as operations from '@/lib/operations-control-repository';
import * as documents from '@/lib/operational-documents';
import * as waste from '@/lib/waste-compliance-repository';
import * as pnl from '@/lib/pnl-repository';
import { EMPTY_PNL_INPUTS } from '@/lib/pnl';

function check(id:string, title:string, expected:unknown, actual:unknown, _severity='High', _details:unknown={}) {
  expect(actual,`${id}: ${title}`).toEqual(expected);
}
const uid='fault-test-account-a', period='2026-10-01';
const hkey=(u=uid)=>`professional_foodcost.haccp_documents.v1.${u}`;
const hdoc=(id:string):any=>({id,formCode:'FO-H-20-02',headerValues:{location:'QA'},rows:[],createdAt:'',updatedAt:'',syncState:'local'});
const voucher=(id:string):any=>({id,documentDate:'2026-10-19',reference:id,source:'manual',sourceReference:null,notes:'QA',lines:[]});
const inv=(id:string):any=>({id,date:'2026-10-19',inventory:[],locationId:null});
const eqDraft:any={id:'fridge',name:'New offline fridge',locationId:null,kind:'cold',criticalMin:0,criticalMax:3,requiredReadings:2,readingTimes:['08:00','16:00'],active:true,sortOrder:1};
const eqRemote:any={id:'fridge',user_id:uid,name:'Old cloud fridge',location_id:null,kind:'cold',critical_min:0,critical_max:8,required_readings:1,reading_times:['08:00'],active:true,sort_order:1,updated_at:'2026-10-01T00:00:00Z'};
const opDraft:any={id:'one',title:'QA permit',category:'other',owner:'QA',issueDate:'2026-10-01',expiryDate:'2027-10-01',notes:''};
beforeEach(()=>{state.storage.clear();state.rows={};state.online=false;state.calls=[];state.writes=[];state.rejectWrite=null;state.rejectRead=false;state.loseAckTable=null;vi.unstubAllGlobals();});

it('SF01: sales queue-write rejection followed by unchanged retry must preserve changed sales',async()=>{
  state.online=true;
  state.rows.menu_sales=[{user_id:uid,recipe_id:'dish',period_start:period,portions:10}];
  await sales.loadSales(uid,period);
  state.rejectWrite=(key)=>key.includes('sales_pending');
  await expect(sales.saveSales(uid,{dish:20},period)).rejects.toThrow('InjectedQuotaExceeded');
  const afterRejection=JSON.parse(state.storage.get(`professional_foodcost.sales.${period}.v1.${uid}`)!);
  state.rejectWrite=null;
  await sales.saveSales(uid,{dish:20},period);
  const loaded=await sales.loadSales(uid,period);
  check('SF01','Identical retry after queue-write failure preserves 20 portions',{local:20,cloud:20},{local:loaded.dish,cloud:state.rows.menu_sales[0].portions},'High',{afterRejection,successfulRetry:true});
});
it('SF02: separate tab module instances must preserve simultaneous HACCP documents',async()=>{
  vi.resetModules(); const tabA=await import('@/lib/haccp-repository');
  vi.resetModules(); const tabB=await import('@/lib/haccp-repository');
  const results=await Promise.all([tabA.saveHaccpDocument(uid,hdoc('a')),tabB.saveHaccpDocument(uid,hdoc('b'))]);
  check('SF02','Two independent module locks preserve both offline documents',['a','b'],(await tabA.loadCachedHaccpDocuments(uid)).map(x=>x.id).sort(),'High',{bothResolved:results.length===2,simulation:'Separate module graph / lock maps sharing storage; not browser tabs'});
});
it('SF03: same-instance concurrent consumption voucher saves preserve both',async()=>{
  await Promise.all([production.saveConsumptionVoucher(uid,voucher('a')),production.saveConsumptionVoucher(uid,voucher('b'))]);
  check('SF03','Concurrent consumption voucher saves preserve both pending documents',['a','b'],(await production.loadCachedConsumptionVouchers(uid)).map(x=>x.id).sort());
});
it('SF04: same-instance concurrent monthly P&L saves preserve both',async()=>{
  await Promise.all([pnl.savePnlReport(uid,{...EMPTY_PNL_INPUTS,id:'a',period:'2026-09',notes:'QA'}),pnl.savePnlReport(uid,{...EMPTY_PNL_INPUTS,id:'b',period:'2026-10',notes:'QA'})]);
  check('SF04','Concurrent P&L saves preserve both months',['a','b'],(await pnl.loadCachedPnlReports(uid)).map(x=>x.id).sort());
});
it('SF05: management offline history must not evict unsynced records at 25',async()=>{
  for(let n=1;n<=25;n++) await management.saveInventoryCount(uid,inv(String(n)));
  const cached=await management.loadManagementSnapshots(uid);
  check('SF05','Twenty-five successfully saved offline inventories remain durable',25,cached.length,'High',{oldestPresent:cached.some(x=>x.id==='1'),allRemainingPending:cached.every(x=>x.syncState==='pending')});
});
it('SF06: HACCP equipment offline update survives reconnect/read',async()=>{
  state.rows.haccp_equipment=[eqRemote];
  const saved=await routine.saveHaccpEquipment(uid,eqDraft);
  state.online=true; const loaded=await routine.listHaccpEquipment(uid);
  check('SF06','Offline equipment name and safety threshold survive reconnect',{name:eqDraft.name,max:3},{name:loaded[0].name,max:loaded[0].criticalMax},'High',{saveState:saved.syncState,loadedState:loaded[0].syncState});
});
it('SF07: HACCP profile offline update survives reconnect/read',async()=>{
  state.rows.haccp_routine_profiles=[{user_id:uid,default_location_id:null,default_location_name:'Old kitchen',responsible_name:'Old operator',shift_start_time:'06:00',updated_at:'2026-10-01T00:00:00Z'}];
  const saved=await routine.saveHaccpProfile(uid,{...routine.defaultHaccpProfile(),responsibleName:'New operator',shiftStartTime:'09:00'});
  state.online=true;const loaded=await routine.loadHaccpProfile(uid);
  check('SF07','Offline profile survives reconnect',{operator:'New operator',start:'09:00'},{operator:loaded.responsibleName,start:loaded.shiftStartTime},'High',{saveState:saved.syncState,loadedState:loaded.syncState});
});
it('SF08: HACCP equipment offline deactivation survives reconnect',async()=>{
  state.online=true;state.rows.haccp_equipment=[eqRemote];const [existing]=await routine.listHaccpEquipment(uid);
  state.online=false;await routine.deactivateHaccpEquipment(uid,existing);
  state.online=true;const loaded=await routine.listHaccpEquipment(uid);
  check('SF08','Offline equipment removal remains removed',[],loaded.map(x=>x.id),'Medium',{deactivationResolved:true});
});
it('SF09: management pending inventory retries when reopening after connectivity returns',async()=>{
  await management.saveInventoryCount(uid,inv('pending-count'));
  state.online=true;const loaded=await management.loadManagementSnapshots(uid);
  check('SF09','Reopening flushes pending inventory to cloud',1,(state.rows.inventory_counts??[]).length,'Medium',{localState:loaded[0].syncState,onlineCalls:state.calls.filter(x=>x.online).length});
});
it('SF10: waste receiver pending save retries after reconnect',async()=>{
  await waste.saveWasteReceiver(uid,{id:'receiver',name:'QA receiver',taxId:'QA',county:'QA',authorization:'QA',contact:'',contractReference:'',contractDate:'2026-10-01',notes:'',active:true});
  state.online=true;const loaded=await waste.loadWasteCompliance(uid);
  check('SF10','Reload retries pending waste receiver upload',1,(state.rows.waste_receivers??[]).length,'Medium',{localState:loaded.receivers[0].syncState});
});
it.each(['[{"id":"irreplaceable-offline-document"', ''])('SF11: HACCP malformed cache must not be silently replaced by successful new save: %s',async corrupt=>{
  state.storage.set(hkey(),corrupt);
  let readRejected=false;try { await haccp.loadCachedHaccpDocuments(uid); } catch { readRejected=true; }
  let rejected=false;try{await haccp.saveHaccpDocument(uid,hdoc('new'));}catch{rejected=true;}
  check('SF11','Corruption is surfaced and original cache retained',{rejected:true,originalRetained:true},{rejected,originalRetained:state.storage.get(hkey())===corrupt},'Medium',{readRejected});
});
it('SC01: initial quota failure rejects HACCP save and leaves prior document intact',async()=>{
  await haccp.saveHaccpDocument(uid,hdoc('existing'));state.rejectWrite=()=>true;
  let rejected=false;try{await haccp.saveHaccpDocument(uid,hdoc('new'));}catch{rejected=true;}
  check('SC01','Initial write rejection is not reported as successful',{rejected:true,ids:['existing']},{rejected,ids:(await haccp.loadCachedHaccpDocuments(uid)).map(x=>x.id)});
});
it('SC02: HACCP pending queue reconnect retry and account isolation',async()=>{
  await haccp.saveHaccpDocument(uid,hdoc('a'));state.online=true;
  const synced=await haccp.syncHaccpDocuments(uid);const other=await haccp.loadCachedHaccpDocuments('fault-test-account-b');
  check('SC02','Pending HACCP retry preserves item and isolates accounts',{synced:true,pending:0,other:0},{synced:synced.documents[0].syncState==='synced',pending:synced.pending,other:other.length});
});
it('SC03: same-instance locks preserve concurrent HACCP saves',async()=>{
  await Promise.all([haccp.saveHaccpDocument(uid,hdoc('a')),haccp.saveHaccpDocument(uid,hdoc('b'))]);
  check('SC03','Same-module lock preserves documents',['a','b'],(await haccp.loadCachedHaccpDocuments(uid)).map(x=>x.id).sort());
});
it('SC04: operations-control same-instance lock preserves concurrent policy saves',async()=>{
  await Promise.all(['a','b'].map(id=>operations.saveStockPolicy(uid,{id,catalogId:id,locationId:null,minimumQuantity:2,targetQuantity:5,storageZone:'QA'})));
  check('SC04','Same-module operations lock preserves policies',['a','b'],(await operations.loadOperationsControlData(uid)).policies.map(x=>x.id).sort());
});
it('SC05: operational documents surface cache corruption without writing',async()=>{
  const key=`manager247.operational-documents.v1.${uid}`;state.storage.set(key,'{corrupt');
  let rejected=false;try{await documents.saveOperationalDocument(uid,opDraft);}catch{rejected=true;}
  check('SC05','Operational documents fail closed on corrupt cache',{rejected:true,raw:'{corrupt',writes:0},{rejected,raw:state.storage.get(key),writes:state.writes.length});
});
it('SC06: storage read failure rejects save before persistence/network calls',async()=>{
  state.rejectRead=true;let rejected=false;try{await haccp.saveHaccpDocument(uid,hdoc('a'));}catch{rejected=true;}
  check('SC06','Storage read error is surfaced',{rejected:true,writes:0,calls:0},{rejected,writes:state.writes.length,calls:state.calls.length});
});
it('SF12: concurrent local inventory snapshots preserve both',async()=>{
  await Promise.all([management.saveInventoryCount(uid,inv('a')),management.saveInventoryCount(uid,inv('b'))]);
  check('SF12','Concurrent inventory snapshots both remain cached',['a','b'],(await management.loadManagementSnapshots(uid)).map(x=>x.id).sort());
});

it('sales keeps durable intent if cache write fails after pending queue is saved',async()=>{
  state.online=true;state.rows.menu_sales=[{user_id:uid,recipe_id:'dish',period_start:period,portions:10}];
  await sales.loadSales(uid,period);
  state.rejectWrite=key=>key.includes('.sales.') && !key.includes('sales_pending');
  await expect(sales.saveSales(uid,{dish:20},period)).rejects.toThrow('InjectedQuotaExceeded');
  state.rejectWrite=null;
  expect(await sales.loadSales(uid,period)).toEqual({dish:20});
  expect(state.rows.menu_sales[0].portions).toBe(20);
});
it('management retries lost acknowledgements without duplicating sales or labor',async()=>{
  state.online=true; state.loseAckTable='labor_entries';
  const draft={...inv('11111111-1111-4111-8111-111111111111'),sales:[{recipeId:'dish',name:'Dish',quantity:2,revenue:20,theoreticalUnitCost:2}],labor:[{employeeName:'QA',role:'Chef',hours:8,hourlyCost:10}]};
  await management.saveManagementSnapshot(uid,draft);
  state.online=true;
  const loaded=await management.loadManagementSnapshots(uid);
  expect(loaded[0].syncState).toBe('synced');
  expect(state.rows.inventory_counts).toHaveLength(1);
  expect(state.rows.sales_imports).toHaveLength(1);
  expect(state.rows.labor_entries).toHaveLength(1);
  expect(state.rows.sales_imports[0].id).toBe(draft.id);
  expect(state.rows.labor_entries[0].id).toMatch(/^[a-f0-9-]{36}$/);
});
it('legacy daily pending entries stay intact with an explicit reconciliation reason',async()=>{
  state.storage.set(`manager247.management.v1.${uid}`,JSON.stringify([{...inv('legacy'),sales:[{revenue:20}],labor:[],updatedAt:'2026-10-01',syncState:'pending'}]));
  state.online=true;
  const [loaded]=await management.loadManagementSnapshots(uid);
  expect(loaded).toMatchObject({id:'legacy',syncState:'pending',syncIssue:'legacy_daily_requires_review'});
  expect(state.calls.filter(x=>x.op==='insert'||x.op==='upsert')).toHaveLength(0);
});
it('uses browser Web Locks for cross-tab serialization when available',async()=>{
  const names:string[]=[];
  vi.stubGlobal('navigator',{locks:{request:async(name:string,callback:()=>Promise<unknown>)=>{names.push(name);return callback();}}});
  await haccp.saveHaccpDocument(uid,hdoc('a'));
  expect(names).toContain(`manager247.storage.haccp:${uid}`);
});
it.each(['{bad', ''])('production corruption blocks replacement and retains raw cache: %s',async corrupt=>{
  const key=`professional_foodcost.consumption_vouchers.v1.${uid}`;state.storage.set(key,corrupt);
  await expect(production.saveConsumptionVoucher(uid,voucher('a'))).rejects.toThrow();
  expect(state.storage.get(key)).toBe(corrupt);
});
it.each(['{bad', ''])('management corruption blocks replacement and retains raw cache: %s',async corrupt=>{
  const key=`manager247.management.v1.${uid}`;state.storage.set(key,corrupt);
  await expect(management.saveInventoryCount(uid,inv('a'))).rejects.toThrow();
  expect(state.storage.get(key)).toBe(corrupt);
});
it('P&L unreadable cache blocks saving a new month without overwriting the original bytes',async()=>{
  const key=`manager247.pnl_reports.v1.${uid}`; const raw='[{"id":"offline-month"'; state.storage.set(key,raw);
  await expect(pnl.savePnlReport(uid,{...EMPTY_PNL_INPUTS,id:'new',period:'2026-10',notes:''})).rejects.toThrow();
  expect(state.storage.get(key)).toBe(raw); expect(state.writes).toHaveLength(0);
});
it('P&L cloud recovery preserves unreadable source bytes in the account recovery archive',async()=>{
  const key=`manager247.pnl_reports.v1.${uid}`; const raw='[{"id":"offline-month"'; state.storage.set(key,raw);
  state.online=true;
  expect(await pnl.syncPnlReports(uid,{requireKnownReports:true})).toEqual([]);
  expect(JSON.parse(state.storage.get(`manager247.pnl_reports.recovery.v1.${uid}`)!)).toEqual([
    {raw,recordedAt:expect.any(String)},
  ]);
  expect(state.storage.get(key)).toBe('[]');
});
it('P&L recovery archive write failure stops cache replacement',async()=>{
  const key=`manager247.pnl_reports.v1.${uid}`; const raw='[{"id":"offline-month"'; state.storage.set(key,raw);
  state.online=true; state.rejectWrite=key=>key.includes('pnl_reports.recovery');
  await expect(pnl.syncPnlReports(uid,{requireKnownReports:true})).rejects.toThrow('InjectedQuotaExceeded');
  expect(state.storage.get(key)).toBe(raw); expect(state.writes).toHaveLength(0);
});
