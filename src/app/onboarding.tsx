/**
 * MANAGER 24/7™ by PARADIM — proprietary software.
 * Copyright © 2026 PARADIM Operations SRL. All rights reserved.
 * Concept author and product director: Marius Paul Nemeșu.
 * See LICENSE-PROPRIETARY.md.
 */

import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { AppButton, Body, BrandHeader, Card, Screen } from '@/components/ui';
import { Brand, Fonts, Radius, Shadow } from '@/constants/theme';
import { useAuth } from '@/contexts/auth-context';
import { useI18n } from '@/contexts/locale-context';
import { completeOnboarding } from '@/lib/onboarding';
import { enableWeeklyReportReminder } from '@/lib/weekly-report-reminder';

const ICONS = ['speedometer-outline', 'document-text-outline', 'notifications-outline'] as const;
const COPY = [
  { eyebrow: 'onboarding.step1Eyebrow', title: 'onboarding.step1Title', body: 'onboarding.step1Body' },
  { eyebrow: 'onboarding.step2Eyebrow', title: 'onboarding.step2Title', body: 'onboarding.step2Body' },
  { eyebrow: 'onboarding.step3Eyebrow', title: 'onboarding.step3Title', body: 'onboarding.step3Body' },
] as const;

export default function OnboardingScreen() {
  const router = useRouter();
  const auth = useAuth();
  const { t, locale } = useI18n();
  const [step, setStep] = useState(0);
  const [alertsEnabled, setAlertsEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const userId = auth.user?.id ?? 'demo';

  const finish = async (openInvoice = false) => {
    setBusy(true);
    try {
      await completeOnboarding(userId);
      router.replace(openInvoice ? '/tools/invoice-import' : '/(app)');
    } finally {
      setBusy(false);
    }
  };

  const enableAlerts = async () => {
    setBusy(true);
    try {
      const enabled = await enableWeeklyReportReminder(userId, locale);
      setAlertsEnabled(enabled);
      if (!enabled) Alert.alert(t('onboarding.permissionTitle'), t('onboarding.permissionBody'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen bottomSafeArea forceLight>
      <View style={styles.shell}>
        <BrandHeader mini />
        <Text style={styles.duration}>{t('onboarding.duration')}</Text>

        <Card style={styles.card}>
          <View style={styles.icon}><Ionicons name={ICONS[step]} size={30} color={Brand.navy} /></View>
          <Text style={styles.eyebrow}>{t(COPY[step].eyebrow)}</Text>
          <Text style={styles.title}>{t(COPY[step].title)}</Text>
          <Body>{t(COPY[step].body)}</Body>

          {step === 2 && (
            <Pressable
              accessibilityRole="button"
              onPress={() => void enableAlerts()}
              style={({ pressed }) => [styles.permission, alertsEnabled && styles.permissionActive, pressed && styles.pressed]}>
              <Ionicons name={alertsEnabled ? 'checkmark-circle' : 'notifications-outline'} size={22} color={alertsEnabled ? Brand.green : Brand.goldInk} />
              <View style={styles.permissionCopy}>
                <Text style={styles.permissionTitle}>{alertsEnabled ? t('onboarding.alertsOn') : t('onboarding.enableAlerts')}</Text>
                <Text style={styles.permissionBody}>{t('onboarding.alertsBody')}</Text>
              </View>
            </Pressable>
          )}
        </Card>

        <View style={styles.dots}>
          {[0, 1, 2].map((item) => <View key={item} style={[styles.dot, item === step && styles.dotActive]} />)}
        </View>

        {step < 2 ? (
          <View style={styles.actions}>
            <AppButton label={t('common.skip')} variant="ghost" onPress={() => void finish()} />
            <AppButton label={t('common.continue')} icon="arrow-forward" onPress={() => setStep((value) => value + 1)} />
          </View>
        ) : (
          <View style={styles.finalActions}>
            <AppButton label={t('onboarding.importInvoice')} icon="camera-outline" fullWidth loading={busy} onPress={() => void finish(true)} />
            <AppButton label={t('onboarding.openApp')} variant="secondary" fullWidth disabled={busy} onPress={() => void finish()} />
          </View>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  shell: { width: '100%', gap: 16, paddingVertical: 8 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  logo: { width: 58, height: 58, borderRadius: 29 },
  topCopy: { flex: 1, minWidth: 0 },
  appName: { color: Brand.navyDeep, fontSize: 19, fontFamily: Fonts.extraBold },
  duration: { color: Brand.muted, fontSize: 11, fontFamily: Fonts.medium, marginTop: 2 },
  card: { justifyContent: 'center', minHeight: 330, ...Shadow },
  icon: { width: 60, height: 60, borderRadius: 20, backgroundColor: Brand.goldSoft, alignItems: 'center', justifyContent: 'center', marginBottom: 18 },
  eyebrow: { color: Brand.goldInk, fontSize: 11, textTransform: 'uppercase', letterSpacing: 1.2, fontFamily: Fonts.extraBold },
  title: { color: Brand.navyDeep, fontSize: 28, lineHeight: 34, fontFamily: Fonts.extraBold, marginVertical: 9 },
  permission: { flexDirection: 'row', gap: 12, alignItems: 'center', borderWidth: 1, borderColor: Brand.line, borderRadius: Radius.medium, padding: 14, marginTop: 18 },
  permissionActive: { borderColor: Brand.green, backgroundColor: '#EAF7F1' },
  permissionCopy: { flex: 1 },
  permissionTitle: { color: Brand.navyDeep, fontSize: 13, fontFamily: Fonts.bold },
  permissionBody: { color: Brand.muted, fontSize: 10, lineHeight: 15, marginTop: 3, fontFamily: Fonts.regular },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 7 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: Brand.line },
  dotActive: { width: 24, backgroundColor: Brand.gold },
  actions: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  finalActions: { gap: 8 },
  pressed: { opacity: 0.76 },
});
