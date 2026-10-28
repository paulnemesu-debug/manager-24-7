import { beforeEach, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ calls: [] as string[], uploaded: [] as string[], removed: [] as string[], payload: {} as Record<string, unknown>, uploadError: false, rpcError: null as { code?: string; message: string } | null, storedPath: 'user/old.jpg' as string | null, legacy: false, attachmentError: null as { code?: string; message: string } | null, readError: false, attachmentVersion: '' }));
vi.mock('@react-native-async-storage/async-storage', () => ({ default: {} }));
vi.mock('@/lib/document-bytes', () => ({ readDocumentBytes: async () => new Uint8Array([1, 2, 3]).buffer }));
vi.mock('@/lib/supabase', () => ({ isDemoMode: false, supabase: {
  auth: { getUser: async () => ({ data: { user: { id: 'user' } }, error: null }) },
  rpc: async (name: string, args: { p_recipe?: Record<string, unknown> }) => {
    state.calls.push(name);
    if (name === 'foodcost_capture_recipe_version') return { data: null, error: null };
    state.payload = args.p_recipe ?? {};
    if (!state.rpcError && !state.legacy && 'photo_path' in state.payload) state.storedPath = state.payload.photo_path as string | null;
    return { data: 'recipe-id', error: state.rpcError };
  },
  storage: { from: () => ({
    upload: async (path: string) => { state.calls.push('upload'); state.uploaded.push(path); return { error: state.uploadError ? Error('upload-failed') : null }; },
    remove: async (paths: string[]) => { state.calls.push('remove'); state.removed.push(...paths); return { error: null }; },
    createSignedUrl: async () => ({ data: { signedUrl: 'https://private-storage.test/signed' }, error: null }),
  }) },
  from: () => { let update: { photo_path: string | null } | null = null; const row = () => ({
    id: 'recipe-id', title: 'Preparat', servings: 1, vat_percent: 11, target_food_cost: 30,
    sale_price_gross: 20, photo_path: state.storedPath, recipe_ingredients: [], created_at: '2026-10-04T10:00:00Z', updated_at: '2026-10-04T10:01:00Z',
  }); const query = { select: () => query, update: (value: { photo_path: string | null }) => { update = value; return query; },
    eq: (key: string, value: string) => { if (key === 'updated_at') state.attachmentVersion = value; return query; },
    single: async () => ({ data: state.readError ? null : row(), error: state.readError ? Error('Network request failed') : null }),
    maybeSingle: async () => { state.calls.push('attach'); if (state.attachmentError) return { data: null, error: state.attachmentError }; state.storedPath = update!.photo_path; return { data: row(), error: null }; },
  }; return query; },
} }));
import { createEmptyRecipe } from '@/lib/calculations';
import { RecipeSaveIncompleteError, saveRecipe } from '@/lib/recipes-repository';
const draft = () => ({ ...createEmptyRecipe(), id: 'recipe-id', title: 'Preparat', photoPath: 'user/old.jpg', photoUri: 'file:///documents/new.jpg' });
beforeEach(() => { state.calls = []; state.uploaded = []; state.removed = []; state.payload = {}; state.uploadError = false; state.rpcError = null; state.storedPath = 'user/old.jpg'; state.legacy = false; state.attachmentError = null; state.readError = false; state.attachmentVersion = ''; });
it('attaches the new photo in the same recipe transaction, then removes the old object', async () => {
  const result = await saveRecipe(draft()); expect(state.calls.indexOf('upload')).toBeLessThan(state.calls.indexOf('foodcost_save_recipe'));
  expect(state.payload.photo_path).toBe(state.uploaded[0]); expect(state.removed).toEqual(['user/old.jpg']); expect(result.photoPath).toBe(state.uploaded[0]);
});
it('a failed photo upload never changes recipe headers or ingredients', async () => {
  state.uploadError = true; await expect(saveRecipe(draft())).rejects.toThrow('upload-failed'); expect(state.calls).not.toContain('foodcost_save_recipe'); expect(state.removed).toEqual([]);
});
it('a rejected conflicting save keeps the original photo and cleans only the staged one', async () => {
  state.rpcError = { code: 'P0001', message: 'RECIPE_CONFLICT' }; await expect(saveRecipe(draft())).rejects.toMatchObject({ message: 'RECIPE_CONFLICT' });
  expect(state.removed).toEqual(state.uploaded); expect(state.storedPath).toBe('user/old.jpg');
});
it('never deletes an uploaded photo after an ambiguous network failure', async () => {
  state.rpcError = { message: 'Network request failed' }; await expect(saveRecipe(draft())).rejects.toBeTruthy(); expect(state.removed).toEqual([]);
});
it('a missing preview URL keeps its existing photo', async () => {
  const result = await saveRecipe({ ...draft(), photoUri: null }); expect(state.payload).not.toHaveProperty('photo_path'); expect(state.uploaded).toEqual([]); expect(result.photoPath).toBe('user/old.jpg');
});
it('an explicit remove atomically detaches the image before object cleanup', async () => {
  const result = await saveRecipe({ ...draft(), photoUri: null, photoAction: 'remove' }); expect(state.payload.photo_path).toBeNull(); expect(result.photoPath).toBeNull(); expect(state.removed).toEqual(['user/old.jpg']);
});
it('supports legacy servers with a checked version and cleans the old photo only after attachment', async () => {
  state.legacy = true; const result = await saveRecipe(draft());
  expect(state.attachmentVersion).toBe('2026-10-04T10:01:00Z');
  expect(state.calls.indexOf('attach')).toBeLessThan(state.calls.indexOf('remove'));
  expect(result.photoPath).toBe(state.uploaded[0]);
});
it('a failed legacy attachment preserves the confirmed ID and version for retry', async () => {
  state.legacy = true; state.attachmentError = { code: '42501', message: 'permission denied' };
  const error = await saveRecipe({ ...draft(), id: undefined }).catch((caught) => caught);
  expect(error).toBeInstanceOf(RecipeSaveIncompleteError);
  expect(error.retryDraft).toMatchObject({ id: 'recipe-id', expectedUpdatedAt: '2026-10-04T10:01:00Z', photoUri: draft().photoUri });
  expect(state.removed).not.toContain('user/old.jpg'); expect(state.storedPath).toBe('user/old.jpg');
});
it('a lost read after a confirmed insert retains its cloud ID and never reports a complete save', async () => {
  state.readError = true; const error = await saveRecipe({ ...draft(), id: undefined }).catch((caught) => caught);
  expect(error).toBeInstanceOf(RecipeSaveIncompleteError); expect(error.retryDraft.id).toBe('recipe-id'); expect(state.removed).toEqual([]);
});
