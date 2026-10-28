import { beforeEach, expect, it, vi } from 'vitest';

const storage = new Map<string, string>();
vi.mock('@react-native-async-storage/async-storage', () => ({ default: {
  getItem: async (key: string) => { await Promise.resolve(); return storage.get(key) ?? null; },
  setItem: async (key: string, value: string) => { await Promise.resolve(); storage.set(key, value); },
} }));

import { createEmptyRecipe } from '@/lib/calculations';
import { clearRecipeDraft, loadRecipeDrafts, saveRecipeDraft } from '@/lib/recipe-drafts';

beforeEach(() => storage.clear());
it('recovers the latest draft after concurrent writes and keeps other slots', async () => {
  await Promise.all([
    saveRecipeDraft('one', 'new', { ...createEmptyRecipe(), title: 'Ciorbă' }),
    saveRecipeDraft('one', 'recipe-other', { ...createEmptyRecipe(), title: 'Supă' }),
    saveRecipeDraft('one', 'new', { ...createEmptyRecipe(), title: 'Ciorbă de legume' }),
  ]);
  const drafts = await loadRecipeDrafts('one');
  expect(drafts).toHaveLength(2);
  expect(drafts.find((item) => item.slot === 'new')?.draft.title).toBe('Ciorbă de legume');
  expect(await loadRecipeDrafts('different-account')).toEqual([]);
});
it('a completed save clears only its draft after outstanding writes', async () => {
  const pending = saveRecipeDraft('one', 'new', { ...createEmptyRecipe(), title: 'Preparat' });
  const removal = clearRecipeDraft('one', 'new');
  await Promise.all([pending, removal]);
  expect(await loadRecipeDrafts('one')).toEqual([]);
});
it('ignores corrupt cache and does not list empty recipes', async () => {
  storage.set('manager247.recipe-drafts.v1.one', '{invalid');
  expect(await loadRecipeDrafts('one')).toEqual([]);
  await saveRecipeDraft('one', 'new', createEmptyRecipe());
  expect(await loadRecipeDrafts('one')).toEqual([]);
});
