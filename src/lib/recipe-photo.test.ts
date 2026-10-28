import { beforeEach, expect, it, vi } from 'vitest';
import type { ImagePickerResult } from 'expo-image-picker';
const state = vi.hoisted(() => ({ os: 'android', size: 1000, copies: [] as string[], options: [] as unknown[], fail: false, base64: 'AQID' }));
vi.mock('react-native', () => ({ Platform: { get OS() { return state.os; } } }));
vi.mock('expo-image-manipulator', () => ({ SaveFormat: { JPEG: 'jpeg' }, manipulateAsync: async (_uri: string, actions: unknown, options: unknown) => {
  if (state.fail) throw Error('camera'); state.options.push([actions, options]); return { uri: 'file:///cache/optimized.jpg', base64: state.base64 };
} }));
vi.mock('expo-file-system', () => ({ Paths: { document: 'file:///documents' }, Directory: class {
  uri: string; constructor(...parts: string[]) { this.uri = parts.join('/'); } create() {}
}, File: class {
  uri: string; size = state.size;
  constructor(...parts: (string | { uri: string })[]) { this.uri = parts.map((x) => typeof x === 'string' ? x : x.uri).join('/'); }
  copy(target: { uri: string }) { state.copies.push(target.uri); }
} }));
import { prepareRecipePhoto } from '@/lib/recipe-photo';
const picked = { canceled: false, assets: [{ uri: 'file:///camera/photo.jpg', width: 2400, height: 1800, mimeType: 'image/jpeg' }] } as ImagePickerResult;
beforeEach(() => { state.os = 'android'; state.size = 1000; state.copies = []; state.options = []; state.fail = false; state.base64 = 'AQID'; });
it('moves selected photos out of the temporary cache, scoped to their account', async () => {
  const uri = await prepareRecipePhoto(picked, 'user-one'); expect(uri).toContain('file:///documents/recipe-photos/user-one/'); expect(state.copies).toEqual([uri]);
});
it('keeps durable image data on web', async () => { state.os = 'web'; expect(await prepareRecipePhoto(picked, 'one')).toBe('data:image/jpeg;base64,AQID'); expect(state.copies).toEqual([]); });
it('cancellation never modifies a draft photo', async () => { expect(await prepareRecipePhoto({ canceled: true, assets: null }, 'one')).toBeNull(); expect(state.options).toEqual([]); });
it('rejects unsupported content and large photos', async () => {
  await expect(prepareRecipePhoto({ canceled: false, assets: [{ ...picked.assets![0], mimeType: 'video/mp4' }] }, 'one')).rejects.toThrow('RECIPE_PHOTO_TYPE_INVALID');
  state.size = 5_000_001; await expect(prepareRecipePhoto(picked, 'one')).rejects.toThrow('RECIPE_PHOTO_TOO_LARGE'); expect(state.copies).toEqual([]);
});
it('retains failure feedback instead of returning a broken URI', async () => { state.fail = true; await expect(prepareRecipePhoto(picked, 'one')).rejects.toThrow('camera'); });
