import { beforeEach, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ storage: new Map<string, string>(), fail: false }));
vi.mock('@react-native-async-storage/async-storage', () => ({ default: {
  getItem: async (key: string) => state.storage.get(key) ?? null,
  setItem: async (key: string, value: string) => { if (state.fail) throw Error('disk'); state.storage.set(key, value); },
} }));
import { HACCP_FORMS } from '@/constants/haccp-forms';
import { haccpFavoritesKey, loadHaccpFavorites, normalizeHaccpFavorites, toggleHaccpFavorite } from '@/lib/haccp-favorites';
const [a, b] = HACCP_FORMS;
beforeEach(() => { state.storage.clear(); state.fail = false; });
it('normalises duplicates and discards unknown or invalid forms', () => expect(normalizeHaccpFavorites([a.code, a.code, 'unknown', null])).toEqual([a.code]));
it('persists stars across reload and removes them on a second tap', async () => {
  await toggleHaccpFavorite('one', a.code); expect(await loadHaccpFavorites('one')).toEqual([a.code]);
  await toggleHaccpFavorite('one', a.code); expect(await loadHaccpFavorites('one')).toEqual([]);
});
it('keeps two users separate', async () => { await toggleHaccpFavorite('one', a.code); expect(await loadHaccpFavorites('two')).toEqual([]); });
it('does not lose concurrent star choices', async () => {
  await Promise.all([toggleHaccpFavorite('one', a.code), toggleHaccpFavorite('one', b.code)]);
  expect(await loadHaccpFavorites('one')).toEqual([a.code, b.code]);
});
it('keeps the previous selection if storage fails', async () => {
  await toggleHaccpFavorite('one', a.code); state.fail = true;
  await expect(toggleHaccpFavorite('one', b.code)).rejects.toThrow('disk');
  expect(await loadHaccpFavorites('one')).toEqual([a.code]);
});
it('recovers corrupt storage and ignores unknown toggles', async () => {
  state.storage.set(haccpFavoritesKey('one'), '{broken'); expect(await loadHaccpFavorites('one')).toEqual([]);
  await toggleHaccpFavorite('one', 'unknown'); expect(await loadHaccpFavorites('one')).toEqual([]);
});
