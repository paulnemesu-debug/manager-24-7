import AsyncStorage from '@react-native-async-storage/async-storage';

import { HACCP_FORMS } from '@/constants/haccp-forms';
import { withStorageLock } from '@/lib/storage-lock';

const knownCodes = new Set(HACCP_FORMS.map((form) => form.code));
export const haccpFavoritesKey = (userId: string) => 'manager247.haccp-favorites.v1.' + userId;

export function normalizeHaccpFavorites(value: unknown): string[] {
  return Array.isArray(value) ? [...new Set(value.filter((code): code is string => typeof code === 'string' && knownCodes.has(code)))] : [];
}

export async function loadHaccpFavorites(userId: string): Promise<string[]> {
  const raw = await AsyncStorage.getItem(haccpFavoritesKey(userId));
  if (!raw) return [];
  try { return normalizeHaccpFavorites(JSON.parse(raw)); } catch { return []; }
}

/** Serialises concurrent star changes and separates every user's choices. */
export function toggleHaccpFavorite(userId: string, code: string): Promise<string[]> {
  return withStorageLock(haccpFavoritesKey(userId), async () => {
    const current = await loadHaccpFavorites(userId);
    if (!knownCodes.has(code)) return current;
    const next = current.includes(code) ? current.filter((item) => item !== code) : [...current, code];
    await AsyncStorage.setItem(haccpFavoritesKey(userId), JSON.stringify(next));
    return next;
  });
}
