/**
 * MANAGER 24/7™ by PARADIM — proprietary software.
 * Copyright © 2026 PARADIM Operations SRL. All rights reserved.
 * Concept author and product director: Marius Paul Nemeșu.
 * See LICENSE-PROPRIETARY.md.
 */

import { Ionicons } from '@expo/vector-icons';
import { Redirect, Tabs, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { LoadingState, Screen } from '@/components/ui';
import { LocationCheckError } from '@/components/location-check-error';
import { Brand, Fonts } from '@/constants/theme';
import { useAuth } from '@/contexts/auth-context';
import { useI18n } from '@/contexts/locale-context';
import { useSubscription } from '@/contexts/subscription-context';
import { loadCachedHaccpDocuments } from '@/lib/haccp-repository';
import { listHaccpEquipment, loadHaccpProfile } from '@/lib/haccp-routine-repository';
import { pendingHaccpTodayCount } from '@/lib/haccp-today';
import { flushClientErrors } from '@/lib/client-errors';
import { getLocationSetupStatus, type LocationSetupStatus } from '@/lib/locations-repository';

const icons = {
  index: ['grid-outline', 'grid'] as const,
  recipes: ['restaurant-outline', 'restaurant'] as const,
  production: ['cart-outline', 'cart'] as const,
  haccp: ['shield-checkmark-outline', 'shield-checkmark'] as const,
  account: ['person-circle-outline', 'person-circle'] as const,
};

export default function AppLayout() {
  const auth = useAuth();
  const subscription = useSubscription();
  const { t, locale } = useI18n();
  const insets = useSafeAreaInsets();
  const userId = auth.user?.id ?? 'demo';
  const [haccpPending, setHaccpPending] = useState(0);
  const [locationSetup, setLocationSetup] = useState<LocationSetupStatus | 'checking'>('checking');
  const [locationCheckAttempt, setLocationCheckAttempt] = useState(0);
  useEffect(() => { if (auth.user?.id) void flushClientErrors(auth.user.id).catch(() => undefined); }, [auth.user?.id]);

  const refreshHaccpBadge = useCallback(async () => {
    const [documents, equipment, profile] = await Promise.all([
      loadCachedHaccpDocuments(userId),
      listHaccpEquipment(userId),
      loadHaccpProfile(userId, auth.user?.email ?? 'Operator'),
    ]);
    setHaccpPending(pendingHaccpTodayCount(documents, equipment, locale, new Date(), profile));
  }, [auth.user?.email, locale, userId]);

  useFocusEffect(useCallback(() => {
    void refreshHaccpBadge();
    const timer = setInterval(() => void refreshHaccpBadge(), 10_000);
    return () => clearInterval(timer);
  }, [refreshHaccpBadge]));

  useEffect(() => {
    let cancelled = false;
    if (auth.isDemo || subscription.isViewer) {
      setLocationSetup('configured');
      return () => { cancelled = true; };
    }

    setLocationSetup('checking');
    void getLocationSetupStatus(userId).then((status) => {
      if (!cancelled) setLocationSetup(status);
    }).catch(() => {
      if (!cancelled) setLocationSetup('unknown');
    });
    return () => { cancelled = true; };
  }, [auth.isDemo, subscription.isViewer, userId, locationCheckAttempt]);

  if (auth.isLoading || subscription.isLoading) {
    return <Screen scroll={false}><LoadingState /></Screen>;
  }
  if (!auth.isAuthenticated) return <Redirect href="/sign-in" />;
  if (!subscription.hasAccess) return <Redirect href="/paywall" />;
  if (!auth.isDemo && !subscription.isViewer && locationSetup === 'checking') {
    return <Screen scroll={false}><LoadingState label={locale === 'ro' ? 'Verificăm locația contului…' : 'Checking your account location…'} /></Screen>;
  }
  if (!auth.isDemo && !subscription.isViewer && locationSetup === 'missing') {
    return <Redirect href="/location-setup" />;
  }
  if (!auth.isDemo && !subscription.isViewer && locationSetup === 'unknown') {
    return <LocationCheckError onRetry={() => setLocationCheckAttempt((attempt) => attempt + 1)} />;
  }

  return (
    <Tabs
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: Brand.gold,
        tabBarInactiveTintColor: '#9BA6AF',
        tabBarStyle: {
          height: 60 + Math.max(insets.bottom, 8),
          paddingTop: 5,
          paddingBottom: Math.max(insets.bottom, 8),
          backgroundColor: Brand.navyDeep,
          borderTopWidth: 0,
        },
        tabBarLabelStyle: { fontSize: 11, fontFamily: Fonts.bold },
        tabBarIcon: ({ color, focused, size }) => {
          const pair = icons[route.name as keyof typeof icons] ?? icons.index;
          return <Ionicons name={focused ? pair[1] : pair[0]} color={color} size={size} />;
        },
      })}>
      <Tabs.Screen name="index" options={{ title: t('tabs.home') }} />
      <Tabs.Screen name="recipes" options={{ title: t('tabs.recipes') }} />
      <Tabs.Screen name="production" options={{ title: t('tabs.production') }} />
      <Tabs.Screen name="haccp"
        options={{
          title: t('tabs.haccp'),
          tabBarBadge: haccpPending || undefined,
          tabBarBadgeStyle: { backgroundColor: '#D7554C', color: '#FFFFFF', fontFamily: Fonts.bold },
        }}
      />
      <Tabs.Screen name="account" options={{ title: t('tabs.account') }} />
      <Tabs.Screen name="ingredients" options={{ href: null }} />
    </Tabs>
  );
}
