import { createClient } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const adapters = vi.hoisted(() => ({ client: null as any, storage: new Map<string,string>(), rejectWrite: false }));
vi.mock('@react-native-async-storage/async-storage', () => ({ default: {
  getItem: async (key: string) => adapters.storage.get(key) ?? null,
  setItem: async (key: string, value: string) => { if (adapters.rejectWrite) throw new Error('device full'); adapters.storage.set(key,value); },
  getAllKeys: async () => [...adapters.storage.keys()],
  multiRemove: async (keys: string[]) => { keys.forEach(key => adapters.storage.delete(key)); },
  multiSet: async (pairs: [string,string][]) => { pairs.forEach(([key,value]) => adapters.storage.set(key,value)); },
} }));
vi.mock('@/lib/supabase', () => ({ isDemoMode: false, isSupabaseConfigured: true, get supabase() { return adapters.client; } }));
vi.mock('@/lib/document-bytes', () => ({ readDocumentBytes: vi.fn() }));
import { setInstantDemoIsolation, workspaceFetch } from '@/lib/demo-isolation';
import { listRecipes, saveRecipe, deleteRecipe, persistRecalculated, listRecipeVersions } from '@/lib/recipes-repository';
import { listCatalog, saveCatalogIngredient, deleteCatalogIngredient, applyPriceUpdates, listPriceHistory, importNewCatalogItems } from '@/lib/catalog-repository';
import { resetInstantDemo } from '@/lib/instant-demo';
import { demoRecipes } from '@/lib/demo-data';
import type { CatalogIngredientDraft } from '@/types/recipe';
const recipeKey='professional_foodcost.demo_recipes.v2';
const catalogKey='professional_foodcost.demo_catalog.v1';
const catalogDraft: CatalogIngredientDraft = { name:'QA flour',purchasePrice:4,priceUnit:'kg',packageQuantity:null,packagePrice:null,defaultLossPercent:0,supplier:null,notes:null,allergens:[],active:true };
let network: ReturnType<typeof vi.fn>;
beforeEach(() => {
  adapters.storage.clear(); adapters.rejectWrite=false; setInstantDemoIsolation(true);
  network=vi.fn(async()=>{ throw new Error('Unexpected production transport'); }); vi.stubGlobal('fetch',network);
  adapters.client=createClient('https://qa.example.invalid','qa-public',{global:{fetch:workspaceFetch},auth:{autoRefreshToken:false,persistSession:false,detectSessionInUrl:false}});
});
afterEach(async()=>{setInstantDemoIsolation(false);await adapters.client.auth.stopAutoRefresh();vi.restoreAllMocks();vi.unstubAllGlobals();});
describe('dynamic instant-demo recipe and catalog repositories with a configured SDK',()=>{
  it('loads real local seeds without constructing cloud queries or sending HTTP',async()=>{
    const from=vi.spyOn(adapters.client,'from');
    const [recipes,catalog]=await Promise.all([listRecipes(),listCatalog()]);
    expect(recipes.length).toBeGreaterThan(0);expect(catalog.length).toBeGreaterThan(0);
    expect(from).not.toHaveBeenCalled();expect(network).not.toHaveBeenCalled();
    expect([...adapters.storage.keys()].sort()).toEqual([catalogKey,recipeKey].sort());
  });
  it('saves concurrent distinct recipes, reopens edits, deletes, and recalculates locally',async()=>{
    const draft={...demoRecipes[0],id:undefined,title:'QA recipe'};
    vi.spyOn(Date,'now').mockReturnValue(123456);
    const [one,two]=await Promise.all([saveRecipe({...draft,title:'QA one'}),saveRecipe({...draft,title:'QA two'})]);
    expect(one.id).not.toBe(two.id);
    expect((await listRecipes()).filter(row=>[one.id,two.id].includes(row.id))).toHaveLength(2);
    await saveRecipe({...one,title:'QA edited'});
    expect((await listRecipes()).find(row=>row.id===one.id)?.title).toBe('QA edited');
    await persistRecalculated([{...one,title:'QA recalculated'}]);
    expect((await listRecipes()).find(row=>row.id===one.id)?.title).toBe('QA recalculated');
    await deleteRecipe(two.id);expect((await listRecipes()).some(row=>row.id===two.id)).toBe(false);
    expect(await listRecipeVersions(one.id)).toEqual([]);expect(network).not.toHaveBeenCalled();
  });
  it('saves concurrent catalog entries, price/source edits, imports and deletes locally',async()=>{
    vi.spyOn(Date,'now').mockReturnValue(123456);
    const [one,two]=await Promise.all([saveCatalogIngredient({...catalogDraft,name:'QA one'}),saveCatalogIngredient({...catalogDraft,name:'QA two'})]);
    expect(one.id).not.toBe(two.id);
    expect((await listCatalog()).filter(row=>[one.id,two.id].includes(row.id))).toHaveLength(2);
    await saveCatalogIngredient({...one,name:'QA renamed'});
    await applyPriceUpdates([{id:one.id,purchasePrice:12.5,supplier:'QA supplier',source:'manual',sourceDate:'2026-10-19'}]);
    expect((await listCatalog()).find(row=>row.id===one.id)).toMatchObject({name:'QA renamed',purchasePrice:12.5,supplier:'QA supplier',priceSource:'manual',priceSourceDate:'2026-10-19'});
    const imported=await importNewCatalogItems([{name:'QA import',purchasePrice:3,priceUnit:'kg'}]);
    expect((await listCatalog()).some(row=>row.id===imported[0].id)).toBe(true);
    await deleteCatalogIngredient(two.id);expect((await listCatalog()).some(row=>row.id===two.id)).toBe(false);
    expect(await listPriceHistory(one.id)).toEqual([]);expect(network).not.toHaveBeenCalled();
  });
  it.each([recipeKey,catalogKey])('preserves malformed %s without replacing it',async(key)=>{
    adapters.storage.set(key,'{broken');
    const save=key===recipeKey?()=>saveRecipe({...demoRecipes[0],title:'QA'}):()=>saveCatalogIngredient(catalogDraft);
    await expect(save()).rejects.toBeTruthy();expect(adapters.storage.get(key)).toBe('{broken');expect(network).not.toHaveBeenCalled();
  });
  it('reports rejected storage writes and retains the previous saved records',async()=>{
    await Promise.all([listRecipes(),listCatalog()]);
    const prior=new Map(adapters.storage);adapters.rejectWrite=true;
    await expect(saveRecipe({...demoRecipes[0],title:'unsaved'})).rejects.toThrow('device full');
    await expect(saveCatalogIngredient(catalogDraft)).rejects.toThrow('device full');
    expect(adapters.storage).toEqual(prior);expect(network).not.toHaveBeenCalled();
  });
  it('resets demo recipes/catalog predictably while preserving real account data and credentials',async()=>{
    adapters.storage.set('professional_foodcost.workspace.v1.real-user','private data');adapters.storage.set('sb-auth-token','credential');
    const seedTitle=demoRecipes[0].title;
    const recipes=await listRecipes();recipes[0].title='mutated in memory';
    await saveRecipe({...demoRecipes[0],id:undefined,title:'QA temporary'});
    await saveCatalogIngredient(catalogDraft);
    await resetInstantDemo();
    expect((await listRecipes()).some(row=>row.title==='QA temporary')).toBe(false);
    expect((await listRecipes())[0].title).toBe(seedTitle);
    expect((await listCatalog()).some(row=>row.name===catalogDraft.name)).toBe(false);
    expect(adapters.storage.get('professional_foodcost.workspace.v1.real-user')).toBe('private data');expect(adapters.storage.get('sb-auth-token')).toBe('credential');
    expect(network).not.toHaveBeenCalled();
  });
  it('returns to the real repository transport only after demo isolation ends',async()=>{
    await listRecipes();setInstantDemoIsolation(false);
    network.mockResolvedValue(new Response('[]',{status:200,headers:{'Content-Type':'application/json'}}));
    expect(await listRecipes()).toEqual([]);expect(network).toHaveBeenCalledOnce();
  });
});
