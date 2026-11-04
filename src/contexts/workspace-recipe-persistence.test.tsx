import { createClient, type Session } from '@supabase/supabase-js';
import { createElement, useEffect } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { WorkspaceProvider, useWorkspace } from '@/contexts/workspace-context';
import { createEmptyIngredient, createEmptyRecipe } from '@/lib/calculations';
import { readPendingOperations, readWorkspaceCache } from '@/lib/offline-workspace';
import { loadRecipeDrafts } from '@/lib/recipe-drafts';
import { RecipeSaveIncompleteError } from '@/lib/recipes-repository';

const userId = 'recipe-persistence-test';
const cacheKey = 'professional_foodcost.workspace.v1.' + userId;
const adapters = vi.hoisted(() => ({
  storage: new Map<string, string>(),
  rows: new Map<string, Record<string, unknown>>(),
  receipts: new Map<string, { recipe_id: string; created_version: string; replayed: boolean }>(),
  offline: false,
  omitFromList: false,
  rejectCacheWrites: false,
  loseSaveResponse: false,
  failReadback: false,
  nextId: 0,
  nextVersion: 0,
  client: null as ReturnType<typeof createClient> | null,
}));

vi.mock('react-native', () => ({ AppState: { addEventListener: () => ({ remove() {} }) } }));
vi.mock('@/contexts/auth-context', () => ({
  useAuth: () => ({ user: { id: 'recipe-persistence-test' }, isDemo: false, isAuthenticated: true }),
}));
vi.mock('@/contexts/locale-context', () => ({ useI18n: () => ({ t: String, locale: 'en' }) }));
vi.mock('@/contexts/preferences-context', () => ({ usePreferences: () => ({ format: { money: String } }) }));
vi.mock('@/lib/price-alert-notifier', () => ({}));
vi.mock('@/lib/price-alert-history', () => ({}));
vi.mock('@/lib/operations-storage', () => ({}));
vi.mock('@/lib/document-bytes', () => ({}));
vi.mock('@/lib/supabase', () => ({ get supabase() { return adapters.client; }, isDemoMode: false }));
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: async (key: string) => adapters.storage.get(key) ?? null,
    setItem: async (key: string, value: string) => {
      if (adapters.rejectCacheWrites && key === 'professional_foodcost.workspace.v1.recipe-persistence-test') {
        throw new Error('Simulated cache write failure');
      }
      adapters.storage.set(key, value);
    },
  },
}));

const fetchFixture: typeof fetch = async (input, init) => {
  if (adapters.offline) throw new TypeError('Network request failed');
  const url = new URL(String(input));
  const route = url.pathname.split('/').at(-1);
  if (route === 'foodcost_cancel_recipe_create') {
    const { p_request_id: requestId } = JSON.parse(String(init?.body));
    const receipt = adapters.receipts.get(requestId);
    const row = receipt && adapters.rows.get(receipt.recipe_id);
    if (!receipt || !row) return Response.json(null);
    if (row.updated_at !== receipt.created_version) {
      return Response.json({ code: 'P0001', message: 'RECIPE_CONFLICT' }, { status: 400 });
    }
    adapters.rows.delete(receipt.recipe_id);
    return Response.json(null);
  }
  if (route === 'foodcost_save_recipe' || route === 'foodcost_create_recipe_once') {
    const { p_recipe: recipe, p_request_id: requestId } = JSON.parse(String(init?.body));
    const previousReceipt = requestId && adapters.receipts.get(requestId);
    if (previousReceipt) return Response.json({ ...previousReceipt, replayed: true });
    if (!recipe) return Response.json(null);
    if (!recipe.ingredients.length) throw new Error('Expected a valid recipe with ingredients');
    if (recipe.ingredients.some((ingredient: { subrecipe_id?: string }) => ingredient.subrecipe_id?.startsWith('offline-'))) {
      return Response.json({ code: '22P02', message: 'invalid input syntax for type uuid' }, { status: 400 });
    }
    const id = recipe.id ?? `cloud-${++adapters.nextId}`;
    const previous = adapters.rows.get(id);
    if (recipe.expected_updated_at && recipe.expected_updated_at !== previous?.updated_at) {
      return Response.json({ code: 'P0001', message: 'RECIPE_CONFLICT' }, { status: 400 });
    }
    const version = new Date(Date.UTC(2026, 10, 4, 0, 0, ++adapters.nextVersion)).toISOString();
    adapters.rows.set(id, {
      id, title: recipe.title, servings: recipe.servings, vat_percent: 11,
      target_food_cost: 30, created_at: '2026-11-04T00:00:00Z', updated_at: version,
      recipe_ingredients: recipe.ingredients.map((ingredient: { name: string; quantity: number }, index: number) => ({
        ...ingredient, id: `${id}-ingredient-${index}`, ingredient_name: ingredient.name, quantity_net: ingredient.quantity,
      })),
    });
    const receipt = { recipe_id: id, created_version: version, replayed: false };
    if (requestId) adapters.receipts.set(requestId, receipt);
    if (adapters.loseSaveResponse) throw new TypeError('Network request failed');
    return Response.json(requestId ? receipt : id);
  }
  if (route === 'recipes') {
    const idFilter = url.searchParams.get('id');
    if (idFilter?.startsWith('eq.') && init?.method === 'DELETE') {
      adapters.rows.delete(idFilter.slice(3));
      return new Response(null, { status: 204 });
    }
    if (idFilter?.startsWith('eq.')) {
      if (adapters.failReadback) {
        return Response.json({ code: 'PGRST116', message: 'Could not find one recipe row' }, { status: 406 });
      }
      return Response.json(adapters.rows.get(idFilter.slice(3)));
    }
    if (idFilter?.startsWith('in.(')) {
      const ids = idFilter.slice(4, -1).split(',');
      return Response.json([...adapters.rows.values()].filter(row => ids.includes(String(row.id))));
    }
    return Response.json(adapters.omitFromList ? [] : [...adapters.rows.values()]);
  }
  if (route === 'ingredient_catalog') return Response.json([]);
  if (route === 'recipe_ingredients' && init?.method === 'DELETE') return new Response(null, { status: 204 });
  if (route === 'foodcost_recalculate' || route === 'foodcost_capture_recipe_version') return Response.json(null);
  throw new Error(`Unexpected test request: ${url.pathname}`);
};

let tree: ReactTestRenderer | undefined;
let workspace: ReturnType<typeof useWorkspace>;
function Probe() {
  const current = useWorkspace();
  useEffect(() => { workspace = current; }, [current]);
  return null;
}
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
const titles = () => workspace.recipes.map(row => row.title);
const cachedTitles = async () => (await readWorkspaceCache(userId))?.recipes.map(row => row.title);
const save = (title: string) => workspace.saveRecipe({
  ...createEmptyRecipe(),
  title,
  ingredients: [{ ...createEmptyIngredient(), name: 'Flour', quantity: 100 }],
});

async function mount() {
  await act(async () => {
    tree = create(createElement(WorkspaceProvider, null, createElement(Probe)));
    await tick();
  });
}

async function unmount() {
  await act(async () => { tree?.unmount(); await tick(); });
  tree = undefined;
}

async function refresh() {
  await act(async () => { await workspace.refresh(); await tick(); });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  adapters.storage.clear();
  adapters.rows.clear();
  adapters.receipts.clear();
  adapters.offline = false;
  adapters.omitFromList = false;
  adapters.rejectCacheWrites = false;
  adapters.loseSaveResponse = false;
  adapters.failReadback = false;
  adapters.nextId = 0;
  adapters.nextVersion = 0;
  adapters.client = createClient('http://127.0.0.1:9876', 'recipe-fixture-key', {
    global: { fetch: fetchFixture },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  vi.spyOn(adapters.client.auth, 'getSession').mockResolvedValue({
    data: { session: { user: { id: userId }, access_token: 'recipe-owner-fixture-jwt' } as Session }, error: null,
  });
});

afterEach(async () => {
  await unmount();
  vi.unstubAllGlobals();
});

describe('recipe persistence through the workspace', () => {
  it('restores a durable queued recipe after restarting without its cache write', async () => {
    await mount();
    expect(adapters.storage.has(cacheKey)).toBe(true);
    adapters.offline = true;
    adapters.rejectCacheWrites = true;
    await act(async () => { await save('Queued offline'); await tick(); });
    expect(titles()).toEqual(['Queued offline']);
    expect(await cachedTitles()).toEqual([]);
    expect(await readPendingOperations(userId)).toHaveLength(1);

    await unmount();
    adapters.rejectCacheWrites = false;
    await mount();
    expect(titles()).toEqual(['Queued offline']);
    expect(workspace.pendingChanges).toBe(1);
  });

  it('preserves confirmed recipes omitted by a successful list, while honoring remote deletion', async () => {
    await mount();
    await act(async () => { await Promise.all([save('First'), save('Second')]); await tick(); });
    expect(titles()).toEqual(['Second', 'First']);
    expect(await cachedTitles()).toEqual(['Second', 'First']);

    adapters.omitFromList = true;
    await unmount();
    await mount();
    expect(titles()).toEqual(expect.arrayContaining(['First', 'Second']));
    expect(await cachedTitles()).toEqual(expect.arrayContaining(['First', 'Second']));

    adapters.rows.delete('cloud-1');
    await refresh();
    expect(titles()).toEqual(['Second']);
    expect(await cachedTitles()).toEqual(['Second']);
  });

  it('shows the confirmed ID after queue replay even if the following list omits it', async () => {
    await mount();
    adapters.offline = true;
    await act(async () => { await save('Replay'); await tick(); });
    expect(workspace.recipes[0]?.id).toMatch(/^offline-/);
    expect(await readPendingOperations(userId)).toHaveLength(1);

    adapters.offline = false;
    adapters.omitFromList = true;
    await refresh();
    expect(adapters.rows.size).toBe(1);
    expect(await readPendingOperations(userId)).toEqual([]);
    expect(workspace.recipes[0]).toMatchObject({ title: 'Replay', id: 'cloud-1' });
    expect(await cachedTitles()).toEqual(['Replay']);
  });

  it('retries the same create after a committed save loses its response', async () => {
    await mount();
    adapters.loseSaveResponse = true;
    await act(async () => { await save('One committed recipe'); await tick(); });
    expect(adapters.rows.size).toBe(1);
    expect(await readPendingOperations(userId)).toHaveLength(1);
    await unmount();

    adapters.loseSaveResponse = false;
    await mount();
    expect(adapters.rows.size).toBe(1);
    expect(await readPendingOperations(userId)).toEqual([]);
    expect(workspace.recipes).toMatchObject([{ title: 'One committed recipe', id: 'cloud-1' }]);
  });

  it('applies a later queued edit to the original cloud ID', async () => {
    await mount();
    adapters.loseSaveResponse = true;
    await act(async () => { await save('Original title'); await tick(); });
    await act(async () => {
      await workspace.saveRecipe({ ...workspace.recipes[0], title: 'Edited while waiting' });
    });
    expect(workspace.recipes[0]?.title).toBe('Edited while waiting');
    await unmount();

    adapters.loseSaveResponse = false;
    await mount();
    expect(await readPendingOperations(userId)).toEqual([]);
    expect([...adapters.rows.values()]).toMatchObject([{ id: 'cloud-1', title: 'Edited while waiting' }]);
    expect(workspace.recipes).toMatchObject([{ id: 'cloud-1', title: 'Edited while waiting' }]);
  });

  it('keeps a later queued edit as a draft if a different device already edited the confirmed recipe', async () => {
    await mount();
    adapters.loseSaveResponse = true;
    await act(async () => { await save('Original title'); await tick(); });
    await act(async () => {
      await workspace.saveRecipe({ ...workspace.recipes[0], title: 'My queued edit' });
    });
    adapters.rows.set('cloud-1', {
      ...adapters.rows.get('cloud-1'),
      title: 'Another device',
      updated_at: '2026-11-04T01:00:00.000Z',
    });
    adapters.loseSaveResponse = false;
    await refresh();
    expect(titles()).toEqual(['Another device']);
    expect(await loadRecipeDrafts(userId)).toMatchObject([{ draft: { title: 'My queued edit' } }]);
    expect(await readPendingOperations(userId)).toEqual([]);
  });

  it('deletes the original cloud row when a locally canceled create had already committed', async () => {
    await mount();
    adapters.loseSaveResponse = true;
    await act(async () => { await save('Canceled'); await tick(); });
    expect(adapters.rows.size).toBe(1);
    await act(async () => { await workspace.removeRecipe(workspace.recipes[0].id); });
    expect(titles()).toEqual([]);
    expect(await readPendingOperations(userId)).toHaveLength(1);

    adapters.loseSaveResponse = false;
    await refresh();
    expect(adapters.rows.size).toBe(0);
    expect(await readPendingOperations(userId)).toEqual([]);
    expect(titles()).toEqual([]);
  });

  it('preserves a later edit when canceling an ambiguous create', async () => {
    await mount();
    adapters.loseSaveResponse = true;
    await act(async () => { await save('Original title'); await tick(); });
    await act(async () => { await workspace.removeRecipe(workspace.recipes[0].id); });
    adapters.rows.set('cloud-1', {
      ...adapters.rows.get('cloud-1'), title: 'Another device',
      updated_at: '2026-11-04T01:00:00.000Z',
    });
    adapters.loseSaveResponse = false;
    await refresh();
    expect(titles()).toEqual(['Another device']);
    expect(workspace.failedChanges).toBe(1);
    expect(await readPendingOperations(userId)).toEqual([]);
  });

  it('remaps a queued subrecipe in both the frozen parent create and its newer edit', async () => {
    await mount();
    adapters.offline = true;
    await act(async () => {
      const base = await workspace.saveRecipe({
        ...createEmptyRecipe(), title: 'Base', isSubRecipe: true,
        ingredients: [{ ...createEmptyIngredient(), name: 'Flour', quantity: 100 }],
      });
      const parent = await workspace.saveRecipe({
        ...createEmptyRecipe(), title: 'Original parent',
        ingredients: [{
          ...createEmptyIngredient(), kind: 'sub_recipe', name: 'Base', quantity: 100, subRecipeId: base.id,
        }],
      });
      await workspace.saveRecipe({ ...parent, title: 'Edited parent' });
    });
    expect(await readPendingOperations(userId)).toHaveLength(2);

    adapters.offline = false;
    await refresh();
    expect(await readPendingOperations(userId)).toEqual([]);
    expect(workspace.recipes.find(recipe => recipe.title === 'Edited parent')?.ingredients)
      .toMatchObject([{ kind: 'sub_recipe', subRecipeId: 'cloud-1' }]);
  });

  it('keeps an edited queued subrecipe ahead of its dependent recipe', async () => {
    await mount();
    adapters.offline = true;
    await act(async () => {
      const base = await workspace.saveRecipe({
        ...createEmptyRecipe(), title: 'Base before edit', isSubRecipe: true,
        ingredients: [{ ...createEmptyIngredient(), name: 'Flour', quantity: 100 }],
      });
      await workspace.saveRecipe({
        ...createEmptyRecipe(), title: 'Parent',
        ingredients: [{
          ...createEmptyIngredient(), kind: 'sub_recipe', name: 'Base before edit', quantity: 100, subRecipeId: base.id,
        }],
      });
      await workspace.saveRecipe({ ...base, title: 'Base after edit' });
    });

    adapters.offline = false;
    await refresh();
    expect(await readPendingOperations(userId)).toEqual([]);
    expect(titles()).toEqual(expect.arrayContaining(['Base after edit', 'Parent']));
    expect(workspace.recipes.find(recipe => recipe.title === 'Parent')?.ingredients[0]?.subRecipeId).toBe('cloud-1');
  });

  it('replays a subrecipe before an older pending parent edit that now references it', async () => {
    await mount();
    adapters.offline = true;
    await act(async () => {
      const parent = await save('Parent before dependency');
      const base = await workspace.saveRecipe({
        ...createEmptyRecipe(), title: 'Later base', isSubRecipe: true,
        ingredients: [{ ...createEmptyIngredient(), name: 'Flour', quantity: 100 }],
      });
      await workspace.saveRecipe({
        ...parent,
        ingredients: [{
          ...createEmptyIngredient(), kind: 'sub_recipe', name: 'Later base', quantity: 100, subRecipeId: base.id,
        }],
      });
    });

    adapters.offline = false;
    await refresh();
    expect(await readPendingOperations(userId)).toEqual([]);
    expect(adapters.rows.size).toBe(2);
    expect(workspace.recipes.find(recipe => recipe.title === 'Parent before dependency')?.ingredients[0]?.subRecipeId).toBe('cloud-2');
  });

  it('retains the receipt key when a pending create cancellation is repeated', async () => {
    await mount();
    adapters.loseSaveResponse = true;
    await act(async () => { await save('Canceled twice'); await tick(); });
    const id = workspace.recipes[0].id;
    await act(async () => {
      await workspace.removeRecipe(id);
      await workspace.removeRecipe(id);
    });
    adapters.loseSaveResponse = false;
    await refresh();
    expect(adapters.rows.size).toBe(0);
    expect(await readPendingOperations(userId)).toEqual([]);
  });

  it('preserves the confirmed create key across non-network readback errors and an editor retry', async () => {
    await mount();
    adapters.failReadback = true;
    let failure: unknown;
    await act(async () => { failure = await save('Committed before readback').catch(error => error); });
    expect(adapters.rows.size).toBe(1);
    expect(failure).toBeInstanceOf(RecipeSaveIncompleteError);
    const retryDraft = (failure as RecipeSaveIncompleteError).retryDraft;
    expect(retryDraft.id).toMatch(/^offline-recipe-/);
    expect(await readPendingOperations(userId)).toMatchObject([{ localId: retryDraft.id }]);

    await refresh();
    await refresh();
    await refresh();
    expect(await readPendingOperations(userId)).toMatchObject([{ localId: retryDraft.id }]);
    expect(workspace.failedChanges).toBe(0);

    adapters.failReadback = false;
    await act(async () => { await workspace.saveRecipe(retryDraft); });
    await refresh();
    expect(adapters.rows.size).toBe(1);
    expect(await readPendingOperations(userId)).toEqual([]);
    expect(workspace.recipes).toMatchObject([{ title: 'Committed before readback', id: 'cloud-1' }]);
  });
});
