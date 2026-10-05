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
    return <Screen scroll={false}><LoadingState label="Pregătim locația…" /></Screen>;
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
        'Locația nu a fost salvată',
        error instanceof Error ? error.message : 'Verifică internetul și încearcă din nou.',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen bottomSafeArea>
      <BrandHeader compact />

      <View style={styles.heading}>
        <View style={styles.stepBadge}><Text style={styles.stepText}>PRIMUL PAS</Text></View>
        <Title>Configurează locația</Title>
        <Body>Acest cont va gestiona datele unei singure locații: rețete, producție, HR, P&amp;L și HACCP.</Body>
      </View>

      <Card tone="gold">
        <SectionHeader eyebrow="LOCAȚIA CONTULUI" title="Datele unității" />
        <Field
          label="Denumirea locației"
          value={name}
          onChangeText={setName}
          placeholder="Ex: Restaurant Central"
          autoFocus
        />
        <Field
          label="Adresa"
          value={address}
          onChangeText={setAddress}
          placeholder="Stradă, număr, localitate"
        />
        <AppButton
          label="Creează locația și continuă"
          icon="business-outline"
          fullWidth
          loading={busy}
          disabled={!name.trim()}
          onPress={() => void save()}
        />
      </Card>

      <Card tone="soft">
        <SectionHeader
          eyebrow={subscription.isAdmin ? 'CONT ADMINISTRATOR' : 'PLAN STANDARD'}
          title={subscription.isAdmin ? 'Poți adăuga mai multe ulterior' : 'O locație inclusă'}
        />
        <Body>{subscription.isAdmin
          ? 'După configurare, vei putea crea, edita și șterge locații din Cont.'
          : 'Poți edita această locație oricând din Cont. Accesul multi-locație va fi disponibil ca abonament suplimentar.'}</Body>
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
