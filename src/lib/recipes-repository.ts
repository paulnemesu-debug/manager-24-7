/**
 * MANAGER 24/7™ by PARADIM — proprietary software.
 * Copyright © 2026 PARADIM Operations SRL. All rights reserved.
 * Concept author and product director: Marius Paul Nemeșu.
 * See LICENSE-PROPRIETARY.md.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

import { parseAllergens } from '@/constants/allergens';
import { normalizeCategory } from '@/constants/categories';
import {
  calculateRecipeTotals,
  resolveRecipeAllergens,
} from '@/lib/calculations';
import { demoRecipes } from '@/lib/demo-data';
import { isInstantDemoActive } from '@/lib/demo-isolation';
import { withStorageLock } from '@/lib/storage-lock';
import { readDocumentBytes } from '@/lib/document-bytes';
import { isDemoMode, supabase } from '@/lib/supabase';
import { enrichRecipeNutrition, normalizeIngredientNutrition, normalizeRecipeCompliance } from '@/lib/nutrition';
import type {
  CookingMethod,
  IngredientDraft,
  IngredientKind,
  PriceUnit,
  Recipe,
  RecipeDraft,
} from '@/types/recipe';

const DEMO_KEY = 'professional_foodcost.demo_recipes.v2';

type DbIngredient = {
  id: string;
  recipe_id: string;
  ingredient_catalog_id?: string | null;
  subrecipe_id?: string | null;
  ingredient_name: string;
  quantity_net: number | string;
  unit: IngredientDraft['unit'];
  purchase_price: number | string;
  price_unit: IngredientDraft['priceUnit'];
  loss_percent: number | string;
  allergens?: string[] | null;
  allergens_confirmed?: boolean | null;
  additives?: string[] | null;
  nutrition?: unknown;
};

type DbRecipe = {
  id: string;
  title: string;
  category?: string | null;
  servings: number | string;
  cooking_method?: CookingMethod | null;
  cooking_loss_percent?: number | string | null;
  sale_price_gross?: number | string | null;
  vat_percent: number | string;
  target_food_cost: number | string;
  is_sub_recipe?: boolean | null;
  output_quantity?: number | string | null;
  output_unit?: PriceUnit | null;
  manual_allergens?: string[] | null;
  final_weight_g?: number | string | null;
  final_weight_measured?: boolean | null;
  is_defrosted?: boolean | null;
  nutrition_notes?: string | null;
  template_id?: string | null;
  template_source?: string | null;
  photo_path?: string | null;
  created_at: string;
  updated_at: string;
  recipe_ingredients?: DbIngredient[];
};

const number = (value: number | string | null | undefined) => Number(value || 0);

// Ingredient rows have separate relations for the parent recipe and the
// selected sub-recipe. The explicit relationship avoids PostgREST 300.
const RECIPE_SELECT = '*, recipe_ingredients!recipe_ingredients_recipe_owner_fk(*)';

function mapIngredient(row: DbIngredient): IngredientDraft {
  const kind: IngredientKind = row.subrecipe_id
    ? 'sub_recipe'
    : 'product';
  return {
    id: row.id,
    kind,
    catalogId: row.ingredient_catalog_id ?? null,
    subRecipeId: row.subrecipe_id ?? null,
    name: row.ingredient_name,
    quantity: number(row.quantity_net),
    unit: row.unit,
    purchasePrice: number(row.purchase_price),
    priceUnit: row.price_unit,
    lossPercent: number(row.loss_percent),
    allergens: parseAllergens(row.allergens),
    allergensConfirmed: Boolean(row.allergens_confirmed),
    additives: Array.isArray(row.additives) ? row.additives.filter((item) => typeof item === 'string') : [],
    nutrition: normalizeIngredientNutrition(row.nutrition),
  };
}

function mapRecipe(row: DbRecipe, photoUrl: string | null = null): Recipe {
  const ingredients = (row.recipe_ingredients ?? []).map(mapIngredient);
  const manualAllergens = parseAllergens(row.manual_allergens);

  const draft: RecipeDraft = {
    id: row.id,
    title: row.title,
    category: normalizeCategory(row.category),
    servings: number(row.servings),
    cookingMethod: row.cooking_method ?? 'none',
    cookingLossPercent: number(row.cooking_loss_percent),
    salePriceGross: number(row.sale_price_gross),
    vatPercent: number(row.vat_percent),
    targetFoodCost: number(row.target_food_cost),
    isSubRecipe: Boolean(row.is_sub_recipe),
    yieldQuantity: number(row.output_quantity) || 1,
    yieldUnit: row.output_unit ?? 'kg',
    ingredients,
    manualAllergens,
    compliance: normalizeRecipeCompliance({
      finalWeightGrams: row.final_weight_g,
      finalWeightMeasured: row.final_weight_measured,
      isDefrosted: row.is_defrosted,
      nutritionNotes: row.nutrition_notes,
      templateId: row.template_id,
      sourceReference: row.template_source,
    }),
    photoPath: row.photo_path ?? null,
    photoUri: photoUrl,
  };

  return {
    ...draft,
    id: row.id,
    category: draft.category,
    allergens: resolveRecipeAllergens(ingredients, manualAllergens),
    totals: calculateRecipeTotals(draft),
    photoPath: row.photo_path ?? null,
    photoUrl,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    serverUpdatedAt: row.updated_at,
  };
}

async function readDemoRecipes(): Promise<Recipe[]> {
  const value = await AsyncStorage.getItem(DEMO_KEY);
  if (value !== null) {
    const recipes: unknown = JSON.parse(value);
    if (!Array.isArray(recipes)) throw new Error('Invalid local demo recipes');
    return recipes as Recipe[];
  }
  const seed = JSON.stringify(demoRecipes);
  await AsyncStorage.setItem(DEMO_KEY, seed);
  return JSON.parse(seed) as Recipe[];
}

const getDemoRecipes = () => withStorageLock(DEMO_KEY, readDemoRecipes);

async function setDemoRecipes(recipes: Recipe[]) {
  await AsyncStorage.setItem(DEMO_KEY, JSON.stringify(recipes));
}

async function currentUserId() {
  if (!supabase) throw new Error('missing-client');
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw error ?? new Error('missing-session');
  return data.user.id;
}

async function recipeAuthorization(userId?: string): Promise<string | undefined> {
  if (!userId || !supabase) return undefined;
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  if (data.session?.user.id !== userId || !data.session.access_token) throw new Error('workspace-changed');
  return `Bearer ${data.session.access_token}`;
}

function authorizeRecipeRequest<T extends { setHeader(name: string, value: string): T }>(request: T, authorization?: string): T {
  return authorization ? request.setHeader('Authorization', authorization) : request;
}

async function saveDemoRecipe(draft: RecipeDraft): Promise<Recipe> {
  return withStorageLock(DEMO_KEY, async () => {
    const recipes = await readDemoRecipes();
    const now = new Date().toISOString();
    const recipe: Recipe = {
      ...draft,
      id: draft.id ?? `local-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      allergens: resolveRecipeAllergens(draft.ingredients, draft.manualAllergens),
      totals: calculateRecipeTotals(draft),
      photoPath: draft.photoAction === 'remove' ? null : draft.photoPath ?? null,
      photoUrl: draft.photoAction === 'remove' ? null : draft.photoUri ?? null,
      createdAt: recipes.find((item) => item.id === draft.id)?.createdAt ?? now,
      updatedAt: now,
    };
    await setDemoRecipes([recipe, ...recipes.filter((item) => item.id !== recipe.id)]);
    return recipe;
  });
}

export async function listRecipes(knownRecipes: readonly Recipe[] = [], userId?: string): Promise<Recipe[]> {
  if (isDemoMode || isInstantDemoActive() || !supabase) return getDemoRecipes();
  const authorization = await recipeAuthorization(userId);
  const { data, error } = await authorizeRecipeRequest(supabase
    .from('recipes')
    .select(RECIPE_SELECT)
    .order('updated_at', { ascending: false }), authorization);
  if (error) throw error;
  const rowsById = new Map((data as DbRecipe[]).map((row) => [row.id, row]));
  // A list can omit known rows (for example, at the server's response limit).
  // Check them under the same RLS policies before replacing the local snapshot.
  const idsToVerify = [...new Set(knownRecipes.filter((recipe) => {
    if (recipe.id.startsWith('offline-')) return false;
    const row = rowsById.get(recipe.id);
    return !row || Date.parse(row.updated_at) < Date.parse(recipe.serverUpdatedAt ?? '');
  }).map((recipe) => recipe.id))];
  const batchSize = 100;
  for (let index = 0; index < idsToVerify.length; index += batchSize) {
    const ids = idsToVerify.slice(index, index + batchSize);
    const verified = await authorizeRecipeRequest(supabase.from('recipes').select(RECIPE_SELECT).in('id', ids), authorization);
    if (verified.error) throw verified.error;
    ids.forEach((id) => rowsById.delete(id));
    for (const row of verified.data as DbRecipe[]) rowsById.set(row.id, row);
  }
  const rows = [...rowsById.values()];
  const paths = [...new Set(rows.map((row) => row.photo_path).filter((path): path is string => Boolean(path)))];
  const signedByPath = new Map<string, string>();
  if (paths.length) {
    const bucket = authorizeRecipeRequest(supabase.storage.from('recipe-images'), authorization);
    const signed = await bucket.createSignedUrls(paths, 60 * 60 * 24 * 7);
    signed.data?.forEach((item) => {
      if (item.path && item.signedUrl) signedByPath.set(item.path, item.signedUrl);
    });
  }
  return rows.map((row) => mapRecipe(row, row.photo_path ? signedByPath.get(row.photo_path) ?? null : null));
}

function recipePayload(draft: RecipeDraft) {
  draft = enrichRecipeNutrition(draft);
  const compliance = normalizeRecipeCompliance(draft.compliance);
  return {
    id: draft.id ?? null,
    expected_updated_at: draft.id ? draft.expectedUpdatedAt ?? null : null,
    title: draft.title.trim(),
    category: draft.category,
    servings: draft.servings,
    cooking_method: draft.cookingMethod,
    cooking_loss_percent: draft.cookingLossPercent,
    sale_price_gross: draft.salePriceGross,
    vat_percent: draft.vatPercent,
    target_food_cost: draft.targetFoodCost,
    is_sub_recipe: draft.isSubRecipe,
    output_quantity: draft.yieldQuantity,
    output_unit: draft.yieldUnit,
    manual_allergens: draft.manualAllergens,
    final_weight_g: compliance.finalWeightGrams,
    final_weight_measured: compliance.finalWeightMeasured,
    is_defrosted: compliance.isDefrosted,
    nutrition_notes: compliance.nutritionNotes,
    template_id: compliance.templateId,
    template_source: compliance.sourceReference,
    ingredients: draft.ingredients
      .filter((ingredient) => ingredient.name.trim())
      .map((ingredient) => ({
        catalog_id: ingredient.kind === 'product' ? ingredient.catalogId ?? null : null,
        subrecipe_id: ingredient.kind === 'sub_recipe' ? ingredient.subRecipeId ?? null : null,
        name: ingredient.name.trim(),
        quantity: ingredient.quantity,
        unit: ingredient.unit,
        purchase_price: ingredient.purchasePrice,
        price_unit: ingredient.priceUnit,
        loss_percent: ingredient.lossPercent,
        allergens: ingredient.allergens,
        allergens_confirmed: ingredient.allergensConfirmed ?? false,
        additives: ingredient.additives ?? [],
        nutrition: normalizeIngredientNutrition(ingredient.nutrition),
      })),
  };
}

async function stageRecipePhoto(draft: RecipeDraft, scopedUserId?: string, authorization?: string): Promise<{ changed: boolean; path: string | null; uploaded: boolean }> {
  if (!supabase) return { changed: false, path: draft.photoPath ?? null, uploaded: false };
  if (draft.photoAction === 'remove') return { changed: true, path: null, uploaded: false };
  const uri = draft.photoUri ?? null;
  if (!uri || (draft.photoPath && /^https?:/i.test(uri))) {
    // Missing/expired preview URLs are not an instruction to remove a photo.
    return { changed: false, path: draft.photoPath ?? null, uploaded: false };
  }
  const userId = scopedUserId ?? await currentUserId();
  const payload = await readDocumentBytes(uri, 5_000_000, 'RECIPE_PHOTO_TOO_LARGE');
  const path = `${userId}/recipe-${Date.now()}-${Math.random().toString(16).slice(2)}.jpg`;
  const bucket = authorizeRecipeRequest(supabase.storage.from('recipe-images'), authorization);
  const uploaded = await bucket.upload(path, payload, {
    contentType: 'image/jpeg', cacheControl: '31536000', upsert: false,
  });
  if (uploaded.error) throw uploaded.error;
  return { changed: true, path, uploaded: true };
}

/** The core save was confirmed: retry this ID, never insert a second recipe. */
export class RecipeSaveIncompleteError extends Error {
  constructor(public retryDraft: RecipeDraft, public savedRecipe: Recipe | null, public originalError: unknown, public createRequestId?: string) {
    super('Rețeta este salvată în cont, dar confirmarea completă sau atașarea fotografiei a eșuat. Schița este păstrată pentru reluare.');
    this.name = 'RecipeSaveIncompleteError';
  }
}

type RecipeCreateReceipt = { recipe_id: string; created_version: string; replayed: boolean };
type RecipeSaveOptions = { userId?: string; createRequestId?: string; retry?: boolean };
type RecipeSaveResult = Recipe & { createdVersion?: string };

async function lookupCreateReceipt(requestId: string, authorization?: string): Promise<RecipeCreateReceipt | null> {
  if (!supabase) throw new Error('missing-client');
  const lookup = await authorizeRecipeRequest(supabase.rpc('foodcost_create_recipe_once', {
    p_recipe: null, p_request_id: requestId,
  }), authorization);
  if (lookup.error) throw lookup.error;
  return lookup.data as RecipeCreateReceipt | null;
}

export async function cancelRecipeCreate(requestId: string, userId?: string): Promise<void> {
  if (!supabase) throw new Error('missing-client');
  const authorization = await recipeAuthorization(userId);
  const { error } = await authorizeRecipeRequest(supabase.rpc('foodcost_cancel_recipe_create', { p_request_id: requestId }), authorization);
  if (error) throw error;
}

export async function saveRecipe(draft: RecipeDraft, options?: RecipeSaveOptions): Promise<RecipeSaveResult> {
  draft = enrichRecipeNutrition(draft);
  if (isDemoMode || isInstantDemoActive() || !supabase) return saveDemoRecipe(draft);
  const authorization = await recipeAuthorization(options?.userId);
  const createRequestId = options?.createRequestId;
  const bucket = () => authorizeRecipeRequest(supabase!.storage.from('recipe-images'), authorization);
  if (draft.id) {
    const { error: versionError } = await authorizeRecipeRequest(supabase.rpc('foodcost_capture_recipe_version', {
      p_recipe_id: draft.id,
    }), authorization);
    if (versionError) throw versionError;
  }
  let receipt = createRequestId && options?.retry ? await lookupCreateReceipt(createRequestId, authorization) : null;
  let photo: Awaited<ReturnType<typeof stageRecipePhoto>> = { changed: false, path: null, uploaded: false };
  let recipeId = receipt?.recipe_id;
  if (!recipeId) {
    // The original transaction attaches the photo. A replay keeps that attachment.
    photo = await stageRecipePhoto(draft, options?.userId, authorization);
    const payload = { ...recipePayload(draft), ...(photo.changed ? { photo_path: photo.path } : {}) };
    const request = createRequestId
      ? supabase.rpc('foodcost_create_recipe_once', { p_recipe: payload, p_request_id: createRequestId })
      : supabase.rpc('foodcost_save_recipe', { p_recipe: payload });
    const result = await authorizeRecipeRequest(request, authorization);
    if (result.error) {
      // A network failure may have lost a committed response. Keep its upload.
      if (photo.uploaded && photo.path && /^[A-Z0-9]{5}$/.test(result.error.code ?? '')) {
        await bucket().remove([photo.path]).catch(() => undefined);
      }
      throw result.error;
    }
    receipt = createRequestId ? result.data as RecipeCreateReceipt : null;
    recipeId = createRequestId ? receipt?.recipe_id : result.data as string;
    if (!recipeId) throw new Error('Connection lost before recipe confirmation');
  }
  if (receipt?.replayed && photo.uploaded && photo.path) {
    // A concurrent request may have completed after the receipt lookup.
    await bucket().remove([photo.path]).catch(() => undefined);
  }
  const { data: saved, error: readError } = await authorizeRecipeRequest(supabase.from('recipes')
    .select(RECIPE_SELECT).eq('id', recipeId).single(), authorization);
  if (readError) {
    // Keep the editor and queue on the same receipt. A cloud ID here would
    // turn a retry into an unconditional edit of a potentially newer row.
    if (receipt && createRequestId) {
      throw new RecipeSaveIncompleteError({ ...draft, id: createRequestId }, null, readError, createRequestId);
    }
    throw new RecipeSaveIncompleteError({ ...draft, id: recipeId }, null, readError);
  }
  let row = saved as DbRecipe;
  if (!receipt && photo.changed && row.photo_path !== photo.path) {
    const attached = await authorizeRecipeRequest(supabase.from('recipes').update({ photo_path: photo.path })
      .eq('id', row.id).eq('updated_at', row.updated_at).select(RECIPE_SELECT).maybeSingle(), authorization);
    if (attached.error || !attached.data) {
      const attachmentError = attached.error ?? new Error('RECIPE_CONFLICT');
      if (photo.uploaded && photo.path && !attached.data && /^[A-Z0-9]{5}$/.test(attached.error?.code ?? '')) {
        await bucket().remove([photo.path]).catch(() => undefined);
      }
      throw new RecipeSaveIncompleteError({ ...draft, id: row.id, expectedUpdatedAt: row.updated_at, photoPath: row.photo_path }, mapRecipe(row), attachmentError);
    }
    row = attached.data as DbRecipe;
  }
  if (draft.id && !receipt?.replayed && photo.changed && draft.photoPath && draft.photoPath !== photo.path) {
    await bucket().remove([draft.photoPath]).catch(() => undefined);
  }
  let photoUrl = row.photo_path && !receipt?.replayed ? draft.photoUri ?? null : null;
  if (row.photo_path) {
    try {
      const signed = await bucket().createSignedUrl(row.photo_path, 60 * 60 * 24 * 7);
      photoUrl = signed.data?.signedUrl ?? photoUrl;
    } catch { /* A failed preview must not turn a confirmed save into a retry. */ }
  }
  return { ...mapRecipe(row, photoUrl), ...(receipt ? { createdVersion: receipt.created_version } : {}) };
}

export type RecipeVersion = {
  id: string;
  versionNumber: number;
  createdAt: string;
  changedBy: string | null;
  draft: RecipeDraft;
};

/** Versiunile sunt snapshot-uri server-side; pot fi restaurate prin saveRecipe. */
export async function listRecipeVersions(recipeId: string): Promise<RecipeVersion[]> {
  if (isDemoMode || isInstantDemoActive() || !supabase) return [];
  const { data, error } = await supabase
    .from('recipe_versions')
    .select('id, version_number, snapshot, changed_by, created_at')
    .eq('recipe_id', recipeId)
    .order('version_number', { ascending: false })
    .limit(20);
  if (error) throw error;

  return (data ?? []).map((row) => {
    const snapshot = row.snapshot as DbRecipe;
    const restored = mapRecipe({
      ...snapshot,
      recipe_ingredients: Array.isArray(snapshot.recipe_ingredients)
        ? snapshot.recipe_ingredients
        : (snapshot as DbRecipe & { ingredients?: DbIngredient[] }).ingredients ?? [],
    });
    return {
      id: row.id as string,
      versionNumber: Number(row.version_number),
      createdAt: row.created_at as string,
      changedBy: row.changed_by as string | null,
      draft: {
        id: recipeId,
        title: restored.title,
        category: restored.category,
        servings: restored.servings,
        cookingMethod: restored.cookingMethod,
        cookingLossPercent: restored.cookingLossPercent,
        salePriceGross: restored.salePriceGross,
        vatPercent: restored.vatPercent,
        targetFoodCost: restored.targetFoodCost,
        isSubRecipe: restored.isSubRecipe,
        yieldQuantity: restored.yieldQuantity,
        yieldUnit: restored.yieldUnit,
        ingredients: restored.ingredients,
        manualAllergens: restored.manualAllergens,
        compliance: restored.compliance,
        photoPath: restored.photoPath,
        photoUri: restored.photoUrl,
      },
    };
  });
}

export async function deleteRecipe(recipeId: string, userId?: string) {
  if (isDemoMode || isInstantDemoActive() || !supabase) {
    await withStorageLock(DEMO_KEY, async () => {
      const recipes = await readDemoRecipes();
      await setDemoRecipes(recipes.filter((item) => item.id !== recipeId));
    });
    return;
  }

  const authorization = await recipeAuthorization(userId);
  const { error: ingredientError } = await authorizeRecipeRequest(supabase
    .from('recipe_ingredients')
    .delete()
    .eq('recipe_id', recipeId), authorization);
  if (ingredientError) throw ingredientError;
  const { error } = await authorizeRecipeRequest(supabase.from('recipes').delete().eq('id', recipeId), authorization);
  if (error) throw error;
}

/**
 * Scrie înapoi rețetele al căror cost s-a schimbat după o modificare de preț
 * în catalog sau într-un semipreparat. Se apelează după recalculul în memorie.
 */
export async function persistRecalculated(recipes: readonly Recipe[], userId?: string): Promise<void> {
  if (!recipes.length) return;

  if (isDemoMode || isInstantDemoActive() || !supabase) {
    await withStorageLock(DEMO_KEY, async () => {
      const stored = await readDemoRecipes();
      const byId = new Map(recipes.map((recipe) => [recipe.id, recipe]));
      await setDemoRecipes(stored.map((recipe) => byId.get(recipe.id) ?? recipe));
    });
    return;
  }

  const authorization = await recipeAuthorization(userId);
  const { error } = await authorizeRecipeRequest(supabase.rpc('foodcost_recalculate', {}), authorization);
  if (error) throw error;
}
