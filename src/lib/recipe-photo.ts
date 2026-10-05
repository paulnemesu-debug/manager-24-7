import { Directory, File, Paths } from 'expo-file-system';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import type { ImagePickerResult } from 'expo-image-picker';
import { Platform } from 'react-native';

/** Keep a durable URI in native drafts and durable data on web, never a blob URL. */
export async function prepareRecipePhoto(picked: ImagePickerResult, userId: string): Promise<string | null> {
  if (picked.canceled || !picked.assets?.[0]) return null;
  const asset = picked.assets[0];
  if (!asset.uri) throw new Error('RECIPE_PHOTO_READ_FAILED');
  if (asset.mimeType && !asset.mimeType.startsWith('image/')) throw new Error('RECIPE_PHOTO_TYPE_INVALID');
  const optimized = await manipulateAsync(asset.uri,
    asset.width > 1280 ? [{ resize: { width: 1280 } }] : [],
    { compress: 0.78, format: SaveFormat.JPEG, base64: Platform.OS === 'web' });
  if (Platform.OS === 'web') {
    if (!optimized.base64) throw new Error('RECIPE_PHOTO_READ_FAILED');
    if (optimized.base64.length > Math.ceil(5_000_000 / 3) * 4) throw new Error('RECIPE_PHOTO_TOO_LARGE');
    return 'data:image/jpeg;base64,' + optimized.base64;
  }
  const directory = new Directory(Paths.document, 'recipe-photos', userId.replace(/[^a-zA-Z0-9_-]/g, '_'));
  directory.create({ idempotent: true, intermediates: true });
  const source = new File(optimized.uri);
  if (source.size > 5_000_000) throw new Error('RECIPE_PHOTO_TOO_LARGE');
  const target = new File(directory, `recipe-${Date.now()}-${Math.random().toString(16).slice(2)}.jpg`);
  source.copy(target);
  return target.uri;
}
