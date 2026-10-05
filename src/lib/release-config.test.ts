/**
 * MANAGER 24/7™ by PARADIM — proprietary software.
 * Copyright © 2026 PARADIM Operations SRL. All rights reserved.
 * Concept author and product director: Marius Paul Nemeșu.
 * See LICENSE-PROPRIETARY.md.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { canUseExternalCheckout, resolveDistributionChannel } from '@/constants/paradim';

const root = fileURLToPath(new URL('../..', import.meta.url));
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');

describe('Android release invariants', () => {
  it('keeps the app and native Android release versions aligned', () => {
    const app = JSON.parse(read('app.json'));
    const pkg = JSON.parse(read('package.json'));
    const gradle = read('android/app/build.gradle');
    expect(app.expo.version).toBe('1.6.1');
    expect(pkg.version).toBe(app.expo.version);
    expect(gradle).toContain('versionName "1.6.1"');
    expect(gradle).toContain('versionCode 60');
  });

  it('uses the atomic recipe RPC and an unambiguous ingredient relation', () => {
    const repository = read('src/lib/recipes-repository.ts');
    const migration = read('supabase/migrations/20260902120000_fix_recipe_save_schema_and_atomic_write.sql');
    const legacyAdapter = read('supabase/migrations/20260903105500_legacy_save_recipe_rpc.sql');
    expect(repository).toContain("supabase.rpc('foodcost_save_recipe'");
    expect(repository).toContain('recipe_ingredients!recipe_ingredients_recipe_owner_fk(*)');
    expect(migration).toContain('function public.foodcost_save_recipe(p_recipe jsonb)');
    expect(legacyAdapter).toContain('function public.save_recipe(recipe jsonb, ingredients jsonb)');
    expect(legacyAdapter).toContain('return public.foodcost_save_recipe(');
  });

  it('separates direct checkout from the Google Play build', () => {
    expect(resolveDistributionChannel('play')).toBe('play');
    expect(canUseExternalCheckout('play')).toBe(false);
    expect(resolveDistributionChannel('direct')).toBe('direct');
    expect(resolveDistributionChannel(undefined)).toBe('direct');
    expect(canUseExternalCheckout('direct')).toBe(true);

    const eas = JSON.parse(read('eas.json'));
    expect(eas.build.production.android.buildType).toBe('app-bundle');
    expect(eas.build.production.env.EXPO_PUBLIC_DISTRIBUTION_CHANNEL).toBe('play');
    expect(eas.build['production-apk'].android.buildType).toBe('apk');
    expect(eas.build['production-apk'].env.EXPO_PUBLIC_DISTRIBUTION_CHANNEL).toBe('direct');
  });

  it('ships only arm64 and keeps the test APK free of launch-risk optimizations', () => {
    const properties = read('android/gradle.properties');
    const app = JSON.parse(read('app.json'));
    const easIgnore = read('.easignore');
    const buildProperties = app.expo.plugins.find(
      (plugin: unknown) => Array.isArray(plugin) && plugin[0] === 'expo-build-properties',
    )[1].android;
    expect(properties).toContain('reactNativeArchitectures=arm64-v8a');
    expect(properties).toContain('android.enableMinifyInReleaseBuilds=true');
    expect(properties).toContain('android.enableShrinkResourcesInReleaseBuilds=true');
    expect(properties).toContain('org.gradle.parallel=false');
    expect(buildProperties.buildArchs).toEqual(['arm64-v8a']);
    expect(buildProperties.enableMinifyInReleaseBuilds).toBe(true);
    expect(buildProperties.enableShrinkResourcesInReleaseBuilds).toBe(true);
    expect(easIgnore).toContain('package-lock.json');
    expect(easIgnore).not.toMatch(/^android\/$/m);
  });

  it('can build a verified APK locally on Windows when the EAS quota is exhausted', () => {
    const script = read('BUILD-APK-LOCAL-WINDOWS.bat');
    const guide = read('BUILD-APK-LOCAL-WINDOWS.md');
    const gradle = read('android/app/build.gradle');
    expect(script).toContain('Android\\Android Studio\\jbr');
    expect(script).toContain('platforms;android-36');
    expect(script).toContain('ndk;27.1.12297006');
    expect(script).toContain('app:assembleRelease');
    expect(script).toContain('-PreactNativeArchitectures=arm64-v8a');
    expect(script).toContain('manager24-7-v1.6.1-local.apk');
    expect(guide).toContain('nu consumă cota lunară');
    expect(guide).toContain('semnat cu cheia locală de test');
    expect(gradle).toContain('hasLocalReleaseKeystore');
    expect(gradle).toContain("rootProject.file('keystore.properties')");
  });

  it('keeps the first screen compact and splits the editor into four practical tabs', () => {
    const signIn = read('src/app/sign-in.tsx');
    const editor = read('src/components/recipe-editor.tsx');
    const app = JSON.parse(read('app.json'));
    const splash = app.expo.plugins.find(
      (plugin: unknown) => Array.isArray(plugin) && plugin[0] === 'expo-splash-screen',
    )[1];
    expect(signIn).toContain('<BrandHeader prominent />');
    expect(read('src/components/ui.tsx')).toContain('<LanguageSelector />');
    expect(signIn).toContain('forceLight');
    expect(signIn).toContain('styles.shell');
    expect(signIn).not.toContain("from 'expo-linear-gradient'");
    expect(signIn).toContain('Manager 24/7 · v{appVersion}');
    expect(signIn).not.toContain('colors={[Brand.navyDeep');
    expect(app.expo.experiments.reactCompiler).toBeUndefined();
    expect(editor).toContain("const EDITOR_TABS = ['ingredients', 'cost', 'nutrition', 'compliance'] as const");
    expect(editor).toContain('EDITOR_TABS.map');
    expect(editor).toContain("t('nutrition.sectionRecipe')");
    expect(editor).not.toContain('COOKING_LOSS_SUGGESTIONS');
    expect(splash.image).toBe('./assets/brand/manager247-logo-transparent.png');
    expect(splash.imageWidth).toBe(210);
  });

  it('keeps production and HACCP in the main navigation and ingredients inside recipes', () => {
    const tabs = read('src/app/(app)/_layout.tsx');
    const recipes = read('src/app/(app)/recipes.tsx');
    const forms = read('src/constants/haccp-forms.ts');
    const haccpEditor = read('src/app/tools/haccp/[code].tsx');
    expect(tabs).toContain('<Tabs.Screen name="production"');
    expect(tabs).toContain('<Tabs.Screen name="haccp"');
    expect(tabs).toContain('<Tabs.Screen name="ingredients" options={{ href: null }}');
    expect(recipes).toContain('<IngredientsCatalog />');
    expect(forms).toContain('documentFields: [formDateField, ...form.documentFields]');
    expect(haccpEditor).toContain('bottomSafeArea');
  });

  it('enforces one editable location per account and reserves multi-location deletion for admins', () => {
    const tabs = read('src/app/(app)/_layout.tsx');
    const setup = read('src/app/location-setup.tsx');
    const account = read('src/app/(app)/account.tsx');
    const haccpSettings = read('src/app/tools/haccp-settings.tsx');
    const repository = read('src/lib/locations-repository.ts');
    const migration = read('supabase/migrations/20261004050832_enforce_single_location_access.sql');

    expect(tabs).toContain('getLocationSetupStatus');
    expect(tabs).toContain('<Redirect href="/location-setup" />');
    expect(setup).toContain('Creează locația și continuă');
    expect(account).toContain('updateLocation(userId, editingId');
    expect(account).toContain('removeLocation(userId, location.id, { canManageMultiple: isAdmin })');
    expect(haccpSettings).not.toContain('addLocation');
    expect(repository).toContain("new LocationAccessError('limit')");
    expect(migration).toContain('pg_catalog.pg_advisory_xact_lock');
    expect(migration).toContain("raise exception 'location_limit_reached'");
    expect(migration).toContain('create policy business_locations_update_own');
    expect(migration).toContain('create policy business_locations_delete_admin');
  });

  it('ships the monthly P&L on Home with offline persistence and user-scoped RLS', () => {
    const dashboard = read('src/app/(app)/index.tsx');
    const screen = read('src/app/tools/pnl.tsx');
    const repository = read('src/lib/pnl-repository.ts');
    const migration = read('supabase/migrations/20260916023654_manager247_pnl_reports_070.sql');
    expect(dashboard).toContain("router.push('/tools/pnl')");
    expect(screen).toContain('calculatePnl(draft)');
    expect(repository).toContain(".from('pnl_reports')");
    expect(repository).toContain('manager247.pnl_reports.v1.');
    expect(migration).toContain('alter table public.pnl_reports enable row level security');
    expect(migration).toContain('using ((select auth.uid()) = user_id)');
  });

  it('uses the Manager 24/7 name on every user-facing surface', () => {
    const app = JSON.parse(read('app.json'));
    const translations = read('src/i18n/translations.ts');
    const haccp = read('src/lib/haccp-sheet.ts');
    const nativeStrings = read('android/app/src/main/res/values/strings.xml');
    expect(app.expo.name).toBe('Manager 24/7');
    expect(app.expo.web.shortName).toBe('Manager 24/7');
    expect(translations).not.toContain('Manage24/7');
    expect(haccp).toContain('Manager 24/7 by PARADIM Operations');
    expect(nativeStrings).toContain('<string name="app_name">Manager 24/7</string>');
  });

  it('ships the complete PARADIM icon inside the adaptive safe area', () => {
    const app = JSON.parse(read('app.json'));
    const nativeColors = read('android/app/src/main/res/values/colors.xml');
    expect(app.expo.icon).toBe('./assets/brand/manager247-app-icon.png');
    expect(app.expo.android.adaptiveIcon.backgroundColor).toBe('#062544');
    expect(app.expo.android.adaptiveIcon.foregroundImage)
      .toBe('./assets/brand/manager247-adaptive-foreground.png');
    expect(nativeColors).toContain('<color name="iconBackground">#062544</color>');
    expect(readFileSync(resolve(root, 'assets/brand/manager247-app-icon.png'))
      .equals(readFileSync(resolve(root, 'public/icons/manager247-app-icon.png')))).toBe(true);
    expect(readFileSync(resolve(root, 'assets/brand/manager247-logo-transparent.png'))
      .equals(readFileSync(resolve(root, 'assets/brand/manager247-app-icon.png')))).toBe(false);
    expect(read('android/app/src/main/AndroidManifest.xml'))
      .toContain('<data android:scheme="manager247"/>');
  });

  it('cannot be held on the native splash by network or deferred billing', () => {
    const layout = read('src/app/_layout.tsx');
    const billing = read('src/hooks/use-billing.native.ts');
    const pkg = JSON.parse(read('package.json'));
    expect(layout).toContain('}, 1500);');
    expect(layout).toContain('bootSurface');
    expect(layout).not.toContain('return null');
    expect(layout).not.toContain('useSubscription');
    expect(layout).not.toContain('expo-notifications');
    expect(layout).not.toContain('configureHaccpNotificationHandler');
    expect(billing).not.toContain('react-native-iap');
    expect(pkg.dependencies['react-native-iap']).toBeUndefined();
    expect(pkg.dependencies['react-native-nitro-modules']).toBeUndefined();
  });

  it('keeps optional native notifications out of the post-login critical path', () => {
    const weeklyReminder = read('src/lib/weekly-report-reminder.native.ts');
    const priceNotifier = read('src/lib/price-alert-notifier.native.ts');
    const haccpReminders = read('src/lib/haccp-reminders.native.ts');
    const weeklyCard = read('src/components/weekly-manager-card.tsx');
    const dashboard = read('src/app/(app)/index.tsx');
    const layout = read('src/app/_layout.tsx');
    for (const module of [weeklyReminder, priceNotifier, haccpReminders]) {
      expect(module).not.toContain("import * as Notifications from 'expo-notifications'");
      expect(module).toContain("import('expo-notifications')");
    }
    expect(weeklyCard).toContain('areProductNotificationsEnabled(userId)');
    expect(dashboard).not.toContain("from 'expo-linear-gradient'");
    expect(dashboard).not.toContain("from 'react-native-svg'");
    expect(layout).toContain("animation: 'none'");
  });

  it('keeps the Android and React launch surfaces fully opaque', () => {
    const app = JSON.parse(read('app.json'));
    const layout = read('src/app/_layout.tsx');
    const styles = read('android/app/src/main/res/values/styles.xml');
    const activity = read('android/app/src/main/java/ro/paradim/professionalfoodcost/MainActivity.kt');
    expect(app.expo.backgroundColor).toBe('#F7F5EF');
    expect(layout).toContain("contentStyle: { backgroundColor: '#F7F5EF' }");
    expect(layout).toContain('style={styles.rootSurface}');
    expect(styles).toContain('<item name="android:windowBackground">@color/app_background</item>');
    expect(styles).toContain('<item name="android:windowIsTranslucent">false</item>');
    expect(styles).toContain('parent="Theme.AppCompat.Light.NoActionBar"');
    expect(styles).toContain('<item name="android:windowLightStatusBar">true</item>');
    expect(activity).toContain('AppCompatDelegate.MODE_NIGHT_NO');
    expect(activity).toContain('window.setBackgroundDrawable(ColorDrawable(opaqueBackground))');
    expect(activity).toContain('findViewById<View>(android.R.id.content)?.setBackgroundColor(opaqueBackground)');
  });

  it('keeps the post-OTP route and onboarding layout stable on Android', () => {
    const app = JSON.parse(read('app.json'));
    const auth = read('src/contexts/auth-context.tsx');
    const signIn = read('src/app/sign-in.tsx');
    const entry = read('src/app/index.tsx');
    const onboarding = read('src/app/onboarding.tsx');
    const languageSelector = read('src/components/language-selector.tsx');

    expect(app.expo.userInterfaceStyle).toBe('light');
    expect(auth).toContain('Promise<Session | null>');
    expect(auth).toContain('return verifiedSession');
    expect(signIn).toContain("router.replace('/')");
    expect(signIn).not.toContain('hasCompletedOnboarding');
    expect(signIn).toContain('!loading');
    expect(read('src/contexts/subscription-context.tsx')).toContain('extendOtpDemoAccess(supabase)');
    expect(read('supabase/migrations/20260920181813_demo_3d_otp_extension.sql'))
      .toContain('function public.extend_my_demo_after_otp()');
    expect(signIn).not.toContain("import { Redirect } from 'expo-router'");
    expect(entry).not.toContain('<Redirect');
    expect(onboarding).toContain('<Screen bottomSafeArea forceLight>');
    expect(onboarding).not.toContain('shell: { flex: 1');
    expect(languageSelector).not.toContain("width: '100%'");
    expect(languageSelector).toContain('flexShrink: 1');
  });

  it('requires invoice review, learns supplier mappings and keeps those mappings private', () => {
    const screen = read('src/app/tools/invoice-import.tsx');
    const scanner = read('src/lib/invoice-scan.ts');
    const edge = read('supabase/functions/scan-consumption-document/index.ts');
    const migration = read('supabase/migrations/20260916114640_manager247_invoice_mappings_080.sql');
    const indexFix = read('supabase/migrations/20260916115026_fix_invoice_mapping_fk_index.sql');
    expect(screen).toContain("t('invoice.confirmApply'");
    expect(screen).toContain('rememberInvoiceProductMappings');
    expect(scanner).toContain("body: { mode: 'invoice'");
    expect(edge).toContain("'application/pdf'");
    expect(edge).toContain('{ type: "document"');
    expect(migration).toContain('alter table public.supplier_product_mappings enable row level security');
    expect(migration).toContain('using ((select auth.uid()) = user_id)');
    expect(indexFix).toContain('(user_id, catalog_id)');
  });

  it('ships guided onboarding, visible price alerts and the WhatsApp weekly report', () => {
    const layout = read('src/app/_layout.tsx');
    const onboarding = read('src/app/onboarding.tsx');
    const dashboard = read('src/app/(app)/index.tsx');
    const recipes = read('src/app/(app)/recipes.tsx');
    const production = read('src/app/tools/production.tsx');
    const weekly = read('src/components/weekly-manager-card.tsx');
    expect(layout).toContain('<Stack.Screen name="onboarding"');
    expect(onboarding).toContain('enableWeeklyReportReminder');
    expect(onboarding).toContain("t('onboarding.importInvoice')");
    expect(dashboard).toContain('loadPriceAlertHistory');
    expect(dashboard).toContain("router.push('/tools/alerts'");
    expect(dashboard).not.toContain("router.push('/recipe/new')");
    expect(recipes).toContain("label={t('recipes.create')}");
    expect(production).toContain("router.push('/tools/invoice-import'");
    expect(weekly).toContain("shareOnWhatsApp(message)");
    expect(weekly).toContain("router.push('/tools/invoice-import')");
  });

  it('prices bulk recipes from the gross ingredient quantity after loss', () => {
    const bulk = read('src/app/tools/bulk.tsx');
    const operations = read('src/lib/operations.ts');
    expect(bulk).toContain("t('bulk.lossPercent')");
    expect(bulk).toContain('recalculateBulkOperationalLine');
    expect(operations).toContain('calculateBulkGrossQuantity');
  });

  it('does not request overlays or allow Android backup in release', () => {
    const manifest = read('android/app/src/main/AndroidManifest.xml');
    const app = JSON.parse(read('app.json'));
    expect(manifest).toContain('android.permission.SYSTEM_ALERT_WINDOW" tools:node="remove"');
    expect(manifest).toContain('android.permission.RECORD_AUDIO" tools:node="remove"');
    expect(manifest).toContain('android:allowBackup="false"');
    expect(app.expo.android.allowBackup).toBe(false);
    expect(app.expo.android.blockedPermissions).toContain('android.permission.SYSTEM_ALERT_WINDOW');
    expect(app.expo.android.blockedPermissions).toContain('android.permission.RECORD_AUDIO');
  });

  it('keeps generated files and secrets out while shipping the native Android fix', () => {
    const ignore = read('.easignore');
    expect(ignore).toContain('node_modules/');
    expect(ignore).toContain('dist-*/');
    expect(ignore).not.toMatch(/^android\/$/m);
    expect(ignore).toContain('.env.*');
    expect(ignore).toContain('*.jks');
  });

  it('ships the HACCP autocontrol calendar with imports and dated reminders', () => {
    const screen = read('src/app/tools/haccp.tsx');
    const calendar = read('src/components/haccp-autocontrol-calendar.tsx');
    const migration = read('supabase/migrations/20260919200546_haccp_autocontrol_and_team_invites.sql');
    expect(screen).toContain('<HaccpAutocontrolCalendar userId={userId} />');
    expect(calendar).toContain('parseHaccpAutocontrolImport');
    expect(calendar).toContain('<HaccpDateInput');
    expect(calendar).toContain('<HaccpTimeInput');
    expect(migration).toContain('alter table public.haccp_autocontrol_events enable row level security');
    expect(migration).toContain('using ((select auth.uid()) = user_id)');
  });

  it('keeps team invitations authenticated and nutrition references reviewable', () => {
    const team = read('src/lib/team-repository.ts');
    const edge = read('supabase/functions/send-team-invitation/index.ts');
    const nutrition = read('src/lib/nutrition-reference.ts');
    const haccpGrants = read('supabase/migrations/20260919202604_harden_haccp_autocontrol_grants.sql');
    const teamGrants = read('supabase/migrations/20260919202639_harden_workspace_member_grants.sql');
    expect(team).toContain("functions.invoke('send-team-invitation'");
    expect(edge).toContain('auth.getUser(token)');
    expect(edge).toContain('auth.signInWithOtp');
    expect(nutrition).toContain("sourceName: 'Open Food Facts'");
    expect(nutrition).toContain('confirmed: false');
    expect(haccpGrants).toContain('revoke all on table public.haccp_autocontrol_events from authenticated');
    expect(teamGrants).toContain('revoke all on table public.workspace_members from authenticated');
  });

  it('opens HACCP on Today while preserving the PARADIM inspection dossier', () => {
    const workspace = read('src/app/tools/haccp.tsx');
    const today = read('src/components/haccp-today.tsx');
    const editor = read('src/app/tools/haccp/[code].tsx');
    const exportModule = read('src/lib/haccp-export.ts');
    expect(workspace).toContain("useState<'today' | 'forms' | 'control'>('today')");
    expect(workspace).toContain('<HaccpToday');
    expect(workspace).toContain('exportHaccpControlPackPdf');
    expect(today).toContain('recordEquipmentTemperature');
    expect(today).toContain('Totul conform');
    expect(editor).toContain('Gata, următoarea sarcină');
    expect(exportModule).toContain('buildHaccpControlPackHtml');
  });

  it('ships stock thresholds, waste, recurring inventory and ingredient variance with RLS', () => {
    const screen = read('src/app/tools/operations-control.tsx');
    const variance = read('src/lib/management-control.ts');
    const migration = read('supabase/migrations/20260919210000_operations_control_workflows.sql');
    expect(screen).toContain('buildRestockSuggestions');
    expect(screen).toContain('saveWasteEntry');
    expect(screen).toContain('saveInventorySchedule');
    expect(variance).toContain('calculateIngredientVariances');
    expect(migration).toContain('create table if not exists public.stock_policies');
    expect(migration).toContain('create table if not exists public.waste_entries');
    expect(migration).toContain('using ((select auth.uid()) = user_id)');
    expect(migration).toContain('revoke all on table public.%I from anon, authenticated');
  });

  it('ships the waste prevention and redistribution compliance module with owner-scoped RLS', () => {
    const migration = read('supabase/migrations/20260926182333_waste_redistribution_module.sql');
    const screen = read('src/app/tools/waste-compliance.tsx');
    const repository = read('src/lib/waste-compliance-repository.ts');
    expect(migration).toContain('create table if not exists public.waste_prevention_plans');
    expect(migration).toContain('create table if not exists public.food_redistributions');
    expect(migration).toContain('(select auth.uid()) = user_id');
    expect(migration).toContain('revoke all on public.waste_prevention_plans');
    expect(screen).toContain('Plan anual PDF');
    expect(screen).toContain('Raport anual · Anexa 2 PDF');
    expect(screen).toContain('Dosar complet PDF');
    expect(screen).toContain('Completează cu modelul recomandat');
    expect(repository).toContain("supabase.from('food_redistributions')");
  });

  it('accepts local e-Factura UBL without storing SPV secrets on the phone', () => {
    const screen = read('src/app/tools/efactura.tsx');
    const parser = read('src/lib/efactura.ts');
    const invoice = read('src/app/tools/invoice-import.tsx');
    expect(screen).toContain('Necesită OAuth + certificat');
    expect(screen).not.toMatch(/clientSecret|refreshToken|accessToken/);
    expect(parser).toContain("throw new Error('efactura_unsafe_xml')");
    expect(parser).toContain('efacturaToScannedInvoice');
    expect(invoice).toContain('parseEfacturaXml');
    expect(invoice).toContain("'application/xml'");
  });
});

