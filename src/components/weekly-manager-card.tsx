/**
 * MANAGER 24/7™ by PARADIM — proprietary software.
 * Copyright © 2026 PARADIM Operations SRL. All rights reserved.
 * Concept author and product director: Marius Paul Nemeșu.
 * See LICENSE-PROPRIETARY.md.
 */

import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

import { AppButton, Body, Card, SectionHeader, StatusPill } from '@/components/ui';
import { Brand, Fonts, Radius, TabularNumbers } from '@/constants/theme';
import { useAuth } from '@/contexts/auth-context';
import { useI18n } from '@/contexts/locale-context';
import { usePreferences } from '@/contexts/preferences-context';
import { loadPriceAlertHistory, type StoredPriceAlert } from '@/lib/price-alert-history';
import { shareByEmail, shareOnWhatsApp } from '@/lib/share-links';
import { buildWeeklyReport, calculateWeeklyReportStats } from '@/lib/weekly-report';
import { areProductNotificationsEnabled, enableWeeklyReportReminder } from '@/lib/weekly-report-reminder';
import type { Recipe } from '@/types/recipe';

export function WeeklyManagerCard({ recipes }: { recipes: readonly Recipe[] }) {
  const router = useRouter();
  const auth = useAuth();
  const { t, locale } = useI18n();
  const { format } = usePreferences();
  const userId = auth.user?.id ?? 'demo';
  const [alerts, setAlerts] = useState<StoredPriceAlert[]>([]);
  const [notificationsOn, setNotificationsOn] = useState(false);
  const [busy, setBusy] = useState(false);

  useFocusEffect(useCallback(() => {
    void Promise.all([loadPriceAlertHistory(userId), areProductNotificationsEnabled(userId)])
      .then(([history, enabled]) => { setAlerts(history); setNotificationsOn(enabled); });
  }, [userId]));

  const stats = useMemo(() => calculateWeeklyReportStats(recipes), [recipes]);
  const message = useMemo(() => buildWeeklyReport({
    locale,
    recipes,
    alerts,
    money: format.money,
    percent: format.percent,
    dateLabel: format.date(new Date().toISOString()),
  }), [alerts, format, locale, recipes]);
  const latest = alerts[0] ?? null;

  const share = async (channel: 'whatsapp' | 'email') => {
    try {
      if (channel === 'whatsapp') await shareOnWhatsApp(message);
      else await shareByEmail(t('weekly.subject'), message);
    } catch {
      Alert.alert(t('weekly.shareFailedTitle'), t('weekly.shareFailedBody'));
    }
  };

  const enable = async () => {
    setBusy(true);
    try {
      const enabled = await enableWeeklyReportReminder(userId, locale);
      setNotificationsOn(enabled);
      if (!enabled) Alert.alert(t('onboarding.permissionTitle'), t('onboarding.permissionBody'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <View style={styles.icon}><Ionicons name="notifications-outline" size={20} color={Brand.navy} /></View>
        <View style={styles.copy}>
          <SectionHeader eyebrow={t('weekly.eyebrow')} title={t('weekly.title')} />
        </View>
        <StatusPill label={notificationsOn ? t('weekly.active') : t('weekly.inactive')} status={notificationsOn ? 'healthy' : 'watch'} />
      </View>
      {latest ? (
        <View style={styles.alert}>
          <Ionicons name="trending-up" size={18} color={Brand.red} />
          <View style={styles.copy}>
            <Text style={styles.alertTitle}>{latest.ingredientName} +{Math.round(latest.deltaPercent)}%</Text>
            <Text style={styles.alertBody}>{t('weekly.alertImpact', { count: latest.affectedRecipes, value: format.money(latest.monthlyMarginLoss || latest.averagePortionLoss) })}</Text>
            {latest.crossedTargets > 0 && <Text style={styles.alertBody}>{t('weekly.crossedTargets', { count: latest.crossedTargets })}</Text>}
            {latest.recipeChanges?.filter((item) => item.crossed).slice(0, 3).map((item) => <Text key={item.recipeId} style={styles.alertBody}>
              {item.title}: {format.percent(item.beforeFoodCost)} → {format.percent(item.afterFoodCost)} · {t('weekly.target', { value: format.percent(item.target) })}
            </Text>)}
          </View>
        </View>
      ) : (
        <Body>{t('weekly.noAlerts')}</Body>
      )}
      <View style={styles.metrics}>
        <Metric label={t('weekly.avgFoodCost')} value={format.percent(stats.averageFoodCost)} />
        <Metric label={t('weekly.overTarget')} value={String(stats.overTarget)} alert={stats.overTarget > 0} />
        <Metric label={t('weekly.recoverable')} value={format.money(stats.recoverablePerPortion)} />
      </View>
      <Text style={styles.metricNote}>{t('weekly.avgFoodCostNote')}</Text>
      <View style={styles.actions}>
        {!notificationsOn && <AppButton label={t('weekly.enable')} icon="notifications-outline" variant="secondary" loading={busy} onPress={() => void enable()} />}
        <AppButton label={t('weekly.scanInvoice')} icon="camera-outline" variant="secondary" onPress={() => router.push('/tools/invoice-import')} />
        <AppButton label="WhatsApp" icon="logo-whatsapp" onPress={() => void share('whatsapp')} />
        <AppButton label="Email" icon="mail-outline" variant="ghost" onPress={() => void share('email')} />
      </View>
    </Card>
  );
}

function Metric({ label, value, alert = false }: { label: string; value: string; alert?: boolean }) {
  return <View style={styles.metric}><Text style={styles.metricLabel}>{label}</Text><Text style={[styles.metricValue, alert && styles.metricAlert]}>{value}</Text></View>;
}

const styles = StyleSheet.create({
  card: { borderColor: '#D7E6E3' },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  icon: { width: 40, height: 40, borderRadius: 14, backgroundColor: Brand.tealSoft, alignItems: 'center', justifyContent: 'center' },
  copy: { flex: 1 },
  alert: { flexDirection: 'row', gap: 10, alignItems: 'center', padding: 12, borderRadius: Radius.medium, backgroundColor: '#FFF0EE' },
  alertTitle: { color: Brand.red, fontSize: 13, fontFamily: Fonts.extraBold, ...TabularNumbers },
  alertBody: { color: Brand.navySoft, fontSize: 10, lineHeight: 15, fontFamily: Fonts.medium, marginTop: 2 },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  metric: { flex: 1, minWidth: 92, padding: 10, borderRadius: Radius.medium, backgroundColor: Brand.cream },
  metricLabel: { color: Brand.muted, fontSize: 9, textTransform: 'uppercase', fontFamily: Fonts.bold },
  metricValue: { color: Brand.navyDeep, fontSize: 16, fontFamily: Fonts.extraBold, marginTop: 5, ...TabularNumbers },
  metricAlert: { color: Brand.red },
  metricNote: { color: Brand.muted, fontSize: 10, lineHeight: 15, fontFamily: Fonts.regular },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
