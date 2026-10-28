import { createElement, useEffect } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Recipe, RecipeDraft } from '@/types/recipe';

const adapters = vi.hoisted(() => ({
  auth: { user: { id: 'account-a' } as { id: string } | null, isDemo: false, isAuthenticated: true },
  staticDemo: false,
  storage: new Map<string, string>(),
  read: null as null | ((key: string) => Promise<string | null>),
  listRecipes: vi.fn(), listCatalog: vi.fn(), saveRecipe: vi.fn(), saveCatalog: vi.fn(),
  deleteRecipe: vi.fn(), deleteCatalog: vi.fn(), updatePrices: vi.fn(), recalculate: vi.fn(),
}));
vi.mock('react-native', () => ({ AppState: { addEventListener: () => ({ remove() {} }) } }));
vi.mock('@/contexts/auth-context', () => ({ useAuth: () => adapters.auth }));
vi.mock('@/contexts/locale-context', () => ({ useI18n: () => ({ locale: 'en', t: (key: string) => key }) }));
vi.mock('@/contexts/preferences-context', () => ({ usePreferences: () => ({ format: { money: String } }) }));
vi.mock('@/lib/supabase', () => ({ get isDemoMode() { return adapters.staticDemo; }, supabase: null }));
vi.mock('@/lib/price-alert-notifier', () => ({ notifyPriceAlert: async () => undefined }));
vi.mock('@/lib/price-alert-history', () => ({ recordPriceAlert: async () => undefined }));
vi.mock('@/lib/operations-storage', () => ({ loadSales: async () => ({}) }));
vi.mock('@react-native-async-storage/async-storage', () => ({ default: {
  getItem: (key: string) => adapters.read ? adapters.read(key) : Promise.resolve(adapters.storage.get(key) ?? null),
  setItem: async (key: string, value: string) => { adapters.storage.set(key, value); },
  removeItem: async (key: string) => { adapters.storage.delete(key); },
} }));
vi.mock('@/lib/recipes-repository', () => ({
  listRecipes: adapters.listRecipes, saveRecipe: adapters.saveRecipe,
  deleteRecipe: adapters.deleteRecipe, persistRecalculated: adapters.recalculate,
  RecipeSaveIncompleteError: class extends Error {},
}));
vi.mock('@/lib/catalog-repository', () => ({
  listCatalog: adapters.listCatalog, saveCatalogIngredient: adapters.saveCatalog,
  deleteCatalogIngredient: adapters.deleteCatalog, applyPriceUpdates: adapters.updatePrices,
}));

import { WorkspaceProvider, useWorkspace } from './workspace-context';
import { setInstantDemoIsolation } from '@/lib/demo-isolation';
import { demoRecipes } from '@/lib/demo-data';
import { calculateRecipeTotals } from '@/lib/calculations';
import { readPendingOperations, writePendingOperations } from '@/lib/offline-workspace';

let tree: ReactTestRenderer | undefined;
let workspace: ReturnType<typeof useWorkspace>;
const scope = () => adapters.auth.isDemo ? 'demo' : adapters.auth.user?.id ?? 'anonymous';
function recipe(id = scope()): Recipe {
  const draft = { ...demoRecipes[0], id, title: id, ingredients: [] };
  return { ...draft, totals: calculateRecipeTotals(draft) };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
function Probe() { const current = useWorkspace(); useEffect(() => { workspace = current; }, [current]); return null; }
const view = () => createElement(WorkspaceProvider, null, createElement(Probe));
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
async function mount() { await act(async () => { tree = create(view()); await tick(); }); }
async function changeScope(id: string | null) {
  setInstantDemoIsolation(id === 'demo');
  adapters.auth = { user: id && id !== 'demo' ? { id } : null, isDemo: id === 'demo', isAuthenticated: Boolean(id) };
  await act(async () => { tree!.update(view()); await tick(); });
}
const queueKey = 'professional_foodcost.sync_queue.v1.account-a';
async function seedQueue() {
  await writePendingOperations('account-a', [1, 2].map(index => ({
    id: 'op-' + index, createdAt: new Date().toISOString(), type: 'saveRecipe',
    localId: 'offline-recipe-' + index, draft: { ...recipe('offline-recipe-' + index) } as RecipeDraft,
  })));
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.clearAllMocks(); adapters.storage.clear(); adapters.read = null;
  adapters.staticDemo = false;
  adapters.auth = { user: { id: 'account-a' }, isDemo: false, isAuthenticated: true };
  setInstantDemoIsolation(false);
  adapters.listRecipes.mockImplementation(async () => [recipe()]);
  adapters.listCatalog.mockResolvedValue([]);
  adapters.saveRecipe.mockImplementation(async (draft: RecipeDraft) => ({ ...recipe(), ...draft, id: draft.id ?? 'saved' }));
  adapters.recalculate.mockResolvedValue(undefined);
});
afterEach(async () => {
  await act(async () => { tree?.unmount(); await tick(); }); tree = undefined;
  setInstantDemoIsolation(false); vi.unstubAllGlobals();
});

describe('workspace identity transitions', () => {
  it('keeps static development demo reads and edits available without instant-demo isolation', async () => {
    adapters.staticDemo = true;
    adapters.auth = { user: null, isDemo: true, isAuthenticated: true };
    await mount();
    expect(workspace.recipes[0].id).toBe('demo');
    await act(async () => { await workspace.saveRecipe(recipe('demo-edit')); });
    expect(workspace.recipes.map(item => item.id)).toContain('demo-edit');
    expect(workspace.syncState).toBe('online');
  });

  it('clears old data immediately while the new demo data is loading', async () => {
    await mount(); expect(workspace.recipes[0].id).toBe('account-a');
    const loading = deferred<Recipe[]>(); adapters.listRecipes.mockImplementationOnce(() => loading.promise);
    await changeScope('demo');
    const duringLoad = workspace;
    await act(async () => { loading.resolve([recipe('demo')]); await tick(); });
    expect(duringLoad.recipes).toEqual([]);
    expect(duringLoad.catalog).toEqual([]);
    expect(duringLoad.lastSyncedAt).toBeNull();
  });

  it.each(['demo', 'account-b'])('ignores a delayed account response after changing to %s', async next => {
    const loading = deferred<Recipe[]>(); adapters.listRecipes.mockImplementationOnce(() => loading.promise);
    await mount(); await changeScope(next);
    await act(async () => { loading.resolve([recipe('private-account-a')]); await tick(); });
    expect(workspace.recipes.map(item => item.id)).toEqual([next]);
    const cache = JSON.parse(adapters.storage.get('professional_foodcost.workspace.v1.' + next)!);
    expect(cache.recipes.map((item: Recipe) => item.id)).toEqual([next]);
  });

  it('does not dispatch a source queue read that completed after entering demo', async () => {
    await seedQueue(); const savedQueue = adapters.storage.get(queueKey)!;
    const reading = deferred<string | null>(); let delayed = false;
    adapters.read = key => {
      if (key === queueKey && !delayed) { delayed = true; return reading.promise; }
      return Promise.resolve(adapters.storage.get(key) ?? null);
    };
    await mount(); await changeScope('demo');
    await act(async () => { reading.resolve(savedQueue); await tick(); });
    expect(adapters.saveRecipe).not.toHaveBeenCalled();
    expect(await readPendingOperations('account-a')).toHaveLength(2);
    expect(workspace.recipes[0].id).toBe('demo');
  });

  it('preserves source pending intent and stops the next dispatch when an in-flight write finishes after a switch', async () => {
    await seedQueue(); const saving = deferred<Recipe>();
    adapters.saveRecipe.mockImplementationOnce(() => saving.promise);
    await mount(); expect(adapters.saveRecipe).toHaveBeenCalledTimes(1);
    await changeScope('demo');
    await act(async () => { saving.resolve(recipe('saved-account-a')); await tick(); });
    expect(adapters.saveRecipe).toHaveBeenCalledTimes(1);
    expect(await readPendingOperations('account-a')).toHaveLength(2);
    expect(workspace.recipes[0].id).toBe('demo');
  });

  it.each(['saveRecipe', 'removeRecipe', 'saveCatalogIngredient', 'removeCatalogIngredient', 'applyPriceUpdates'] as const)(
    'rejects a retained %s callback from the previous identity', async method => {
    await mount(); const previous = workspace;
    await changeScope('demo');
    const invoke = () => method === 'saveRecipe' ? previous.saveRecipe(recipe('private-edit'))
      : method === 'removeRecipe' ? previous.removeRecipe('private-edit')
        : method === 'removeCatalogIngredient' ? previous.removeCatalogIngredient('private-item')
          : method === 'applyPriceUpdates' ? previous.applyPriceUpdates([])
            : previous.saveCatalogIngredient({ name: 'private-item' } as Parameters<typeof previous.saveCatalogIngredient>[0]);
    await act(async () => { await expect(invoke()).rejects.toThrow('workspace-changed'); });
    expect(adapters.saveRecipe).not.toHaveBeenCalled();
    expect(adapters.saveCatalog).not.toHaveBeenCalled();
    expect(adapters.deleteRecipe).not.toHaveBeenCalled();
    expect(adapters.deleteCatalog).not.toHaveBeenCalled();
    expect(adapters.updatePrices).not.toHaveBeenCalled();
    expect(workspace.recipes[0].id).toBe('demo');
  });

  it('rejects a mutation waiting for the source workspace lock after a switch', async () => {
    await mount(); const previous = workspace;
    const saving = deferred<Recipe>(); adapters.saveRecipe.mockImplementationOnce(() => saving.promise);
    let first!: Promise<unknown>; let second!: Promise<unknown>;
    await act(async () => {
      first = previous.saveRecipe(recipe('first')).catch(error => error);
      second = previous.saveRecipe(recipe('second')).catch(error => error);
      await tick();
    });
    expect(adapters.saveRecipe).toHaveBeenCalledTimes(1);
    await changeScope('demo');
    await act(async () => { saving.resolve(recipe('first')); await Promise.all([first, second]); });
    expect(await first).toMatchObject({ message: 'workspace-changed' });
    expect(await second).toMatchObject({ message: 'workspace-changed' });
    expect(adapters.saveRecipe).toHaveBeenCalledTimes(1);
    expect(workspace.recipes.map(item => item.id)).toEqual(['demo']);
  });

  it('ignores delayed demo results after exiting into a real account', async () => {
    adapters.auth = { user: null, isDemo: true, isAuthenticated: true };
    setInstantDemoIsolation(true);
    const loading = deferred<Recipe[]>(); adapters.listRecipes.mockImplementationOnce(() => loading.promise);
    await mount(); await changeScope('account-b');
    await act(async () => { loading.resolve([recipe('demo')]); await tick(); });
    expect(workspace.recipes.map(item => item.id)).toEqual(['account-b']);
    expect(adapters.recalculate).not.toHaveBeenCalled();
  });

  it('does not dispatch a delayed queue read after the provider unmounts', async () => {
    await seedQueue(); const savedQueue = adapters.storage.get(queueKey)!;
    const reading = deferred<string | null>(); let delayed = false;
    adapters.read = key => {
      if (key === queueKey && !delayed) { delayed = true; return reading.promise; }
      return Promise.resolve(adapters.storage.get(key) ?? null);
    };
    await mount();
    await act(async () => { tree!.unmount(); tree = undefined; });
    await act(async () => { reading.resolve(savedQueue); await tick(); });
    expect(adapters.saveRecipe).not.toHaveBeenCalled();
    expect(await readPendingOperations('account-a')).toHaveLength(2);
  });

  it('does not reload or commit a previous identity after its graph recalculation finishes', async () => {
    const outdated = recipe('account-a'); outdated.totals = { ...outdated.totals, totalCost: 999 };
    adapters.listRecipes.mockImplementationOnce(async () => [outdated]);
    const recalculating = deferred<void>(); adapters.recalculate.mockImplementationOnce(() => recalculating.promise);
    await mount(); expect(adapters.recalculate).toHaveBeenCalledTimes(1);
    await changeScope('demo');
    await act(async () => { recalculating.resolve(); await tick(); });
    expect(adapters.listRecipes).toHaveBeenCalledTimes(2);
    expect(workspace.recipes[0].id).toBe('demo');
  });

  it('does not dispatch an old queue when isolation flips before React receives the demo identity', async () => {
    await seedQueue(); const savedQueue = adapters.storage.get(queueKey)!;
    const reading = deferred<string | null>(); let delayed = false;
    adapters.read = key => {
      if (key === queueKey && !delayed) { delayed = true; return reading.promise; }
      return Promise.resolve(adapters.storage.get(key) ?? null);
    };
    await mount(); setInstantDemoIsolation(true);
    await act(async () => { reading.resolve(savedQueue); await tick(); });
    expect(adapters.saveRecipe).not.toHaveBeenCalled();
    expect(await readPendingOperations('account-a')).toHaveLength(2);
  });
});
