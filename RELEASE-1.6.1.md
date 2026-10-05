# MANAGER 24/7 v1.6.1

Android versionCode 60; iOS buildNumber 31.

The app icon, splash screen and in-app logo use the revised artwork without the thick blue outer border. The Android icon and splash backgrounds are white. The adaptive foreground retains safe padding so launcher masks do not cut off the lettering. `node scripts/prepare-brand-assets.cjs --android` regenerates the platform images and Android resources from `assets/brand/manager247-logo-clear.png`.

This source reconstructs the Excel fix on the verified local v1.6.0 project. The earlier v1.6.1 ZIP was unavailable locally.

Native recipe, cookbook and HR Excel exports now write XLSX bytes directly through Expo FileSystem. The HR logo remains embedded as PNG bytes. The web path continues to produce browser Blobs.

`npm ci` installs a version-guarded native byte adapter into `write-excel-file` 4.1.1 using `scripts/install-native-xlsx.cjs`. It reuses the upstream XML generator and synchronous ZIP compression, without changing global Blob or requiring Web Workers. The dependency is pinned; upgrading it requires reviewing the adapter. Large workbooks compress on the JavaScript thread and can briefly pause the UI.

Validation commands: `npm run typecheck`, `npm test`, `npm run lint`, `npm run qa:flows`.

Use `BUILD-APK-LOCAL-WINDOWS.bat` with JDK 17 and Android SDK 36 to build an arm64 release APK. Native source is tracked; caches, local SDK paths, signing keys and signing configuration are excluded from Git. The default local test signature is suitable for direct installation, not Google Play publication. Updating an existing installation requires the same signing key.

The export regression tests simulate the native Blob and Worker restrictions and reopen the resulting XLSX files on the desktop. They are not an on-device acceptance test. Consult the delivered verification report for actual build and device checks.
