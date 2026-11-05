import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { AndroidConfig, type ExportedConfig } from 'expo/config-plugins';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const withAndroidRelease = require('../../plugins/with-android-release.js') as (config: ExportedConfig) => ExportedConfig;
type Manifest = AndroidConfig.Manifest.AndroidManifest;

async function applyManifest(manifest: Manifest) {
  const config = withAndroidRelease({ name: 'Camera compatibility fixture', slug: 'camera-fixture' });
  const result = await config.mods!.android!.manifest!({
    ...config,
    modRawConfig: config,
    modResults: manifest,
    modRequest: { platform: 'android', modName: 'manifest', projectRoot: process.cwd(),
      platformProjectRoot: `${process.cwd()}/android`, introspect: true },
  });
  return result.modResults as Manifest;
}

function expectOptionalCamera(manifest: Manifest) {
  for (const name of ['android.hardware.camera', 'android.hardware.camera.autofocus']) {
    const declarations = manifest.manifest['uses-feature']?.filter(item => item.$['android:name'] === name);
    expect(declarations, name).toHaveLength(1);
    expect(declarations![0].$['android:required'], name).toBe('false');
  }
}

describe('Android camera device compatibility', () => {
  it('allows devices without camera hardware while retaining runtime camera permission', async () => {
    const manifest = await applyManifest({ manifest: { $: { 'xmlns:android': 'http://schemas.android.com/apk/res/android' }, queries: [] } });
    expectOptionalCamera(manifest);
    expect(manifest.manifest['uses-permission']).toContainEqual({ $: { 'android:name': 'android.permission.CAMERA' } });
  });

  it('overrides old required camera declarations, preserves unrelated capabilities, and is idempotent', async () => {
    const manifest: Manifest = { manifest: {
      $: { 'xmlns:android': 'http://schemas.android.com/apk/res/android' },
      queries: [],
      'uses-permission': [{ $: { 'android:name': 'android.permission.CAMERA' } }, { $: { 'android:name': 'android.permission.INTERNET' } }],
      'uses-feature': [
        { $: { 'android:name': 'android.hardware.camera', 'android:required': 'true' } },
        { $: { 'android:name': 'android.hardware.camera.autofocus', 'android:required': 'true' } },
        { $: { 'android:name': 'android.hardware.bluetooth', 'android:required': 'false' } },
      ],
    } };
    const once = await applyManifest(manifest);
    const snapshot = structuredClone(once);
    const twice = await applyManifest(once);
    expectOptionalCamera(twice);
    expect(twice).toEqual(snapshot);
    expect(twice.manifest['uses-permission']).toHaveLength(2);
    expect(twice.manifest['uses-feature']).toContainEqual({ $: { 'android:name': 'android.hardware.bluetooth', 'android:required': 'false' } });
  });

  it('ships the same optional camera declarations in the checked-in native manifest', async () => {
    const manifest = await AndroidConfig.Manifest.readAndroidManifestAsync(
      fileURLToPath(new URL('../../android/app/src/main/AndroidManifest.xml', import.meta.url)),
    );
    expectOptionalCamera(manifest);
  });
});
