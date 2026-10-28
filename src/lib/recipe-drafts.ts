import AsyncStorage from '@react-native-async-storage/async-storage';

import { withStorageLock } from '@/lib/storage-lock';
import type { RecipeDraft } from '@/types/recipe';

export type RecipeDraftEntry = { slot: string; draft: RecipeDraft; savedAt: string };
const keyFor = (userId: string) => 'manager247.recipe-drafts.v1.' + userId;

export async function loadRecipeDrafts(userId: string): Promise<RecipeDraftEntry[]> {
  const raw = await AsyncStorage.getItem(keyFor(userId));
  if (!raw) return [];
  try {
    const value = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is RecipeDraftEntry => Boolean(
      item && typeof item.slot === 'string' && typeof item.savedAt === 'string'
      && item.draft && typeof item.draft.title === 'string' && Array.isArray(item.draft.ingredients)
      && Array.isArray(item.draft.manualAllergens),
    ));
  } catch { return []; }
}

export function saveRecipeDraft(userId: string, slot: string, draft: RecipeDraft) {
  return withStorageLock('drafts:' + userId, async () => {
    const entries = await loadRecipeDrafts(userId);
    const savedAt = new Date().toISOString();
    const hasContent = draft.title.trim() || draft.ingredients.some((item) => item.name.trim()) || draft.photoUri;
    const other = entries.filter((item) => item.slot !== slot);
    await AsyncStorage.setItem(keyFor(userId), JSON.stringify(hasContent ? [{ slot, draft, savedAt }, ...other] : other));
    return hasContent ? savedAt : null;
  });
}

export function clearRecipeDraft(userId: string, slot: string) {
  return withStorageLock('drafts:' + userId, async () => {
    const entries = await loadRecipeDrafts(userId);
    await AsyncStorage.setItem(keyFor(userId), JSON.stringify(entries.filter((item) => item.slot !== slot)));
  });
}
