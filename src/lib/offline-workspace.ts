/**
 * MANAGER 24/7™ by PARADIM — proprietary software.
 * Copyright © 2026 PARADIM Operations SRL. All rights reserved.
 * Concept author and product director: Marius Paul Nemeșu.
 * See LICENSE-PROPRIETARY.md.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { saveRecipeDraft } from '@/lib/recipe-drafts';
import { withStorageLock } from '@/lib/storage-lock';

import { calculateRecipeTotals, resolveRecipeAllergens } from '@/lib/calculations';
import type {
  CatalogIngredient,
  CatalogIngredientDraft,
  CatalogPriceUpdate,
  Recipe,
  RecipeDraft,
} from '@/types/recipe';

export type WorkspaceCache = {
  recipes: Recipe[];
  catalog: CatalogIngredient[];
  savedAt: string;
};

type OperationMeta = { id: string; createdAt: string; attempts?: number };

export type PendingOperation =
  | (OperationMeta & { type: 'saveRecipe'; localId: string; draft: RecipeDraft })
  | (OperationMeta & { type: 'deleteRecipe'; recipeId: string })
  | (OperationMeta & { type: 'saveCatalog'; localId: string; draft: CatalogIngredientDraft })
  | (OperationMeta & { type: 'deleteCatalog'; catalogId: string })
  | (OperationMeta & { type: 'updatePrices'; updates: CatalogPriceUpdate[] });

export const MAX_ATTEMPTS = 3;

export type PendingOperationInput =
  | { type: 'saveRecipe'; localId: string; draft: RecipeDraft }
  | { type: 'deleteRecipe'; recipeId: string }
  | { type: 'saveCatalog'; localId: string; draft: CatalogIngredientDraft }
  | { type: 'deleteCatalog'; catalogId: string }
  | { type: 'updatePrices'; updates: CatalogPriceUpdate[] };

const cacheKey = (userId: string) => `professional_foodcost.workspace.v1.${userId}`;
const queueKey = (userId: string) => `professional_foodcost.sync_queue.v1.${userId}`;
const failedKey = (userId: string) => `professional_foodcost.sync_failed.v1.${userId}`;

export function createOfflineId(kind: 'recipe' | 'catalog'): string {
  return `offline-${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function isOfflineId(id: string | null | undefined): boolean {
  return Boolean(id?.startsWith('offline-'));
}

/**
 * Supabase/PostgREST errors are plain objects, not always `Error` instances.
 * The offline decision and the operator-facing message must inspect the same
 * underlying fields instead of reducing them to "[object Object]".
 */
export function workspaceErrorMessage(error: unknown, fallback = ''): string {
  if (error instanceof Error && error.message.trim()) return error.message.trim();
  if (typeof error === 'string' && error.trim()) return error.trim();
  if (!error || typeof error !== 'object') return fallback;

  const value = error as Record<string, unknown>;
  const parts = [value.message, value.details, value.hint, value.code]
    .filter((item): item is string => typeof item === 'string' && Boolean(item.trim()))
    .map((item) => item.trim());
  return [...new Set(parts)].join('\n') || fallback;
}

export function isNetworkError(error: unknown): boolean {
  const message = workspaceErrorMessage(error, String(error ?? ''));
  const code = error && typeof error === 'object'
    ? String((error as Record<string, unknown>).code ?? '')
    : '';
  return /network request failed|fetch failed|failed to fetch|networkerror|load failed|timed? ?out|connection|offline|socket|dns/i.test(message)
    || /^(PGRST003|ETIMEDOUT|ECONNRESET|ECONNREFUSED|ENETUNREACH|EAI_AGAIN)$/i.test(code);
}

export async function readWorkspaceCache(userId: string): Promise<WorkspaceCache | null> {
  const raw = await AsyncStorage.getItem(cacheKey(userId));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as WorkspaceCache;
    if (!Array.isArray(parsed.recipes) || !Array.isArray(parsed.catalog)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function writeWorkspaceCache(
  userId: string,
  recipes: readonly Recipe[],
  catalog: readonly CatalogIngredient[],
): Promise<void> {
  const value: WorkspaceCache = {
    recipes: [...recipes],
    catalog: [...catalog],
    savedAt: new Date().toISOString(),
  };
  await withStorageLock('workspace-cache:' + userId, () => AsyncStorage.setItem(cacheKey(userId), JSON.stringify(value)));
}

export async function readPendingOperations(userId: string): Promise<PendingOperation[]> {
  const raw = await AsyncStorage.getItem(queueKey(userId));
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed as PendingOperation[] : [];
  } catch {
    return [];
  }
}

export async function writePendingOperations(
  userId: string,
  operations: readonly PendingOperation[],
): Promise<void> {
  await AsyncStorage.setItem(queueKey(userId), JSON.stringify(operations));
}

export async function readFailedOperations(userId: string): Promise<PendingOperation[]> {
  const raw = await AsyncStorage.getItem(failedKey(userId));
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed as PendingOperation[] : [];
  } catch {
    return [];
  }
}

export async function writeFailedOperations(
  userId: string,
  operations: readonly PendingOperation[],
): Promise<void> {
  await AsyncStorage.setItem(failedKey(userId), JSON.stringify(operations.slice(-50)));
}

export async function quarantineOperation(
  userId: string,
  operation: PendingOperation,
): Promise<PendingOperation[]> {
  const failed = await readFailedOperations(userId);
  const next = [...failed, operation];
  await writeFailedOperations(userId, next);
  return next.slice(-50);
}

export async function clearFailedOperations(userId: string): Promise<void> {
  await AsyncStorage.removeItem(failedKey(userId));
}

export async function recordOperationFailure(
  userId: string,
  operations: readonly PendingOperation[],
): Promise<{ pending: PendingOperation[]; quarantined: boolean }> {
  const [operation, ...rest] = operations;
  if (!operation) return { pending: [], quarantined: false };

  const attempts = (operation.attempts ?? 0) + 1;
  if (attempts < MAX_ATTEMPTS) {
    const pending = [{ ...operation, attempts }, ...rest];
    await writePendingOperations(userId, pending);
    return { pending, quarantined: false };
  }

  await quarantineOperation(userId, { ...operation, attempts });
  await writePendingOperations(userId, rest);
  return { pending: rest, quarantined: true };
}

function operationId() {
  return `op-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

async function enqueueOperationUnlocked(
  userId: string,
  input: PendingOperationInput,
): Promise<PendingOperation[]> {
  const current = await readPendingOperations(userId);
  const now = new Date().toISOString();
  let next = [...current];
  let operation = input;

  if (input.type === 'saveRecipe') {
    const localId = input.localId;
    const previous = next.find((item) => item.type === 'saveRecipe' && item.localId === localId);
    if (previous?.type === 'saveRecipe' && previous.draft.expectedUpdatedAt) {
      operation = { ...input, draft: { ...input.draft, expectedUpdatedAt: previous.draft.expectedUpdatedAt } };
    }
    next = next.filter((item) => !(
      item.type === 'saveRecipe' && item.localId === localId
    ));
  } else if (input.type === 'deleteRecipe') {
    const recipeId = input.recipeId;
    const localOnly = isOfflineId(recipeId)
      && next.some((item) => item.type === 'saveRecipe' && item.localId === recipeId);
    next = next.filter((item) => !(
      (item.type === 'saveRecipe' && item.localId === recipeId)
      || (item.type === 'deleteRecipe' && item.recipeId === recipeId)
    ));
    if (localOnly) {
      await writePendingOperations(userId, next);
      return next;
    }
  } else if (input.type === 'saveCatalog') {
    const localId = input.localId;
    next = next.filter((item) => !(
      item.type === 'saveCatalog' && item.localId === localId
    ));
  } else if (input.type === 'deleteCatalog') {
    const catalogId = input.catalogId;
    const localOnly = isOfflineId(catalogId)
      && next.some((item) => item.type === 'saveCatalog' && item.localId === catalogId);
    next = next.filter((item) => !(
      (item.type === 'saveCatalog' && item.localId === catalogId)
      || (item.type === 'deleteCatalog' && item.catalogId === catalogId)
    ));
    if (localOnly) {
      await writePendingOperations(userId, next);
      return next;
    }
  } else if (input.type === 'updatePrices') {
    const merged = new Map<string, CatalogPriceUpdate>();
    for (const item of next) {
      if (item.type === 'updatePrices') {
        item.updates.forEach((update) => merged.set(update.id, update));
      }
    }
    input.updates.forEach((update) => merged.set(update.id, update));
    next = next.filter((item) => item.type !== 'updatePrices');
    operation = { type: 'updatePrices', updates: [...merged.values()] };
  }

  const saved = { ...operation, id: operationId(), createdAt: now } as PendingOperation;
  next.push(saved);
  await writePendingOperations(userId, next);
  return next;
}

export function enqueueOperation(userId: string, input: PendingOperationInput) {
  return withStorageLock('offline-queue:' + userId, () => enqueueOperationUnlocked(userId, input));
}

/** Preserve a confirmed insert ID and version even if its photo attachment fails. */
export function rebasePendingRecipeSave(userId: string, operation: PendingOperation, retryDraft: RecipeDraft) {
  return withStorageLock('offline-queue:' + userId, async () => {
    const current = await readPendingOperations(userId);
    if (operation.type !== 'saveRecipe' || !retryDraft.id) return current;
    const next = remapPendingOperations(current, operation.localId, retryDraft.id).map((item) => {
      if (item.type !== 'saveRecipe' || item.localId !== retryDraft.id) return item;
      return { ...item, draft: item.id === operation.id ? retryDraft : {
        ...item.draft, expectedUpdatedAt: retryDraft.expectedUpdatedAt,
      } };
    });
    await writePendingOperations(userId, next);
    return next;
  });
}

/** Acknowledgements remove only the completed operation, preserving work queued during the request. */
export function acknowledgePendingOperation(userId: string, operation: PendingOperation,
  remap: { from: string; to: string } | null = null, savedVersion?: string) {
  return withStorageLock('offline-queue:' + userId, async () => {
    let next = (await readPendingOperations(userId)).filter((item) => item.id !== operation.id);
    if (remap) next = remapPendingOperations(next, remap.from, remap.to);
    if (operation.type === 'saveRecipe' && savedVersion) {
      const recipeId = remap?.to ?? operation.localId;
      next = next.map((item) => item.type === 'saveRecipe' && item.localId === recipeId
        ? { ...item, draft: { ...item.draft, expectedUpdatedAt: savedVersion } } : item);
    }
    await writePendingOperations(userId, next);
    return next;
  });
}

export function rejectPendingOperation(userId: string, operation: PendingOperation, error: unknown) {
  return withStorageLock('offline-queue:' + userId, async () => {
    const current = await readPendingOperations(userId);
    const latest = current.find((item) => item.id === operation.id);
    if (!latest) return { pending: current, quarantined: true };
    const conflict = latest.type === 'saveRecipe' && /RECIPE_CONFLICT/.test(workspaceErrorMessage(error));
    const attempts = (latest.attempts ?? 0) + 1;
    if (!conflict && attempts < MAX_ATTEMPTS) {
      const pending = current.map((item) => item.id === latest.id ? { ...item, attempts } : item);
      await writePendingOperations(userId, pending);
      return { pending, quarantined: false };
    }
    if (conflict && latest.type === 'saveRecipe') await saveRecipeDraft(userId, latest.localId, latest.draft);
    await quarantineOperation(userId, { ...latest, attempts });
    const pending = current.filter((item) => item.id !== latest.id);
    await writePendingOperations(userId, pending);
    return { pending, quarantined: true };
  });
}

export function remapPendingOperations(
  operations: readonly PendingOperation[],
  fromId: string,
  toId: string,
): PendingOperation[] {
  return operations.map((item) => {
    if (item.type === 'saveRecipe') {
      return {
        ...item,
        localId: item.localId === fromId ? toId : item.localId,
        draft: {
          ...item.draft,
          id: item.draft.id === fromId ? toId : item.draft.id,
          ingredients: item.draft.ingredients.map((ingredient) => ({
            ...ingredient,
            catalogId: ingredient.catalogId === fromId ? toId : ingredient.catalogId,
            subRecipeId: ingredient.subRecipeId === fromId ? toId : ingredient.subRecipeId,
          })),
        },
      };
    }
    if (item.type === 'deleteRecipe') {
      return { ...item, recipeId: item.recipeId === fromId ? toId : item.recipeId };
    }
    if (item.type === 'saveCatalog') {
      return {
        ...item,
        localId: item.localId === fromId ? toId : item.localId,
        draft: { ...item.draft, id: item.draft.id === fromId ? toId : item.draft.id },
      };
    }
    if (item.type === 'deleteCatalog') {
      return { ...item, catalogId: item.catalogId === fromId ? toId : item.catalogId };
    }
    return {
      ...item,
      updates: item.updates.map((update) => ({
        ...update,
        id: update.id === fromId ? toId : update.id,
      })),
    };
  });
}

export function makeOptimisticRecipe(
  draft: RecipeDraft,
  current: readonly Recipe[],
): Recipe {
  const now = new Date().toISOString();
  const id = draft.id ?? createOfflineId('recipe');
  const existing = current.find((item) => item.id === id);
  return {
    ...draft,
    id,
    allergens: resolveRecipeAllergens(draft.ingredients, draft.manualAllergens),
    totals: calculateRecipeTotals(draft),
    photoPath: draft.photoPath ?? null,
    photoUrl: draft.photoUri ?? null,
    createdAt: current.find((item) => item.id === id)?.createdAt ?? now,
    updatedAt: now,
    serverUpdatedAt: existing?.serverUpdatedAt ?? draft.expectedUpdatedAt
      ?? (existing && !isOfflineId(id) ? existing.updatedAt : undefined),
  };
}

export function makeOptimisticCatalog(
  draft: CatalogIngredientDraft,
  current: readonly CatalogIngredient[],
): CatalogIngredient {
  const now = new Date().toISOString();
  const id = draft.id ?? createOfflineId('catalog');
  return {
    ...draft,
    id,
    updatedAt: now,
  };
}
