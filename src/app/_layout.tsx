/**
 * MANAGER 24/7™ by PARADIM — proprietary software.
 * Copyright © 2026 PARADIM Operations SRL. All rights reserved.
 * Concept author and product director: Marius Paul Nemeșu.
 * See LICENSE-PROPRIETARY.md.
 */

import { withCrashReporting } from '@/lib/crash-reporting';
import { Manrope_400Regular } from '@expo-google-fonts/manrope/400Regular';
import { Manrope_500Medium } from '@expo-google-fonts/manrope/500Medium';
import { Manrope_600SemiBold } from '@expo-google-fonts/manrope/600SemiBold';
import { Manrope_700Bold } from '@expo-google-fonts/manrope/700Bold';
import { Manrope_800ExtraBold } from '@expo-google-fonts/manrope/800ExtraBold';
import { Stack } from 'expo-router';
import Head from 'expo-router/head';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import { Appearance, StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppErrorBoundary } from '@/components/app-error-boundary';
import { installClientErrorHandler } from '@/lib/client-errors';

import { AuthProvider } from '@/contexts/auth-context';
import { LocaleProvider } from '@/contexts/locale-context';
import { PreferencesProvider } from '@/contexts/preferences-context';
import { SubscriptionProvider } from '@/contexts/subscription-context';
import { WorkspaceProvider } from '@/contexts/workspace-context';

void SplashScreen.preventAutoHideAsync().catch(() => undefined);

function AppNavigator() {
  return (
    <WorkspaceProvider>
      <Head>
        <title>Manager 24/7 by PARADIM</title>
        <meta name="description" content="Bucătăria ta, sub control — costuri, producție și HACCP." />
      </Head>
      <Stack
        screenOptions={{
          headerShown: false,
          // Tranzițiile cu alpha dintre redirectările login -> home pot lăsa
          // launcherul vizibil pe Samsung/Android 16. Ecranele sunt opace și
          // schimbate fără fade pe traseul critic de autentificare.
          animation: 'none',
          contentStyle: { backgroundColor: '#F7F5EF' },
        }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="sign-in" />
        <Stack.Screen name="onboarding" />
        <Stack.Screen name="auth/callback" />
        <Stack.Screen name="paywall" />
        <Stack.Screen name="location-setup" />
        <Stack.Screen name="(app)" />
        <Stack.Screen name="recipe/new" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="recipe/[id]" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="ingredient/new" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="ingredient/[id]" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="tools/invoice-import" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="tools/production" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="tools/consumption-vouchers" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="tools/bulk" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="tools/menu-engineering" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="tools/haccp" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="tools/haccp/[code]" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="tools/simulator" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="tools/alerts" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="tools/pnl" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="tools/management-control" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="tools/operations-control" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="tools/waste-compliance" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="tools/hr" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="tools/hr-lifecycle" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="tools/compliance-documents" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="tools/control-mode" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="tools/daily-manager" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="tools/efactura" options={{ animation: 'slide_from_right' }} />
      </Stack>
    </WorkspaceProvider>
  );
}

function RootLayout() {
  useEffect(() => installClientErrorHandler(), []);
  const [fontWaitExpired, setFontWaitExpired] = useState(false);
  const [fontsLoaded, fontError] = useFonts({
    Manrope_400Regular,
    Manrope_500Medium,
    Manrope_600SemiBold,
    Manrope_700Bold,
    Manrope_800ExtraBold,
  });

  useEffect(() => {
    // MANAGER 24/7 folosește o singură temă controlată. Android poate raporta
    // dark mode chiar dacă manifestul cere light, iar câmpurile native ajung
    // altfel cu text închis pe fundal închis pe anumite telefoane Samsung.
    if (typeof Appearance.setColorScheme === 'function') Appearance.setColorScheme('light');
  }, []);

  useEffect(() => {
    // Fonturile sunt cosmetice: aplicația trebuie să pornească și dacă Android
    // întârzie sau nu confirmă încărcarea lor.
    const fallback = setTimeout(() => {
      setFontWaitExpired(true);
    }, 1500);
    return () => clearTimeout(fallback);
  }, []);

  useEffect(() => {
    if (fontsLoaded || fontError || fontWaitExpired) {
      void SplashScreen.hideAsync().catch(() => undefined);
    }
  }, [fontError, fontWaitExpired, fontsLoaded]);

  // Nu returnăm niciodată `null`: pe unele versiuni Samsung/Android 16,
  // fereastra activității devine transparentă și lasă launcherul vizibil.
  if (!fontsLoaded && !fontError && !fontWaitExpired) {
    return <View style={styles.bootSurface} />;
  }

  return (
    <AppErrorBoundary><GestureHandlerRootView style={styles.rootSurface}>
      <SafeAreaProvider style={styles.rootSurface}>
        <LocaleProvider>
          <AuthProvider>
            <PreferencesProvider>
              <SubscriptionProvider>
                <AppNavigator />
              </SubscriptionProvider>
            </PreferencesProvider>
          </AuthProvider>
        </LocaleProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView></AppErrorBoundary>
  );
}

export default withCrashReporting(RootLayout);

const styles = StyleSheet.create({
  rootSurface: { flex: 1, backgroundColor: '#F7F5EF' },
  bootSurface: { flex: 1, backgroundColor: '#F7F5EF' },
});
