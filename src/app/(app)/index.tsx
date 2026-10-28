/**
 * MANAGER 24/7™ by PARADIM — proprietary software.
 * Copyright © 2026 PARADIM Operations SRL. All rights reserved.
 * Concept author and product director: Marius Paul Nemeșu.
 * See LICENSE-PROPRIETARY.md.
 */

import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { SyncBanner } from '@/components/sync-banner';
import { BrandHeader, ListSkeleton, Screen, StatusPill } from '@/components/ui';
import { Brand, Fonts, Radius, Shadow, TabularNumbers } from '@/constants/theme';
import { useAuth } from '@/contexts/auth-context';
import { useI18n } from '@/contexts/locale-context';
import { usePreferences } from '@/contexts/preferences-context';
import { useWorkspace } from '@/contexts/workspace-context';
import { useOperationalResource } from '@/hooks/use-operational-resource';
import { dailyAttendance, loadDailyOperations } from '@/lib/daily-operations';
import type { TranslationKey } from '@/i18n/translations';
import { totalMonthlyGrossSalary } from '@/lib/hr';
import { loadHrData } from '@/lib/hr-repository';
import { localIsoDate } from '@/lib/local-date-time';
import { calculatePnl, currentPnlPeriod } from '@/lib/pnl';
import { loadCachedPnlReports, syncPnlReports } from '@/lib/pnl-repository';
import { loadPriceAlertHistory, type StoredPriceAlert } from '@/lib/price-alert-history';
import { calculateProfitHealth } from '@/lib/profit-center';
import type { HrData } from '@/types/hr';
import type { PnlReport } from '@/types/pnl';

const EMPTY_HR: HrData = { employees: [], shifts: [] };

export default function DashboardScreen() {
  const router = useRouter();
  const auth = useAuth();
  const { t, locale } = useI18n();
  const { format } = usePreferences();
  const { recipes, isLoading } = useWorkspace();
  const userId = auth.user?.id ?? 'demo';
  const [currentPnl, setCurrentPnl] = useState<PnlReport | null>(null);
  const [hrData, setHrData] = useState<HrData>(EMPTY_HR);
  const [alerts, setAlerts] = useState<StoredPriceAlert[]>([]);
  const daily = useOperationalResource(useCallback(() => loadDailyOperations(userId, recipes, locale), [userId, recipes, locale]));

  useFocusEffect(useCallback(() => {
    let cancelled = false;
    const pickCurrent = (reports: PnlReport[]) => {
      if (!cancelled) setCurrentPnl(reports.find((item) => item.period === currentPnlPeriod()) ?? null);
    };

    void Promise.all([
      loadCachedPnlReports(userId),
      loadHrData(userId),
      loadPriceAlertHistory(userId),
    ]).then(([reports, nextHr, nextAlerts]) => {
      if (cancelled) return;
      pickCurrent(reports);
      setHrData(nextHr);
      setAlerts(nextAlerts);
    }).catch(() => undefined);

    void syncPnlReports(userId).then(pickCurrent).catch(() => undefined);
    return () => { cancelled = true; };
  }, [userId]));

  if (isLoading) {
    return <Screen scroll={false}><ListSkeleton rows={3} /></Screen>;
  }

  const sellable = recipes.filter((recipe) => !recipe.isSubRecipe);
  const health = calculateProfitHealth(sellable);
  const activeEmployees = hrData.employees.filter((employee) => employee.active);
  const activeEmployeeIds = new Set(activeEmployees.map((employee) => employee.id));
  const today = localIsoDate();
  const todayShifts = hrData.shifts.filter((shift) => (
    shift.workDate === today && activeEmployeeIds.has(shift.employeeId)
  ));
  const presentToday = todayShifts.filter((shift) => shift.status === 'present').length;
  const { pendingAttendance: pendingToday } = dailyAttendance(hrData, today);
  const latestAlert = alerts[0] ?? null;
  const pnlResult = currentPnl ? calculatePnl({
    ...currentPnl,
    payrollCost: totalMonthlyGrossSalary(hrData.employees),
  }) : null;
  const pnlStatusLabel = pnlResult
    ? t(`pnl.status${pnlResult.healthStatus[0].toUpperCase()}${pnlResult.healthStatus.slice(1)}` as TranslationKey)
    : t('pnl.statusIncomplete');
  const pnlStatusTone = !pnlResult || pnlResult.healthStatus === 'incomplete'
    ? 'neutral'
    : pnlResult.healthStatus;

  return (
    <Screen style={styles.screen}>
      <BrandHeader mini />
      <View style={styles.heading}>
        <Text style={styles.pageTitle}>{t('dashboard.homeTitle')}</Text>
        <Text style={styles.pageSubtitle}>{t('dashboard.homeSubtitle')}</Text>
      </View>
      <SyncBanner />

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="AI Daily Manager"
        onPress={() => router.push('/tools/daily-manager' as never)}
        style={({ pressed }) => [styles.dailyManagerCard, pressed && styles.pressed]}>
        <View style={styles.cardTopRow}>
          <View style={styles.dailyManagerIcon}><Ionicons name="sparkles" size={22} color={Brand.gold} /></View>
          <View style={styles.flex}>
            <Text style={styles.pnlEyebrow}>{t('operational.home.today')}</Text>
            <Text style={styles.dailyManagerTitle}>AI Daily Manager</Text>
            <Text style={styles.dailyManagerMeta}>{daily.loading ? t('operational.home.loading') : daily.error ? t('operational.home.unavailable') : daily.data ? t('operational.home.summary', { score: daily.data.score, count: daily.data.signals.length }) : t('operational.home.open')}</Text>
            {!!daily.data?.signals[0] && <Text style={styles.dailyManagerMeta}>{daily.data.signals[0].title}</Text>}
          </View>
          <Ionicons name="arrow-forward-circle" size={30} color={Brand.gold} />
        </View>
      </Pressable>

      <View style={styles.tileRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={locale === 'ro' ? 'Stare food cost și primele 3 acțiuni' : 'Food cost health and top 3 actions'}
          onPress={() => router.push('/tools/priorities' as never)}
          style={({ pressed }) => [styles.tile, styles.healthCard, pressed && styles.pressed]}>
          <View style={[styles.tileIcon, styles.healthIcon]}>
            <Ionicons name="speedometer" size={21} color={Brand.green} />
          </View>
          <Text style={styles.tileLabel}>{locale === 'ro' ? 'Stare food cost' : 'Food cost health'}</Text>
          <Text style={styles.tileValue}>{health === null ? '—' : `${health}/100`}</Text>
          <Text style={styles.tileMeta} numberOfLines={2}>
            {health === null
              ? t('dashboard.healthEmpty')
              : health >= 80
                ? (locale === 'ro' ? 'Vezi costurile și acțiunile' : 'View costs and actions')
                : (locale === 'ro' ? 'Vezi primele 3 acțiuni' : 'View top 3 actions')}
          </Text>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('dashboard.alertsTitle')}
          onPress={() => router.push('/tools/alerts' as never)}
          style={({ pressed }) => [
            styles.tile,
            latestAlert ? styles.alertCardActive : styles.alertCard,
            pressed && styles.pressed,
          ]}>
          <View style={[styles.tileIcon, latestAlert ? styles.alertIconActive : styles.alertIcon]}>
            <Ionicons name={latestAlert ? 'warning' : 'notifications'} size={21} color={latestAlert ? Brand.red : Brand.tealDeep} />
          </View>
          <Text style={styles.tileLabel}>{t('dashboard.alertsTitle')}</Text>
          <Text style={styles.tileValue}>{alerts.length}</Text>
          <Text style={styles.tileMeta} numberOfLines={2}>
            {latestAlert
              ? t('dashboard.alertLatest', {
                name: latestAlert.ingredientName,
                value: Math.round(latestAlert.deltaPercent),
              })
              : t('dashboard.alertsEmpty')}
          </Text>
        </Pressable>
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('dashboard.pnlOpen')}
        onPress={() => router.push('/tools/pnl')}
        style={({ pressed }) => [styles.pnlCard, pressed && styles.pressed]}>
        <View style={styles.cardTopRow}>
          <View style={styles.pnlIcon}>
            <Ionicons name="bar-chart" size={22} color={Brand.gold} />
          </View>
          <View style={styles.flex}>
            <Text style={styles.pnlEyebrow}>{t('dashboard.pnlEyebrow')}</Text>
            <Text style={styles.pnlTitle}>{t('dashboard.pnlTitle')}</Text>
          </View>
          <StatusPill label={pnlStatusLabel} status={pnlStatusTone} />
        </View>
        <Text style={styles.pnlValue} numberOfLines={1} adjustsFontSizeToFit>
          {pnlResult ? format.money(pnlResult.netResult) : '—'}
        </Text>
        <Text style={styles.pnlMeta}>
          {pnlResult
            ? `${t('dashboard.pnlRevenue')}: ${format.money(pnlResult.totalRevenue)} · ${t('dashboard.pnlNetMargin')}: ${format.percent(pnlResult.netMarginPercent)}`
            : t('dashboard.pnlEmpty')}
        </Text>
        <View style={styles.openRow}>
          <Text style={styles.openText}>{t('dashboard.pnlOpen')}</Text>
          <Ionicons name="arrow-forward" size={18} color={Brand.gold} />
        </View>
      </Pressable>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('dashboard.hrOpen')}
        onPress={() => router.push('/tools/hr')}
        style={({ pressed }) => [styles.hrCard, pressed && styles.pressed]}>
        <View style={styles.cardTopRow}>
          <View style={styles.hrIcon}>
            <Ionicons name="people" size={25} color={Brand.navyDeep} />
          </View>
          <View style={styles.flex}>
            <Text style={styles.hrEyebrow}>{t('dashboard.hrEyebrow')}</Text>
            <Text style={styles.hrTitle}>{t('dashboard.hrTitle')}</Text>
          </View>
          <Ionicons name="arrow-forward-circle" size={30} color={Brand.navy} />
        </View>
        <View style={styles.hrSummary}>
          <View>
            <Text style={styles.hrValue}>{activeEmployees.length}</Text>
            <Text style={styles.hrValueLabel}>{t('dashboard.hrActive')}</Text>
          </View>
          <View style={styles.hrToday}>
            <Text style={styles.hrTodayValue}>{presentToday}</Text>
            <Text style={styles.hrTodayLabel}>{t('dashboard.hrPresentToday')}</Text>
          </View>
        </View>
        <View style={[styles.hrStatus, pendingToday > 0 && styles.hrStatusWarning]}>
          <Ionicons
            name={pendingToday > 0 ? 'time-outline' : 'checkmark-circle'}
            size={16}
            color={pendingToday > 0 ? Brand.amber : Brand.green}
          />
          <Text style={[styles.hrStatusText, pendingToday > 0 && styles.hrStatusTextWarning]}>
            {activeEmployees.length
              ? t('dashboard.hrToday', { present: presentToday, pending: pendingToday })
              : t('dashboard.hrEmpty')}
          </Text>
        </View>
      </Pressable>

    </Screen>
  );
}

const styles = StyleSheet.create({
  dailyManagerCard: { borderRadius: 20, backgroundColor: Brand.navyDeep, padding: 16, ...Shadow },
  dailyManagerIcon: { width: 44, height: 44, borderRadius: 14, backgroundColor: Brand.navy, alignItems: 'center', justifyContent: 'center' },
  dailyManagerTitle: { color: Brand.white, fontSize: 18, fontFamily: Fonts.extraBold, marginBottom: 3 },
  dailyManagerMeta: { color: Brand.white, opacity: 0.9, fontSize: 12, fontFamily: Fonts.regular, lineHeight: 18 },
  screen: { paddingTop: 16, gap: 13 },
  heading: { gap: 2 },
  eyebrow: { color: Brand.goldInk, fontSize: 10, fontFamily: Fonts.bold, letterSpacing: 1.5 },
  pageTitle: { color: Brand.navyDeep, fontSize: 25, lineHeight: 31, fontFamily: Fonts.extraBold },
  pageSubtitle: { color: Brand.muted, fontSize: 12, lineHeight: 18, fontFamily: Fonts.regular },
  flex: { flex: 1 },
  cardTopRow: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  hrCard: {
    minHeight: 182,
    borderRadius: Radius.large,
    backgroundColor: Brand.goldSoft,
    borderWidth: 1.5,
    borderColor: '#DEB957',
    padding: 17,
    gap: 14,
    ...Shadow,
  },
  hrIcon: { width: 46, height: 46, borderRadius: 15, backgroundColor: Brand.gold, alignItems: 'center', justifyContent: 'center' },
  hrEyebrow: { color: Brand.goldInk, fontSize: 9, fontFamily: Fonts.bold, letterSpacing: 1.1, textTransform: 'uppercase' },
  hrTitle: { color: Brand.navyDeep, fontSize: 21, lineHeight: 26, fontFamily: Fonts.extraBold },
  hrSummary: { flexDirection: 'row', alignItems: 'flex-end', gap: 25 },
  hrValue: { color: Brand.navyDeep, fontSize: 40, lineHeight: 42, fontFamily: Fonts.extraBold, ...TabularNumbers },
  hrValueLabel: { color: Brand.navySoft, fontSize: 10, fontFamily: Fonts.bold, textTransform: 'uppercase' },
  hrToday: { borderLeftWidth: 1, borderLeftColor: '#D3AE4E', paddingLeft: 20 },
  hrTodayValue: { color: Brand.green, fontSize: 28, lineHeight: 31, fontFamily: Fonts.extraBold, ...TabularNumbers },
  hrTodayLabel: { color: Brand.navySoft, fontSize: 9, fontFamily: Fonts.bold, textTransform: 'uppercase' },
  hrStatus: { flexDirection: 'row', alignItems: 'center', gap: 7, borderRadius: Radius.pill, backgroundColor: Brand.greenSoft, paddingHorizontal: 11, paddingVertical: 8 },
  hrStatusWarning: { backgroundColor: Brand.amberSoft },
  hrStatusText: { flex: 1, color: Brand.green, fontSize: 10, lineHeight: 15, fontFamily: Fonts.bold },
  hrStatusTextWarning: { color: Brand.amber },
  tileRow: { flexDirection: 'row', gap: 10 },
  tile: { flex: 1, minWidth: 0, minHeight: 174, borderRadius: Radius.large, borderWidth: 1, padding: 14, gap: 7 },
  healthCard: { backgroundColor: Brand.greenSoft, borderColor: '#B9DDCB' },
  alertCard: { backgroundColor: Brand.tealSoft, borderColor: '#B8E1DB' },
  alertCardActive: { backgroundColor: Brand.redSoft, borderColor: '#F0C8C8' },
  tileIcon: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  healthIcon: { backgroundColor: '#D3ECDD' },
  alertIcon: { backgroundColor: '#D2EEE9' },
  alertIconActive: { backgroundColor: '#F6D6D6' },
  tileLabel: { color: Brand.navyDeep, fontSize: 12, fontFamily: Fonts.extraBold },
  tileValue: { color: Brand.navyDeep, fontSize: 28, lineHeight: 32, fontFamily: Fonts.extraBold, ...TabularNumbers },
  tileMeta: { color: Brand.navySoft, fontSize: 10, lineHeight: 15, fontFamily: Fonts.medium },
  pnlCard: { borderRadius: Radius.large, backgroundColor: Brand.navy, padding: 18, gap: 10, ...Shadow },
  pnlIcon: { width: 43, height: 43, borderRadius: 14, backgroundColor: '#173B5B', alignItems: 'center', justifyContent: 'center' },
  pnlEyebrow: { color: '#C5D7DF', fontSize: 9, fontFamily: Fonts.bold, letterSpacing: 1, textTransform: 'uppercase' },
  pnlTitle: { color: Brand.white, fontSize: 19, fontFamily: Fonts.extraBold },
  pnlValue: { color: Brand.white, fontSize: 40, lineHeight: 46, fontFamily: Fonts.extraBold, letterSpacing: -1.2, ...TabularNumbers },
  pnlMeta: { color: '#D9EEE9', fontSize: 11, lineHeight: 17, fontFamily: Fonts.regular, ...TabularNumbers },
  openRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 7, marginTop: 2 },
  openText: { color: Brand.gold, fontSize: 11, fontFamily: Fonts.bold },
  pressed: { opacity: 0.75, transform: [{ scale: 0.99 }] },
});
