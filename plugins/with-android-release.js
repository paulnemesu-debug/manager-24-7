const { withAndroidStyles, withAndroidColors, withAndroidManifest, withAppBuildGradle, withMainActivity, withGradleProperties } = require('expo/config-plugins');

/** Preserve Android startup and signing fixes when Expo regenerates the native project. */
module.exports = function withAndroidRelease(config) {
  config = withAndroidColors(config, mod => {
    const colors = mod.modResults.resources.color ?? [];
    mod.modResults.resources.color = [...colors.filter(item => item.$.name !== 'app_background'),
      { $: { name: 'app_background' }, _: '#F7F5EF' }];
    return mod;
  });
  config = withAndroidStyles(config, mod => {
    const styles = mod.modResults.resources.style ?? [];
    let theme = styles.find(item => item.$.name === 'AppTheme');
    if (!theme) { theme = { $: { name: 'AppTheme' }, item: [] }; styles.push(theme); }
    theme.$.parent = 'Theme.AppCompat.Light.NoActionBar';
    const values = {
      'android:windowBackground': '@color/app_background', 'android:colorBackground': '@color/app_background',
      'android:windowIsTranslucent': 'false', 'android:windowIsFloating': 'false', 'android:windowShowWallpaper': 'false',
      'android:windowLightStatusBar': 'true', 'android:windowLightNavigationBar': 'true',
    };
    theme.item = [...(theme.item ?? []).filter(item => !(item.$.name in values)),
      ...Object.entries(values).map(([name, value]) => ({ $: { name }, _: value }))];
    mod.modResults.resources.style = styles;
    return mod;
  });
  config = withAndroidManifest(config, mod => {
    const permissions = mod.modResults.manifest['uses-permission'] ?? [];
    if (!permissions.some(item => item.$['android:name'] === 'android.permission.CAMERA')) {
      permissions.push({ $: { 'android:name': 'android.permission.CAMERA' } });
    }
    mod.modResults.manifest['uses-permission'] = permissions;
    return mod;
  });
  config = withGradleProperties(config, mod => {
    mod.modResults = mod.modResults.filter(item => !(item.type === 'property' && item.key === 'org.gradle.parallel'));
    mod.modResults.push({ type: 'property', key: 'org.gradle.parallel', value: 'false' });
    return mod;
  });
  config = withMainActivity(config, mod => {
    let source = mod.modResults.contents;
    if (mod.modResults.language !== 'kt') throw new Error('MANAGER 24/7 expects a Kotlin MainActivity');
    if (!source.includes('AppCompatDelegate.MODE_NIGHT_NO')) {
      source = source.replace(/^(package [^\n]+)$/m, `$1
import android.graphics.Color
import android.graphics.drawable.ColorDrawable
import android.view.View
import androidx.appcompat.app.AppCompatDelegate`);
      source = source.replace('super.onCreate(null)', `AppCompatDelegate.setDefaultNightMode(AppCompatDelegate.MODE_NIGHT_NO)
    super.onCreate(null)
    val opaqueBackground = Color.parseColor("#F7F5EF")
    window.setBackgroundDrawable(ColorDrawable(opaqueBackground))
    findViewById<View>(android.R.id.content)?.setBackgroundColor(opaqueBackground)`);
    }
    mod.modResults.contents = source;
    return mod;
  });
  return withAppBuildGradle(config, mod => {
    let source = mod.modResults.contents;
    if (!source.includes('hasLocalReleaseKeystore')) {
      source = source.replace(/^(def projectRoot = .+)$/m, `$1
def keystoreProperties = new Properties()
def keystorePropertiesFile = rootProject.file('keystore.properties')
def hasLocalReleaseKeystore = keystorePropertiesFile.exists()
if (hasLocalReleaseKeystore) {
    keystorePropertiesFile.withInputStream { keystoreProperties.load(it) }
}
`);
      source = source.replace(/(    signingConfigs \{[\s\S]*?        debug \{[\s\S]*?\n        \})/, `$1
        if (hasLocalReleaseKeystore) {
            release {
                storeFile rootProject.file(keystoreProperties['storeFile'])
                storePassword keystoreProperties['storePassword']
                keyAlias keystoreProperties['keyAlias']
                keyPassword keystoreProperties['keyPassword']
            }
        }`);
      source = source.replace(/signingConfig signingConfigs.debug/g,
        'signingConfig hasLocalReleaseKeystore ? signingConfigs.release : signingConfigs.debug');
    }
    mod.modResults.contents = source;
    return mod;
  });
};
