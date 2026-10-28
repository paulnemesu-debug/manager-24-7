/**
 * MANAGER 24/7™ by PARADIM — proprietary software.
 * Copyright © 2026 PARADIM Operations SRL. All rights reserved.
 * Concept author and product director: Marius Paul Nemeșu.
 * See LICENSE-PROPRIETARY.md.
 */

import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AppState } from 'react-native';

import { useAuth } from '@/contexts/auth-context';
import { useI18n } from '@/contexts/locale-context';
import { usePreferences } from '@/contexts/preferences-context';
import { isInstantDemoActive } from '@/lib/demo-isolation';
import { isDemoMode } from '@/lib/supabase';
import { calculatePriceAlert } from '@/lib/price-alerts';
import { recordPriceAlert } from '@/lib/price-alert-history';
import { notifyPriceAlert } from '@/lib/price-alert-notifier';
import { loadSales } from '@/lib/operations-storage';
import * as catalogRepository from '@/lib/catalog-repository';
import { createEmptyIngredientNutrition, enrichIngredientNutrition, enrichRecipeNutrition } from '@/lib/nutrition';
import {
  acknowledgePendingOperation,
  clearFailedOperations,
  enqueueOperation,
  isNetworkError,
  isOfflineId,
  makeOptimisticCatalog,
  makeOptimisticRecipe,
  readFailedOperations,
  readPendingOperations,
  readWorkspaceCache,
  rebasePendingRecipeSave,
  rejectPendingOperation,
  writeWorkspaceCache,
  workspaceErrorMessage,
} from '@/lib/offline-workspace';
import { resolveRecipeGraph } from '@/lib/recipe-graph';
import { withStorageLock } from '@/lib/storage-lock';
import * as recipesRepository from '@/lib/recipes-repository';
import type {
  CatalogIngredient,
  CatalogIngredientDraft,
  CatalogPriceUpdate,
  PriceUnit,
  Recipe,
  RecipeDraft,
} from '@/types/recipe';

export type SyncState = 'online' | 'offline' | 'syncing';

type WorkspaceContextValue = {
  recipes: Recipe[];
  catalog: CatalogIngredient[];
  isLoading: boolean;
  error: string | null;
  syncState: SyncState;
  pendingChanges: number;
  failedChanges: number;
  dismissFailedChanges: () => Promise<void>;
  lastSyncedAt: string | null;
  refresh: () => Promise<void>;
  saveRecipe: (draft: RecipeDraft) => Promise<Recipe>;
  removeRecipe: (recipeId: string) => Promise<void>;
  findRecipe: (recipeId?: string) => Recipe | undefined;
  subRecipes: Recipe[];
  saveCatalogIngredient: (draft: CatalogIngredientDraft) => Promise<CatalogIngredient>;
  removeCatalogIngredient: (catalogId: string) => Promise<void>;
  applyPriceUpdates: (updates: readonly CatalogPriceUpdate[]) => Promise<number>;
  importNewCatalogItems: (
    items: readonly { name: string; purchasePrice: number; priceUnit: PriceUnit; supplier?: string | null; notes?: string | null }[],
  ) => Promise<number>;
};

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

async function flushPendingOperations(userId: string, assertCurrent: () => void): Promise<number> {
  assertCurrent();
  let pending = await readPendingOperations(userId);
  let completed = 0;

  while (pending.length) {
    assertCurrent();
    const [operation] = pending;
    let remap: { from: string; to: string } | null = null;
    let savedVersion: string | undefined;

    try {
      if (operation.type === 'saveCatalog') {
        const saved = await catalogRepository.saveCatalogIngredient({
          ...operation.draft,
          id: isOfflineId(operation.draft.id) ? undefined : operation.draft.id,
        });
        if (saved.id !== operation.localId) remap = { from: operation.localId, to: saved.id };
      } else if (operation.type === 'deleteCatalog') {
        if (!isOfflineId(operation.catalogId)) {
          await catalogRepository.deleteCatalogIngredient(operation.catalogId);
        }
      } else if (operation.type === 'saveRecipe') {
        const saved = await recipesRepository.saveRecipe({
          ...operation.draft,
          id: isOfflineId(operation.draft.id) ? undefined : operation.draft.id,
        });
        savedVersion = saved.serverUpdatedAt ?? saved.updatedAt;
        if (saved.id !== operation.localId) remap = { from: operation.localId, to: saved.id };
      } else if (operation.type === 'deleteRecipe') {
        if (!isOfflineId(operation.recipeId)) await recipesRepository.deleteRecipe(operation.recipeId);
      } else {
        await catalogRepository.applyPriceUpdates(
          operation.updates.filter((item) => !isOfflineId(item.id)),
        );
      }
    } catch (caught) {
      assertCurrent();
      if (caught instanceof recipesRepository.RecipeSaveIncompleteError) {
        pending = await rebasePendingRecipeSave(userId, operation, caught.retryDraft);
        assertCurrent();
        if (isNetworkError(caught.originalError)) throw caught.originalError;
      }
      if (isNetworkError(caught)) throw caught;

      const failure = await rejectPendingOperation(userId, operation,
        caught instanceof recipesRepository.RecipeSaveIncompleteError ? caught.originalError : caught);
      pending = failure.pending;
      if (!failure.quarantined) throw caught;
      continue;
    }

    // A response from an old session must not consume that account's pending intent.
    assertCurrent();
    pending = await acknowledgePendingOperation(userId, operation, remap, savedVersion);
    completed += 1;
  }

  return completed;
}

function createWorkspaceScope(userId: string | null, isDemo: boolean) {
  let active = true;
  return { userId, isDemo, isActive: () => active,
    activate: () => { active = true; }, deactivate: () => { active = false; } };
}
type WorkspaceScope = ReturnType<typeof createWorkspaceScope>;

export function WorkspaceProvider({ children }: PropsWithChildren) {
  const auth = useAuth();
  const userId = auth.user?.id ?? (auth.isDemo ? 'demo' : null);
  const scope = useMemo(() => createWorkspaceScope(userId, auth.isDemo), [userId, auth.isDemo]);
  useLayoutEffect(() => {
    scope.activate();
    return scope.deactivate;
  }, [scope]);

  // Remounting clears visible rows and refs immediately; scope checks also stop
  // asynchronous work retained by the old instance from dispatching mutations.
  return <WorkspaceSessionProvider key={`${userId ?? 'anonymous'}:${auth.isDemo}`} scope={scope}>
    {children}
  </WorkspaceSessionProvider>;
}

function WorkspaceSessionProvider({ children, scope }: PropsWithChildren<{ scope: WorkspaceScope }>) {
  const auth = useAuth();
  const { t, locale } = useI18n();
  const { format } = usePreferences();
  const tRef = useRef(t);
  useEffect(() => {
    tRef.current = t;
  }, [t]);
  const userId = auth.user?.id ?? (auth.isDemo ? 'demo' : null);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [catalog, setCatalog] = useState<CatalogIngredient[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncState, setSyncState] = useState<SyncState>('syncing');
  const [pendingChanges, setPendingChanges] = useState(0);
  const [failedChanges, setFailedChanges] = useState(0);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const recipesRef = useRef<Recipe[]>([]);
  const catalogRef = useRef<CatalogIngredient[]>([]);
  const persisting = useRef(false);
  const isCurrent = useCallback(() => scope.isActive() && scope.isDemo === (isDemoMode || isInstantDemoActive()), [scope]);
  const assertCurrent = useCallback(() => {
    if (!isCurrent()) throw new Error('workspace-changed');
  }, [isCurrent]);
  const runScoped = useCallback(<T,>(work: () => Promise<T>) => (
    withStorageLock('workspace:' + (userId ?? 'anonymous'), async () => {
      assertCurrent();
      const result = await work();
      assertCurrent();
      return result;
    })
  ), [assertCurrent, userId]);

  const commit = useCallback((nextRecipes: Recipe[], nextCatalog: CatalogIngredient[]) => {
    assertCurrent();
    recipesRef.current = nextRecipes;
    catalogRef.current = nextCatalog;
    setRecipes(nextRecipes);
    setCatalog(nextCatalog);
    if (userId) void writeWorkspaceCache(userId, nextRecipes, nextCatalog).catch(() => undefined);
  }, [assertCurrent, userId]);

  const resolveGraph = useCallback(async (
    nextRecipes: Recipe[],
    nextCatalog: CatalogIngredient[],
    persist: boolean,
  ): Promise<Recipe[]> => {
    assertCurrent();
    const { recipes: resolved, changedIds } = resolveRecipeGraph(nextRecipes, nextCatalog);
    if (persist && changedIds.length && !persisting.current) {
      persisting.current = true;
      try {
        await recipesRepository.persistRecalculated(
          resolved.filter((recipe) => changedIds.includes(recipe.id)),
        );
        assertCurrent();
        // Recalculation can advance the cloud version; acknowledge that version before editing.
        const loaded = await recipesRepository.listRecipes();
        assertCurrent();
        return resolveRecipeGraph(loaded, nextCatalog).recipes;
      } catch {
        assertCurrent();
        // Datele locale rămân corecte; serverul va recalcula la următoarea sincronizare.
      } finally {
        persisting.current = false;
      }
    }
    return resolved;
  }, [assertCurrent]);

  const refresh = useCallback(async () => runScoped(async () => {
    if (!auth.isAuthenticated || !userId) {
      commit([], []);
      setPendingChanges(0);
      setFailedChanges(0);
      setSyncState('online');
      setIsLoading(false);
      return;
    }

    const hasVisibleData = recipesRef.current.length > 0 || catalogRef.current.length > 0;
    if (!hasVisibleData) setIsLoading(true);
    setError(null);
    setSyncState('syncing');

    const cached = await readWorkspaceCache(userId).catch(() => null);
    assertCurrent();
    if (cached && !hasVisibleData) {
      const resolved = await resolveGraph(cached.recipes, cached.catalog, false);
      commit(resolved, cached.catalog);
      setLastSyncedAt(cached.savedAt);
      setIsLoading(false);
    }

    try {
      const queued = await readPendingOperations(userId);
      assertCurrent();
      setPendingChanges(queued.length);
      if (queued.length) await flushPendingOperations(userId, assertCurrent);
      assertCurrent();
      const failed = await readFailedOperations(userId).catch(() => []);
      assertCurrent();
      setFailedChanges(failed.length);

      const [loadedRecipes, loadedCatalog] = await Promise.all([
        recipesRepository.listRecipes(),
        catalogRepository.listCatalog(),
      ]);
      assertCurrent();
      const resolved = await resolveGraph(loadedRecipes, loadedCatalog, true);
      commit(resolved, loadedCatalog);
      setPendingChanges(0);
      setSyncState('online');
      setLastSyncedAt(new Date().toISOString());
    } catch (caught) {
      assertCurrent();
      const queue = await readPendingOperations(userId).catch(() => []);
      assertCurrent();
      setPendingChanges(queue.length);
      const failed = await readFailedOperations(userId).catch(() => []);
      assertCurrent();
      setFailedChanges(failed.length);
      if (isNetworkError(caught)) {
        setSyncState('offline');
        if (!cached && !hasVisibleData) setError(tRef.current('offline.noCache'));
      } else {
        setSyncState(cached || hasVisibleData ? 'offline' : 'online');
        setError(workspaceErrorMessage(caught).includes('missing')
          ? tRef.current('error.notConfigured')
          : tRef.current('error.loadRecipes'));
      }
    } finally {
      if (isCurrent()) setIsLoading(false);
    }
  }).catch(caught => {
    // Scheduled refreshes outlive navigation; cancellation is not a load error.
    if (isCurrent()) throw caught;
  }), [assertCurrent, auth.isAuthenticated, commit, isCurrent, resolveGraph, runScoped, userId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!userId) return;
    const timer = setInterval(() => {
      void readPendingOperations(userId).then((items) => {
        if (isCurrent() && items.length) void refresh();
      });
    }, 20_000);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refresh();
    });
    return () => {
      clearInterval(timer);
      subscription.remove();
    };
  }, [isCurrent, refresh, userId]);

  const saveRecipe = useCallback(async (draft: RecipeDraft) => runScoped(async () => {
    draft = enrichRecipeNutrition(draft);
    if (!userId) throw new Error('missing-session');
    const before = recipesRef.current;
    const optimistic = makeOptimisticRecipe(draft, before);
    const optimisticDraft = { ...draft, id: optimistic.id };
    const next = await resolveGraph(
      [optimistic, ...before.filter((item) => item.id !== optimistic.id)],
      catalogRef.current,
      false,
    );
    commit(next, catalogRef.current);

    if (isOfflineId(draft.id)) {
      const queue = await enqueueOperation(userId, {
        type: 'saveRecipe', localId: optimistic.id, draft: optimisticDraft,
      });
      assertCurrent();
      setPendingChanges(queue.length);
      setSyncState('offline');
      return optimistic;
    }

    try {
      const saved = await recipesRepository.saveRecipe(draft);
      const resolved = await resolveGraph(
        [saved, ...recipesRef.current.filter((item) => item.id !== optimistic.id && item.id !== saved.id)],
        catalogRef.current,
        false,
      );
      commit(resolved, catalogRef.current);
      setSyncState('online');
      return saved;
    } catch (caught) {
      assertCurrent();
      if (caught instanceof recipesRepository.RecipeSaveIncompleteError) {
        const partial = makeOptimisticRecipe(caught.retryDraft, caught.savedRecipe ? [caught.savedRecipe] : before);
        commit([partial, ...before.filter((item) => item.id !== optimistic.id && item.id !== partial.id)], catalogRef.current);
        const queued = await enqueueOperation(userId, { type: 'saveRecipe', localId: partial.id, draft: caught.retryDraft });
        assertCurrent();
        const operation = queued.find((item) => item.type === 'saveRecipe' && item.localId === partial.id)!;
        const queue = await rebasePendingRecipeSave(userId, operation, caught.retryDraft);
        assertCurrent();
        setPendingChanges(queue.length);
        setSyncState('offline');
        throw caught;
      }
      if (!isNetworkError(caught)) {
        commit(before, catalogRef.current);
        throw caught;
      }
      const queue = await enqueueOperation(userId, {
        type: 'saveRecipe', localId: optimistic.id, draft: optimisticDraft,
      });
      assertCurrent();
      setPendingChanges(queue.length);
      setSyncState('offline');
      return optimistic;
    }
  }), [assertCurrent, commit, resolveGraph, runScoped, userId]);

  const removeRecipe = useCallback(async (recipeId: string) => runScoped(async () => {
    if (!userId) throw new Error('missing-session');
    const before = recipesRef.current;
    commit(before.filter((item) => item.id !== recipeId), catalogRef.current);
    if (isOfflineId(recipeId)) {
      const queue = await enqueueOperation(userId, { type: 'deleteRecipe', recipeId });
      assertCurrent();
      setPendingChanges(queue.length);
      return;
    }
    try {
      await recipesRepository.deleteRecipe(recipeId);
    } catch (caught) {
      assertCurrent();
      if (!isNetworkError(caught)) {
        commit(before, catalogRef.current);
        throw caught;
      }
      const queue = await enqueueOperation(userId, { type: 'deleteRecipe', recipeId });
      assertCurrent();
      setPendingChanges(queue.length);
      setSyncState('offline');
    }
  }), [assertCurrent, commit, runScoped, userId]);

  const saveCatalogIngredient = useCallback(async (draft: CatalogIngredientDraft) => runScoped(async () => {
    draft = enrichIngredientNutrition(draft);
    if (!userId) throw new Error('missing-session');
    const before = catalogRef.current;
    const beforeRecipes = recipesRef.current;
    const old = before.find((entry) => entry.id === draft.id);
    const saveAlert = async () => {
      assertCurrent();
      if (!old || old.priceUnit !== draft.priceUnit || !userId) return;
      const sales = await loadSales(userId).catch(() => ({}));
      assertCurrent();
      const summary = calculatePriceAlert([{ catalogId: old.id, name: old.name,
        oldPrice: old.purchasePrice, newPrice: draft.purchasePrice }], beforeRecipes, sales);
      if (summary) {
        await recordPriceAlert(userId, summary);
        assertCurrent();
        void notifyPriceAlert(summary, locale, format.money).catch(() => undefined);
      }
    };
    const optimistic = makeOptimisticCatalog(draft, before);
    const optimisticDraft = { ...draft, id: optimistic.id };
    const nextCatalog = [optimistic, ...before.filter((item) => item.id !== optimistic.id)]
      .sort((a, b) => a.name.localeCompare(b.name, 'ro-RO'));
    const nextRecipes = await resolveGraph(recipesRef.current, nextCatalog, false);
    commit(nextRecipes, nextCatalog);

    if (isOfflineId(draft.id)) {
      const queue = await enqueueOperation(userId, {
        type: 'saveCatalog', localId: optimistic.id, draft: optimisticDraft,
      });
      assertCurrent();
      setPendingChanges(queue.length);
      setSyncState('offline');
      await saveAlert().catch(() => undefined);
      return optimistic;
    }

    try {
      const saved = await catalogRepository.saveCatalogIngredient(draft);
      const syncedCatalog = [saved, ...catalogRef.current.filter((item) => (
        item.id !== optimistic.id && item.id !== saved.id
      ))].sort((a, b) => a.name.localeCompare(b.name, 'ro-RO'));
      const syncedRecipes = await resolveGraph(recipesRef.current, syncedCatalog, true);
      commit(syncedRecipes, syncedCatalog);
      setSyncState('online');
      await saveAlert().catch(() => undefined);
      return saved;
    } catch (caught) {
      assertCurrent();
      if (!isNetworkError(caught)) {
        const rolledBackRecipes = await resolveGraph(recipesRef.current, before, false);
        commit(rolledBackRecipes, before);
        throw caught;
      }
      const queue = await enqueueOperation(userId, {
        type: 'saveCatalog', localId: optimistic.id, draft: optimisticDraft,
      });
      assertCurrent();
      setPendingChanges(queue.length);
      setSyncState('offline');
      await saveAlert().catch(() => undefined);
      return optimistic;
    }
  }), [assertCurrent, commit, resolveGraph, runScoped, userId, locale, format.money]);

  const removeCatalogIngredient = useCallback(async (catalogId: string) => runScoped(async () => {
    if (!userId) throw new Error('missing-session');
    const before = catalogRef.current;
    commit(recipesRef.current, before.filter((item) => item.id !== catalogId));
    if (isOfflineId(catalogId)) {
      const queue = await enqueueOperation(userId, { type: 'deleteCatalog', catalogId });
      assertCurrent();
      setPendingChanges(queue.length);
      return;
    }
    try {
      await catalogRepository.deleteCatalogIngredient(catalogId);
    } catch (caught) {
      assertCurrent();
      if (!isNetworkError(caught)) {
        commit(recipesRef.current, before);
        throw caught;
      }
      const queue = await enqueueOperation(userId, { type: 'deleteCatalog', catalogId });
      assertCurrent();
      setPendingChanges(queue.length);
      setSyncState('offline');
    }
  }), [assertCurrent, commit, runScoped, userId]);

  const applyPriceUpdates = useCallback(async (
    updates: readonly CatalogPriceUpdate[],
  ) => runScoped(async () => {
    if (!userId) throw new Error('missing-session');
    const beforeRecipes = recipesRef.current;
    const beforeCatalog = catalogRef.current;
    const byId = new Map(updates.map((update) => [update.id, update]));
    const nextCatalog = beforeCatalog.map((entry) => (
      byId.has(entry.id)
        ? {
          ...entry,
          purchasePrice: byId.get(entry.id)!.purchasePrice,
          supplier: byId.get(entry.id)!.supplier ?? entry.supplier,
          priceSource: byId.get(entry.id)!.source ?? entry.priceSource,
          priceSourceDate: byId.get(entry.id)!.sourceDate ?? entry.priceSourceDate,
          updatedAt: new Date().toISOString(),
        }
        : entry
    ));
    const nextRecipes = await resolveGraph(beforeRecipes, nextCatalog, false);
    const beforeTotals = new Map(beforeRecipes.map((recipe) => [recipe.id, recipe.totals.totalCost]));
    const changed = nextRecipes.filter((recipe) => (
      recipe.totals.totalCost !== beforeTotals.get(recipe.id)
    )).length;
    commit(nextRecipes, nextCatalog);
    try {
      await catalogRepository.applyPriceUpdates(updates);
      await resolveGraph(nextRecipes, nextCatalog, true);
      setSyncState('online');
    } catch (caught) {
      assertCurrent();
      if (!isNetworkError(caught)) {
        commit(beforeRecipes, beforeCatalog);
        throw caught;
      }
      const queue = await enqueueOperation(userId, { type: 'updatePrices', updates: [...updates] });
      assertCurrent();
      setPendingChanges(queue.length);
      setSyncState('offline');
    }
    return changed;
  }), [assertCurrent, commit, resolveGraph, runScoped, userId]);

  const importNewCatalogItems = useCallback(async (
    items: readonly { name: string; purchasePrice: number; priceUnit: PriceUnit; supplier?: string | null; notes?: string | null }[],
  ) => {
    let created = 0;
    for (const item of items) {
      await saveCatalogIngredient({
        name: item.name,
        purchasePrice: item.purchasePrice,
        priceUnit: item.priceUnit,
        packageQuantity: null,
        packagePrice: null,
        defaultLossPercent: 0,
        supplier: item.supplier ?? null,
        notes: item.notes ?? null,
        allergens: [],
        allergensConfirmed: false,
        additives: [],
        nutrition: createEmptyIngredientNutrition(item.priceUnit === 'l' ? '100ml' : item.priceUnit === 'buc' ? 'unit' : '100g'),
        active: true,
      });
      created += 1;
    }
    return created;
  }, [saveCatalogIngredient]);

  const dismissFailedChanges = useCallback(async () => {
    assertCurrent();
    if (!userId) return;
    await clearFailedOperations(userId).catch(() => undefined);
    assertCurrent();
    setFailedChanges(0);
  }, [assertCurrent, userId]);

  const value = useMemo<WorkspaceContextValue>(() => ({
    recipes,
    catalog,
    isLoading,
    error,
    syncState,
    pendingChanges,
    failedChanges,
    dismissFailedChanges,
    lastSyncedAt,
    refresh,
    saveRecipe,
    removeRecipe,
    findRecipe: (recipeId) => recipes.find((recipe) => recipe.id === recipeId),
    subRecipes: recipes.filter((recipe) => recipe.isSubRecipe),
    saveCatalogIngredient,
    removeCatalogIngredient,
    applyPriceUpdates,
    importNewCatalogItems,
  }), [
    applyPriceUpdates,
    catalog,
    dismissFailedChanges,
    error,
    failedChanges,
    importNewCatalogItems,
    isLoading,
    lastSyncedAt,
    pendingChanges,
    recipes,
    refresh,
    removeCatalogIngredient,
    removeRecipe,
    saveCatalogIngredient,
    saveRecipe,
    syncState,
  ]);

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace() {
  const context = useContext(WorkspaceContext);
  if (!context) throw new Error('useWorkspace trebuie folosit în WorkspaceProvider');
  return context;
}
