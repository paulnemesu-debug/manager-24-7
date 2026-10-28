import { locationErrorMessage } from '@/lib/locations-repository';
import { useI18n } from '@/contexts/locale-context';
/**
 * MANAGER 24/7™ by PARADIM — proprietary software.
 * Copyright © 2026 PARADIM Operations SRL. All rights reserved.
 * Concept author and product director: Marius Paul Nemeșu.
 * See LICENSE-PROPRIETARY.md.
 */

import { Redirect, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

import {
  AppButton,
  Body,
  BrandHeader,
  Card,
  Field,
  LoadingState,
  Screen,
  SectionHeader,
  Title,
} from '@/components/ui';
import { Brand, Fonts, Radius } from '@/constants/theme';
import { useAuth } from '@/contexts/auth-context';
import { useSubscription } from '@/contexts/subscription-context';
import { LocationCheckError } from '@/components/location-check-error';
import { addLocation, getLocationSetupStatus, type LocationSetupStatus } from '@/lib/locations-repository';

export default function LocationSetupScreen() {
  const router = useRouter();
  const { locale, t } = useI18n();
  const auth = useAuth();
  const subscription = useSubscription();
  const userId = auth.user?.id ?? 'demo';
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [setupStatus, setSetupStatus] = useState<LocationSetupStatus | 'checking'>('checking');
  const [checkAttempt, setCheckAttempt] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!auth.isAuthenticated || auth.isDemo || subscription.isViewer) {
      setSetupStatus('configured');
      return () => { cancelled = true; };
    }
    setSetupStatus('checking');
    void getLocationSetupStatus(userId)
      .then((status) => {
        if (cancelled) return;
        setSetupStatus(status);
        if (status === 'configured') router.replace('/(app)');
      })
      .catch(() => {
        if (!cancelled) setSetupStatus('unknown');
      });
    return () => { cancelled = true; };
  }, [auth.isAuthenticated, auth.isDemo, router, subscription.isViewer, userId, checkAttempt]);

  if (auth.isLoading || subscription.isLoading || setupStatus === 'checking') {
    return <Screen scroll={false}><LoadingState label={t('operational.locations.loading')} /></Screen>;
  }
  if (!auth.isAuthenticated) return <Redirect href="/sign-in" />;
  if (!subscription.hasAccess) return <Redirect href="/paywall" />;
  if (auth.isDemo || subscription.isViewer) return <Redirect href="/(app)" />;
  if (setupStatus === 'unknown') {
    return <LocationCheckError onRetry={() => setCheckAttempt((attempt) => attempt + 1)} />;
  }

  const save = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      await addLocation(userId, name, address, { canManageMultiple: subscription.isAdmin });
      router.replace('/(app)');
    } catch (error) {
      Alert.alert(
        t('operational.locations.saveError'),
        locationErrorMessage(error, locale, 'operational.locations.retry'),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen bottomSafeArea>
      <BrandHeader compact />

      <View style={styles.heading}>
        <View style={styles.stepBadge}><Text style={styles.stepText}>{t('operational.locations.first')}</Text></View>
        <Title>{t('operational.locations.setup')}</Title>
        <Body>{t('operational.locations.setupNote')}</Body>
      </View>

      <Card tone="gold">
        <SectionHeader eyebrow={t('operational.locations.account')} title={t('operational.locations.details')} />
        <Field
          label={t('operational.locations.name')}
          value={name}
          onChangeText={setName}
          placeholder={t('operational.locations.example')}
          autoFocus
        />
        <Field
          label={t('operational.locations.address')}
          value={address}
          onChangeText={setAddress}
          placeholder={t('operational.locations.addressExample')}
        />
        <AppButton
          label={t('operational.locations.create')}
          icon="business-outline"
          fullWidth
          loading={busy}
          disabled={!name.trim()}
          onPress={() => void save()}
        />
      </Card>

      <Card tone="soft">
        <SectionHeader
          eyebrow={subscription.isAdmin ? t('operational.locations.admin') : t('operational.locations.standard')}
          title={subscription.isAdmin ? t('operational.locations.more') : t('operational.locations.one')}
        />
        <Body>{subscription.isAdmin
          ? t('operational.locations.adminNote')
          : t('operational.locations.singleNote')}</Body>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  heading: { gap: 8 },
  stepBadge: {
    alignSelf: 'flex-start',
    backgroundColor: Brand.tealSoft,
    borderRadius: Radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  stepText: { color: Brand.teal, fontSize: 10, letterSpacing: 1.2, fontFamily: Fonts.extraBold },
});
