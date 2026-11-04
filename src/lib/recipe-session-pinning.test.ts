import { createClient, type Session, type User } from '@supabase/supabase-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createEmptyIngredient, createEmptyRecipe } from '@/lib/calculations';
import { saveRecipe } from '@/lib/recipes-repository';
import type { RecipeDraft } from '@/types/recipe';

const fixture = vi.hoisted(() => ({
  client: null as ReturnType<typeof createClient> | null,
  userId: 'owner-a',
  requests: [] as { route: string; bearer: string | null }[],
  switchAt: '' as 'lookup' | 'upload' | 'version' | '',
}));
vi.mock('@/lib/supabase', () => ({ get supabase() { return fixture.client; }, isDemoMode: false }));
vi.mock('@react-native-async-storage/async-storage', () => ({ default: {} }));
vi.mock('@/lib/document-bytes', () => ({ readDocumentBytes: async () => new ArrayBuffer(3) }));

const ownerId = 'owner-a';
const key = 'offline-recipe-a';
const version = '2026-11-04T00:00:01Z';
const row = {
  id: 'cloud-recipe', title: 'Flour test', servings: 2, vat_percent: 11,
  target_food_cost: 30, created_at: version, updated_at: version, recipe_ingredients: [],
};
const draft = (extra: Partial<RecipeDraft> = {}): RecipeDraft => ({
  ...createEmptyRecipe(), title: 'Flour test',
  ingredients: [{ ...createEmptyIngredient(), name: 'Flour', quantity: 100 }],
  ...extra,
});
const switchOwner = async (phase: typeof fixture.switchAt) => {
  if (fixture.switchAt !== phase) return;
  // Let the HTTP request finish after the global client has received the next account.
  await Promise.resolve();
  fixture.userId = 'owner-b';
};

const fetchFixture: typeof fetch = async (input, init) => {
  const url = new URL(String(input));
  const route = url.pathname.split('/').at(-1) ?? '';
  const bearer = new Headers(init?.headers).get('Authorization');
  fixture.requests.push({ route, bearer });
  if (route === 'foodcost_capture_recipe_version') {
    await switchOwner('version');
    return Response.json(null);
  }
  if (route === 'foodcost_create_recipe_once') {
    const { p_recipe: recipe } = JSON.parse(String(init?.body));
    if (!recipe) {
      await switchOwner('lookup');
      return Response.json(null);
    }
    return Response.json({ recipe_id: row.id, created_version: version, replayed: false });
  }
  if (route === 'foodcost_save_recipe') return Response.json(row.id);
  if (route === 'recipes') return Response.json(row);
  if (url.pathname.startsWith('/storage/v1/object/recipe-images/')) {
    await switchOwner('upload');
    return Response.json({ Id: 'fixture-photo', Key: 'recipe-images/owner-a/photo.jpg' });
  }
  throw new Error(`Unexpected test route ${url.pathname}`);
};

beforeEach(() => {
  fixture.userId = ownerId;
  fixture.requests = [];
  fixture.switchAt = '';
  fixture.client = createClient('http://127.0.0.1:9876', 'recipe-fixture-key', {
    global: { fetch: fetchFixture },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  vi.spyOn(fixture.client.auth, 'getSession').mockImplementation(async () => ({
    data: { session: { user: { id: fixture.userId }, access_token: `jwt-${fixture.userId}` } as Session }, error: null,
  }));
  vi.spyOn(fixture.client.auth, 'getUser').mockImplementation(async () => ({
    data: { user: { id: fixture.userId } as User }, error: null,
  }));
});

describe('recipe mutation account affinity', () => {
  it('retains the original JWT after a queued create receipt lookup crosses an account switch', async () => {
    fixture.switchAt = 'lookup';
    await saveRecipe(draft(), { userId: ownerId, createRequestId: key, retry: true });
    expect(fixture.requests.filter(entry => entry.route === 'foodcost_create_recipe_once').map(entry => entry.bearer))
      .toEqual(['Bearer jwt-owner-a', 'Bearer jwt-owner-a']);
  });

  it('retains the original JWT after a photo upload crosses an account switch', async () => {
    fixture.switchAt = 'upload';
    await saveRecipe(draft({ photoUri: 'file:///fixture.jpg' }), { userId: ownerId, createRequestId: key });
    expect(fixture.requests.find(entry => entry.route === 'foodcost_create_recipe_once')?.bearer).toBe('Bearer jwt-owner-a');
  });

  it('retains the original JWT after a version capture crosses an account switch', async () => {
    fixture.switchAt = 'version';
    await saveRecipe(draft({ id: row.id }), { userId: ownerId });
    expect(fixture.requests.find(entry => entry.route === 'foodcost_save_recipe')?.bearer).toBe('Bearer jwt-owner-a');
  });

  it('does not dispatch a mutation when the repository starts with another account active', async () => {
    fixture.userId = 'owner-b';
    await expect(saveRecipe(draft(), { userId: ownerId, createRequestId: key })).rejects.toThrow('workspace-changed');
    expect(fixture.requests).toEqual([]);
  });
});
