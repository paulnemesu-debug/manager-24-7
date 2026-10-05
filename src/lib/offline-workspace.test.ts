/**
 * MANAGER 24/7™ by PARADIM — proprietary software.
 * Copyright © 2026 PARADIM Operations SRL. All rights reserved.
 * Concept author and product director: Marius Paul Nemeșu.
 * See LICENSE-PROPRIETARY.md.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const storage = new Map<string, string>();

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: vi.fn(async (key: string) => storage.get(key) ?? null),
    setItem: vi.fn(async (key: string, value: string) => { storage.set(key, value); }),
    removeItem: vi.fn(async (key: string) => { storage.delete(key); }),
  },
}));

import { createEmptyRecipe } from '@/lib/calculations';
import { loadRecipeDrafts } from '@/lib/recipe-drafts';
import {
  acknowledgePendingOperation,
  clearFailedOperations,
  enqueueOperation,
  isNetworkError,
  quarantineOperation,
  recordOperationFailure,
  readFailedOperations,
  readPendingOperations,
  readWorkspaceCache,
  remapPendingOperations,
  rebasePendingRecipeSave,
  workspaceErrorMessage,
  writeWorkspaceCache,
  makeOptimisticRecipe,
  rejectPendingOperation,
} from '@/lib/offline-workspace';
import type { CatalogIngredient, CatalogIngredientDraft, RecipeDraft } from '@/types/recipe';

const userId = 'user-1';

describe('concurrent queue and recipe version recovery', () => {
  beforeEach(() => storage.clear());
  it('a confirmed insert with an incomplete photo never retries as a new recipe', async () => {
    const [operation] = await enqueueOperation(userId, { type: 'saveRecipe', localId: 'offline-recipe-one', draft: recipeDraft('offline-recipe-one') });
    const [rebased] = await rebasePendingRecipeSave(userId, operation, { ...recipeDraft('cloud-confirmed'), expectedUpdatedAt: '2026-10-04T10:01:00Z' });
    expect(rebased.type === 'saveRecipe' && rebased.localId).toBe('cloud-confirmed');
    expect(rebased.type === 'saveRecipe' && rebased.draft.id).toBe('cloud-confirmed');
    expect(rebased.type === 'saveRecipe' && rebased.draft.expectedUpdatedAt).toBe('2026-10-04T10:01:00Z');
  });
  it('partial save recovery retains a newer edit queued while the attachment was in flight', async () => {
    const [operation] = await enqueueOperation(userId, { type: 'saveRecipe', localId: 'offline-recipe-one', draft: recipeDraft('offline-recipe-one') });
    await enqueueOperation(userId, { type: 'saveRecipe', localId: 'offline-recipe-one', draft: { ...recipeDraft('offline-recipe-one'), title: 'Latest local edit' } });
    const [rebased] = await rebasePendingRecipeSave(userId, operation, { ...recipeDraft('cloud-confirmed'), title: 'Older confirmed edit', expectedUpdatedAt: 'confirmed-version' });
    expect(rebased.type === 'saveRecipe' && rebased.draft.title).toBe('Latest local edit');
    expect(rebased.type === 'saveRecipe' && rebased.draft.id).toBe('cloud-confirmed');
    expect(rebased.type === 'saveRecipe' && rebased.draft.expectedUpdatedAt).toBe('confirmed-version');
  });
  it('retains concurrent writes and work queued while another request was in flight', async () => {
    await Promise.all(['one', 'two'].map((id) => enqueueOperation(userId, { type: 'saveRecipe', localId: id, draft: recipeDraft(id) })));
    const [first] = await readPendingOperations(userId);
    await enqueueOperation(userId, { type: 'saveRecipe', localId: 'third', draft: recipeDraft('third') });
    expect(await acknowledgePendingOperation(userId, first)).toHaveLength(2);
    expect((await readPendingOperations(userId)).some((item) => item.type === 'saveRecipe' && item.localId === 'third')).toBe(true);
  });
  it('preserves the original cloud version while coalescing multiple offline edits', async () => {
    const firstDraft = { ...recipeDraft('cloud-id'), expectedUpdatedAt: '2026-10-01T00:00:00Z' };
    expect(makeOptimisticRecipe(firstDraft, []).serverUpdatedAt).toBe(firstDraft.expectedUpdatedAt);
    await enqueueOperation(userId, { type: 'saveRecipe', localId: 'cloud-id', draft: firstDraft });
    await enqueueOperation(userId, { type: 'saveRecipe', localId: 'cloud-id', draft: { ...firstDraft, title: 'Newest edit', expectedUpdatedAt: 'wrong-local-clock' } });
    const [queued] = await readPendingOperations(userId);
    expect(queued.type === 'saveRecipe' && queued.draft.expectedUpdatedAt).toBe(firstDraft.expectedUpdatedAt);
    expect(queued.type === 'saveRecipe' && queued.draft.title).toBe('Newest edit');
  });
  it('rebases a later edit after its own earlier save was acknowledged', async () => {
    const [old] = await enqueueOperation(userId, { type: 'saveRecipe', localId: 'cloud-id', draft: recipeDraft('cloud-id') });
    await enqueueOperation(userId, { type: 'saveRecipe', localId: 'cloud-id', draft: { ...recipeDraft('cloud-id'), title: 'Latest' } });
    const [latest] = await acknowledgePendingOperation(userId, old, null, '2026-10-04T00:00:00Z');
    expect(latest.type === 'saveRecipe' && latest.draft.title).toBe('Latest');
    expect(latest.type === 'saveRecipe' && latest.draft.expectedUpdatedAt).toBe('2026-10-04T00:00:00Z');
  });
  it('recovers a conflicting queued edit as a draft and allows unrelated operations to continue', async () => {
    const [op] = await enqueueOperation(userId, { type: 'saveRecipe', localId: 'cloud-id', draft: recipeDraft('cloud-id') });
    await enqueueOperation(userId, { type: 'saveRecipe', localId: 'other', draft: recipeDraft('other') });
    const result = await rejectPendingOperation(userId, op, new Error('RECIPE_CONFLICT'));
    expect(result.quarantined).toBe(true);
    expect(result.pending).toHaveLength(1);
    expect((await loadRecipeDrafts(userId))[0].draft.title).toBe('Supă');
    expect(await readFailedOperations(userId)).toHaveLength(1);
  });
});

function recipeDraft(id = 'offline-recipe-1'): RecipeDraft {
  return { ...createEmptyRecipe(), id, title: 'Supă' };
}

function catalogDraft(id = 'offline-catalog-1'): CatalogIngredientDraft {
  return {
    id,
    name: 'Făină',
    purchasePrice: 4.48,
    priceUnit: 'kg',
    packageQuantity: 25,
    packagePrice: 112,
    defaultLossPercent: 0,
    supplier: 'Furnizor',
    notes: null,
    allergens: ['gluten'],
    active: true,
  };
}

beforeEach(() => storage.clear());

describe('offline workspace', () => {
  it('recognises network failures without hiding validation errors', () => {
    expect(isNetworkError(new Error('Network request failed'))).toBe(true);
    expect(isNetworkError({ message: 'TypeError: Network request failed', code: '' })).toBe(true);
    expect(isNetworkError({ message: 'Database timeout', code: 'PGRST003' })).toBe(true);
    expect(isNetworkError(new Error('violates check constraint'))).toBe(false);
  });

  it('extracts useful details from plain Supabase errors', () => {
    expect(workspaceErrorMessage({
      message: 'INVALID_INGREDIENT',
      details: 'quantity must be greater than zero',
      code: 'P0001',
    })).toBe('INVALID_INGREDIENT\nquantity must be greater than zero\nP0001');
    expect(workspaceErrorMessage(null, 'fallback')).toBe('fallback');
  });

  it('writes and restores the workspace cache', async () => {
    const catalog: CatalogIngredient = {
      ...catalogDraft('catalog-1'),
      id: 'catalog-1',
      updatedAt: '2026-09-13T00:00:00.000Z',
    };
    await writeWorkspaceCache(userId, [], [catalog]);
    const cached = await readWorkspaceCache(userId);
    expect(cached?.catalog[0]).toMatchObject({ name: 'Făină', packagePrice: 112 });
  });

  it('keeps only the newest offline save for the same recipe', async () => {
    await enqueueOperation(userId, {
      type: 'saveRecipe', localId: 'offline-recipe-1', draft: recipeDraft(),
    });
    await enqueueOperation(userId, {
      type: 'saveRecipe', localId: 'offline-recipe-1', draft: { ...recipeDraft(), title: 'Supă nouă' },
    });
    const queue = await readPendingOperations(userId);
    expect(queue).toHaveLength(1);
    expect(queue[0]).toMatchObject({ type: 'saveRecipe', draft: { title: 'Supă nouă' } });
  });

  it('cancels a local create when it is deleted before synchronisation', async () => {
    await enqueueOperation(userId, {
      type: 'saveCatalog', localId: 'offline-catalog-1', draft: catalogDraft(),
    });
    await enqueueOperation(userId, { type: 'deleteCatalog', catalogId: 'offline-catalog-1' });
    expect(await readPendingOperations(userId)).toEqual([]);
  });

  it('remaps local IDs after the server creates the real row', async () => {
    const queue = await enqueueOperation(userId, {
      type: 'saveRecipe', localId: 'offline-recipe-1', draft: recipeDraft(),
    });
    const remapped = remapPendingOperations(queue, 'offline-recipe-1', 'server-recipe-1');
    expect(remapped[0]).toMatchObject({
      type: 'saveRecipe',
      localId: 'server-recipe-1',
      draft: { id: 'server-recipe-1' },
    });
  });
});

describe('operații respinse definitiv', () => {
  it('le pune deoparte și le poate confirma fără să modifice coada activă', async () => {
    await enqueueOperation(userId, { type: 'deleteRecipe', recipeId: 'server-recipe-1' });
    const [queued] = await readPendingOperations(userId);

    await quarantineOperation(userId, { ...queued, attempts: 3 });

    expect(await readFailedOperations(userId)).toMatchObject([{ attempts: 3 }]);
    expect(await readPendingOperations(userId)).toHaveLength(1);

    await clearFailedOperations(userId);
    expect(await readFailedOperations(userId)).toEqual([]);
  });

  it('păstrează cel mult ultimele 50 de operații eșuate', async () => {
    for (let index = 0; index < 55; index += 1) {
      await quarantineOperation(userId, {
        id: `op-${index}`,
        type: 'deleteRecipe',
        recipeId: `recipe-${index}`,
        createdAt: new Date().toISOString(),
        attempts: 3,
      });
    }

    const failed = await readFailedOperations(userId);
    expect(failed).toHaveLength(50);
    expect(failed[0].id).toBe('op-5');
    expect(failed.at(-1)?.id).toBe('op-54');
  });

  it('eliberează coada numai după trei respingeri consecutive', async () => {
    await enqueueOperation(userId, { type: 'deleteRecipe', recipeId: 'invalid-recipe' });
    await enqueueOperation(userId, { type: 'deleteRecipe', recipeId: 'valid-recipe' });
    let pending = await readPendingOperations(userId);

    let result = await recordOperationFailure(userId, pending);
    expect(result.quarantined).toBe(false);
    expect(result.pending).toHaveLength(2);
    expect(result.pending[0].attempts).toBe(1);

    result = await recordOperationFailure(userId, result.pending);
    expect(result.quarantined).toBe(false);
    expect(result.pending[0].attempts).toBe(2);

    result = await recordOperationFailure(userId, result.pending);
    expect(result.quarantined).toBe(true);
    expect(result.pending).toHaveLength(1);
    expect(result.pending[0]).toMatchObject({ recipeId: 'valid-recipe' });
    expect(await readFailedOperations(userId)).toMatchObject([
      { recipeId: 'invalid-recipe', attempts: 3 },
    ]);
  });
});
