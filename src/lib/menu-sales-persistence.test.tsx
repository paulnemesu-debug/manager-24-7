import { createClient, type Session } from '@supabase/supabase-js';
import { createElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({
  client: null as ReturnType<typeof createClient> | null, storage: new Map<string, string>(),
  quota: '', switchOnRead: false, active: 'menu-owner',
}));
vi.mock('@react-native-async-storage/async-storage', () => ({ default: {
  getItem: async (key: string) => { if (state.switchOnRead) state.active = 'other-owner'; return state.storage.get(key) ?? null; },
  setItem: async (key: string, value: string) => { if (key.includes(state.quota) && state.quota) throw Error('Quota'); state.storage.set(key,value); },
} }));
vi.mock('@/lib/supabase', () => ({ isDemoMode: false, get supabase() { return state.client; } }));
vi.mock('react-native',()=>({View:'View',Text:'Text',Alert:{alert:vi.fn()},StyleSheet:{create:(x:unknown)=>x},Platform:{select:(x:{default:unknown})=>x.default}}));
vi.mock('@expo/vector-icons',()=>({Ionicons:'Icon'}));
vi.mock('expo-router',()=>({useRouter:()=>({push:vi.fn()})}));
vi.mock('expo-document-picker',()=>({getDocumentAsync:async()=>({canceled:false,assets:[{name:'sales.csv',uri:'fixture'}]})}));
vi.mock('@/components/ui',()=>Object.fromEntries(['AppButton','Body','Card','EmptyStateGraphic','Field','Screen','SectionHeader'].map(k=>[k,k])));
vi.mock('@/components/tool-header',()=>({ToolHeader:'ToolHeader'}));
vi.mock('@/components/menu-engineering-matrix',()=>({MenuEngineeringMatrix:'Matrix'}));
vi.mock('@/contexts/auth-context',()=>({useAuth:()=>({user:{id:'menu-owner'}})}));
vi.mock('@/contexts/locale-context',()=>({useI18n:()=>({locale:'en',t:(key:string)=>key})}));
vi.mock('@/contexts/preferences-context',()=>({usePreferences:()=>({format:{number:String,money:String,percent:String}})}));
vi.mock('@/contexts/subscription-context',()=>({useSubscription:()=>({isViewer:false})}));
vi.mock('@/contexts/workspace-context',()=>({useWorkspace:()=>({recipes:['dish','other'].map(id=>({id,title:id,isSubRecipe:false,ingredients:[],targetFoodCost:30,salePriceGross:20,vatPercent:0,totals:{contributionMargin:10,portionCost:10,salePriceNet:20,recommendedPriceGross:30}}))})}));
vi.mock('@/lib/document-bytes',()=>({readDocumentText:async()=>'Name,Sold\ndish,25',readDocumentBytes:async()=>new Uint8Array()}));
import { loadPendingSales, loadSales, saveSales } from '@/lib/operations-storage';
import MenuEngineering from '@/app/tools/menu-engineering';

const owner = 'menu-owner', period = '2026-11-01';
const cacheKey = `professional_foodcost.sales.${period}.v1.${owner}`;
const pendingKey = `professional_foodcost.sales_pending.${period}.v1.${owner}`;
type Row = { user_id:string; recipe_id:string; period_start:string; portions:number; source:string; source_reference:string|null; updated_at:string; id:string };
let rows: Row[], requests: { method:string; header:string|null; url:URL; body:unknown }[];
let offline: boolean, omit: boolean, targetError: boolean, lostReply: boolean, race: boolean, serial: number;
let staleList: Row[] | null;
const row = (id:string, portions:number):Row => ({ user_id:owner,recipe_id:id,period_start:period,portions,source:'manual',source_reference:null,updated_at:'2026-11-05T07:00:00.123456+00:00',id:'sale-'+id });
const filterRows = (url:URL) => rows.filter(item => [...url.searchParams].every(([key,filter]) => {
  if (filter.startsWith('eq.')) return String(item[key as keyof Row]) === filter.slice(3);
  if (filter.startsWith('in.')) return filter.slice(3).replace(/[()"\\]/g,'').split(',').includes(String(item[key as keyof Row]));
  return true;
}));
beforeEach(() => {
  vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date('2026-11-05T07:00:00Z'));vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);
  state.storage.clear(); state.active=owner; state.quota=''; state.switchOnRead=false;
  rows=[row('dish',10),row('other',5)]; requests=[]; offline=omit=targetError=lostReply=race=false; serial=0;staleList=null;
  state.client=createClient('http://127.0.0.1:9876','fixture-key',{
    auth:{persistSession:false,autoRefreshToken:false},db:{retry:false},
    global:{fetch:async(input,init)=>{
      if(offline) throw Error('offline');
      const url=new URL(String(input)), method=init?.method??'GET', header=new Headers(init?.headers).get('Authorization');
      const body=init?.body?JSON.parse(String(init.body)):null;
      requests.push({method,header,url,body});
      if(method==='GET') {
        if(targetError && url.searchParams.has('recipe_id')) return Response.json({message:'target unavailable'},{status:503});
        return Response.json(!url.searchParams.has('recipe_id')&&staleList ? staleList : omit&&!url.searchParams.has('recipe_id')?[]:filterRows(url));
      }
      if(race&&method==='PATCH'){race=false;rows[0]={...rows[0],portions:99,updated_at:'2026-11-05T07:00:01.123457+00:00'};}
      const payload=(Array.isArray(body)?body:[body]) as Row[], saved:Row[]=[];
      if(method==='PATCH') {
        for(const previous of filterRows(url)) {const next={...previous,...body,updated_at:`2026-11-05T07:01:${String(++serial).padStart(2,'0')}.123456+00:00`}; rows[rows.indexOf(previous)]=next;saved.push(next);}
      } else {
        for(const item of payload) {
          const previous=rows.find(old=>old.user_id===item.user_id&&old.recipe_id===item.recipe_id&&old.period_start===item.period_start);
          if(previous&&!new Headers(init?.headers).get('Prefer')?.includes('resolution=merge-duplicates')) return Response.json({code:'23505',message:'duplicate'},{status:409});
          const next={...item,id:previous?.id??'new-'+item.recipe_id,updated_at:`2026-11-05T07:01:${String(++serial).padStart(2,'0')}.123456+00:00`};
          if(previous) rows[rows.indexOf(previous)]=next;else rows.push(next); saved.push(next);
        }
      }
      if(lostReply){lostReply=false;throw Error('lost reply after commit');}
      return Response.json(new Headers(init?.headers).get('Accept')?.includes('object')?saved[0]??null:saved);
    }},
  });
  vi.spyOn(state.client.auth,'getSession').mockImplementation(async()=>({data:{session:{user:{id:state.active},access_token:'token-'+state.active} as Session},error:null}));
});
const trees:ReactTestRenderer[]=[];
const fields=(tree:ReactTestRenderer)=>tree.root.findAll(n=>String(n.type)==='Field'&&n.props.label==='menu.sold');
const mount=async()=>{let tree!:ReactTestRenderer;await act(async()=>{tree=create(createElement(MenuEngineering));});trees.push(tree);return tree;};
const edit=async(tree:ReactTestRenderer,index:number,value:string)=>{await act(async()=>{fields(tree)[index].props.onChangeText(value);await new Promise(resolve=>setTimeout(resolve,0));});};
const press=async(tree:ReactTestRenderer,label:string)=>{const button=tree.root.findAll(n=>String(n.type)==='AppButton').find(n=>n.props.label===label);expect(button).toBeTruthy();await act(async()=>button!.props.onPress());};
afterEach(async()=>{for(const tree of trees.splice(0))await act(async()=>tree.unmount());vi.useRealTimers();vi.unstubAllGlobals();});

it.each(['-5','1e3','abc','1..2'])('keeps invalid screen input %s and does not save it',async(raw)=>{
  const tree=await mount(),count=requests.filter(x=>x.method!=='GET').length;await edit(tree,0,raw);
  expect(fields(tree)[0].props.value).toBe(raw);expect(fields(tree)[0].props.hint).toBeTruthy();expect(rows[0].portions).toBe(10);expect(requests.filter(x=>x.method!=='GET')).toHaveLength(count);
});
it('accepts screen comma decimals and explicit zero without changing another recipe',async()=>{
  const tree=await mount();await edit(tree,0,'2,5');expect(rows[0].portions).toBe(2.5);await edit(tree,0,'0');expect(rows[0].portions).toBe(0);expect(rows[1].portions).toBe(5);
});
it('keeps a rejected screen draft visible with actionable retry and saves it after storage recovers',async()=>{
  const tree=await mount();state.quota='sales_pending';await edit(tree,0,'20');expect(fields(tree)[0].props.value).toBe('20');expect(fields(tree)[0].props.hint).toBeTruthy();expect(rows[0].portions).toBe(10);
  state.quota='';await press(tree,'common.retry');expect(rows[0].portions).toBe(20);const reopened=await mount();expect(fields(reopened)[0].props.value).toBe('20');
});
it('does not submit another recipe from a stale second mounted screen',async()=>{
  const a=await mount(),b=await mount();await edit(a,0,'20');await edit(b,1,'7');expect(rows[0].portions).toBe(20);expect(rows[1].portions).toBe(7);
});
it('imports matched recipes without overwriting an unrelated manual edit from another screen',async()=>{
  const a=await mount(),b=await mount();await press(b,'menu.importSales');await edit(a,1,'9');await press(b,'menu.importConfirm');expect(rows[0].portions).toBe(25);expect(rows[1].portions).toBe(9);
});
it('keeps loading failure visible and prevents autosave over an unreadable cache',async()=>{
  state.storage.set(cacheKey,'{invalid');const tree=await mount();expect(fields(tree)[0].props.editable).toBe(false);expect(tree.root.findAll(n=>String(n.type)==='AppButton'&&n.props.label==='common.retry').length).toBeGreaterThan(0);expect(requests).toEqual([]);
});

it('preserves acknowledged rows omitted from an empty list and offline reopen, without writing cloud',async()=>{
  await loadSales(owner,period);omit=true;expect(await loadSales(owner,period)).toEqual({dish:10,other:5});
  offline=true;expect(await loadSales(owner,period)).toEqual({dish:10,other:5});expect(requests.filter(x=>x.method!=='GET')).toEqual([]);
});
it('preserves acknowledged cache when targeted verification fails and removes verified deleted rows',async()=>{
  await loadSales(owner,period);omit=true;targetError=true;expect(await loadSales(owner,period)).toEqual({dish:10,other:5});
  targetError=false;rows=rows.filter(x=>x.recipe_id!=='dish');expect(await loadSales(owner,period)).toEqual({other:5});
});
it('accepts one-microsecond newer targeted row instead of a stale list',async()=>{
  await loadSales(owner,period);rows[0]={...rows[0],portions:12,updated_at:'2026-11-05T07:00:00.123457+00:00'};omit=true;
  expect((await loadSales(owner,period)).dish).toBe(12);
});
it('acknowledges a committed lost response without another write',async()=>{
  await loadSales(owner,period);lostReply=true;await expect(saveSales(owner,{dish:20},period)).rejects.toBeTruthy();
  const writes=requests.filter(x=>x.method!=='GET').length;expect((await loadSales(owner,period)).dish).toBe(20);
  expect(requests.filter(x=>x.method!=='GET')).toHaveLength(writes);expect(JSON.parse(state.storage.get(pendingKey)!)).toEqual({});
});
it('retains a lost-response draft instead of overwriting a newer cloud edit',async()=>{
  await loadSales(owner,period);lostReply=true;await expect(saveSales(owner,{dish:20},period)).rejects.toBeTruthy();
  rows[0]={...rows[0],portions:30,updated_at:'2026-11-05T07:02:00.123456+00:00'};
  const writes=requests.filter(x=>x.method!=='GET').length;expect((await loadSales(owner,period)).dish).toBe(20);
  expect(rows[0].portions).toBe(30);expect(requests.filter(x=>x.method!=='GET')).toHaveLength(writes);
  expect(JSON.parse(state.storage.get(pendingKey)!).dish.portions).toBe(20);
  expect((await loadPendingSales(owner,period)).dish).toBe('conflict');
});
it('conditionally patches a known base after offline edit and retains a CAS-race draft',async()=>{
  await loadSales(owner,period);offline=true;await expect(saveSales(owner,{dish:20},period)).rejects.toBeTruthy();offline=false;race=true;
  expect((await loadSales(owner,period)).dish).toBe(20);expect(rows[0].portions).toBe(99);
  expect(requests.filter(x=>x.method==='PATCH').at(-1)?.url.searchParams.get('updated_at')).toBe('eq.2026-11-05T07:00:00.123456+00:00');
  expect(JSON.parse(state.storage.get(pendingKey)!).dish.portions).toBe(20);
  expect((await loadPendingSales(owner,period)).dish).toBe('conflict');
});
it('never resurrects an existing sale deleted while its edit was pending',async()=>{
  await loadSales(owner,period);offline=true;await expect(saveSales(owner,{dish:20},period)).rejects.toBeTruthy();offline=false;rows=[];
  const writes=requests.filter(x=>x.method!=='GET').length;expect((await loadSales(owner,period)).dish).toBe(20);
  expect(rows).toEqual([]);expect(requests.filter(x=>x.method!=='GET')).toHaveLength(writes);
});
it('keeps a legacy pending conflict without automatically overwriting cloud',async()=>{
  state.storage.set(cacheKey,JSON.stringify({dish:20}));state.storage.set(pendingKey,JSON.stringify({dish:{portions:20,source:'manual',sourceReference:null}}));
  expect((await loadSales(owner,period)).dish).toBe(20);expect(rows[0].portions).toBe(10);expect(requests.filter(x=>x.method!=='GET')).toEqual([]);
});
it('captures the original owner bearer before awaited durable reads',async()=>{
  await loadSales(owner,period);state.switchOnRead=true;await saveSales(owner,{dish:20},period);
  expect(requests.every(x=>x.header==='Bearer token-'+owner)).toBe(true);expect(rows[0].portions).toBe(20);
});
it('does not interpret another session empty response as owner deletion',async()=>{
  await loadSales(owner,period);state.active='other-owner';omit=true;const count=requests.length;
  expect(await loadSales(owner,period)).toEqual({dish:10,other:5});expect(requests).toHaveLength(count);
});
it('rejects every invalid patch before writing any part',async()=>{
  await loadSales(owner,period);const before=[...state.storage],count=requests.length;
  await expect(saveSales(owner,{dish:20,other:-1},period)).rejects.toBeTruthy();expect([...state.storage]).toEqual(before);expect(requests).toHaveLength(count);
});
it('retains exact corrupt bytes and pending intent on failed mutation',async()=>{
  state.storage.set(cacheKey,'{"dish":');const before=[...state.storage];
  await expect(saveSales(owner,{dish:20},period)).rejects.toBeTruthy();expect([...state.storage]).toEqual(before);expect(requests).toEqual([]);
});
it('keeps intent after a local cache write failure and identical retry saves it once',async()=>{
  await loadSales(owner,period);state.quota='sales.';
  await expect(saveSales(owner,{dish:20},period)).rejects.toThrow('Quota');state.quota='';
  await saveSales(owner,{dish:20},period);expect((await loadSales(owner,period)).dish).toBe(20);expect(rows[0].portions).toBe(20);
});
it('preserves periods and owners while saving only the supplied recipe patch',async()=>{
  await loadSales(owner,period);await saveSales(owner,{dish:0},period);
  expect(await loadSales(owner,period)).toEqual({dish:0,other:5});expect(await loadSales(owner,'2026-10-01')).toEqual({});
});
it('retains more than100 acknowledged records using bounded targeted verification',async()=>{
  rows=Array.from({length:121},(_,index)=>row('dish-'+index,index));await loadSales(owner,period);omit=true;
  expect(Object.keys(await loadSales(owner,period))).toHaveLength(121);
  const targeted=requests.filter(item=>item.url.searchParams.has('recipe_id'));
  expect(targeted).toHaveLength(3);expect(targeted.every(item=>(item.url.searchParams.get('recipe_id')!.match(/,/g)?.length??0)<50)).toBe(true);
  expect(requests.filter(item=>item.method!=='GET')).toEqual([]);
});
it('verifies a stale older list against newer acknowledged server data',async()=>{
  const old=structuredClone(rows);await loadSales(owner,period);await saveSales(owner,{dish:20},period);staleList=old;
  expect((await loadSales(owner,period)).dish).toBe(20);expect(requests.some(item=>item.url.searchParams.has('recipe_id'))).toBe(true);
});
it('retains the known-new base across offline retries and inserts after reconnect',async()=>{
  rows=[];await loadSales(owner,period);offline=true;await expect(saveSales(owner,{dish:20},period)).rejects.toBeTruthy();
  await expect(saveSales(owner,{dish:21},period)).rejects.toBeTruthy();expect(JSON.parse(state.storage.get(pendingKey)!).dish.baseUpdatedAt).toBeNull();offline=false;
  expect((await loadSales(owner,period)).dish).toBe(21);expect(rows[0].portions).toBe(21);expect(requests.filter(item=>item.method==='POST')).toHaveLength(1);
});
it('retains pending intent if storing the server acknowledgement fails',async()=>{
  await loadSales(owner,period);state.quota='sales_acknowledged';await expect(saveSales(owner,{dish:20},period)).rejects.toThrow('Quota');
  expect(rows[0].portions).toBe(20);expect(JSON.parse(state.storage.get(pendingKey)!).dish.portions).toBe(20);state.quota='';
  const writes=requests.filter(item=>item.method!=='GET').length;expect((await loadSales(owner,period)).dish).toBe(20);expect(requests.filter(item=>item.method!=='GET')).toHaveLength(writes);
});
it('does not erase acknowledged rows when the list contains a malformed or foreign row',async()=>{
  await loadSales(owner,period);staleList=[{...row('dish',99),user_id:'other-owner'}];
  expect(await loadSales(owner,period)).toEqual({dish:10,other:5});expect(JSON.parse(state.storage.get(cacheKey)!)).toEqual({dish:10,other:5});
});
it('shows a retained conflict and only overwrites cloud after the user explicitly retries',async()=>{
  await loadSales(owner,period);lostReply=true;await expect(saveSales(owner,{dish:20},period)).rejects.toBeTruthy();rows[0]={...rows[0],portions:30,updated_at:'2026-11-05T07:02:00.123456+00:00'};
  const count=requests.filter(item=>item.method!=='GET').length;const tree=await mount();expect(fields(tree)[0].props.value).toBe('20');expect(fields(tree)[0].props.hint).toContain('changed on another device');
  expect(rows[0].portions).toBe(30);expect(requests.filter(item=>item.method!=='GET')).toHaveLength(count);await press(tree,'common.retry');expect(rows[0].portions).toBe(20);
});
