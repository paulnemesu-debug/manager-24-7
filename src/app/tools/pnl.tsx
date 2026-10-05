/**
 * MANAGER 24/7™ by PARADIM — proprietary software.
 * Copyright © 2026 PARADIM Operations SRL. All rights reserved.
 * Concept author and product director: Marius Paul Nemeșu.
 * See LICENSE-PROPRIETARY.md.
 */

import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { ToolHeader } from '@/components/tool-header';
import { AppButton, Body, Card, Field, ListSkeleton, Screen, SectionHeader, StatusPill } from '@/components/ui';
import { Brand, Fonts, Radius, TabularNumbers } from '@/constants/theme';
import { useAuth } from '@/contexts/auth-context';
import { useI18n } from '@/contexts/locale-context';
import { usePreferences } from '@/contexts/preferences-context';
import { EMPTY_PNL_INPUTS, calculatePnl, currentPnlPeriod, normalizePnlPeriod } from '@/lib/pnl';
import { createPnlReportId, savePnlReport, syncPnlReports } from '@/lib/pnl-repository';
import { totalMonthlyGrossSalary } from '@/lib/hr';
import { loadHrData } from '@/lib/hr-repository';
import type { TranslationKey } from '@/i18n/translations';
import type { PnlInputs, PnlReport, PnlReportDraft } from '@/types/pnl';

type AmountKey = keyof PnlInputs;

const REVENUE_FIELDS: { key: AmountKey; label: TranslationKey }[] = [
  { key: 'revenueFood', label: 'pnl.revenueFood' },
  { key: 'revenueBeverage', label: 'pnl.revenueBeverage' },
  { key: 'revenueOther', label: 'pnl.revenueOther' },
];

const COGS_FIELDS: { key: AmountKey; label: TranslationKey }[] = [
  { key: 'cogsFood', label: 'pnl.cogsFood' },
  { key: 'cogsBeverage', label: 'pnl.cogsBeverage' },
  { key: 'packagingCost', label: 'pnl.packagingCost' },
];

const OPERATING_FIELDS: { key: AmountKey; label: TranslationKey }[] = [
  { key: 'payrollCost', label: 'pnl.payrollCost' },
  { key: 'rentCost', label: 'pnl.rentCost' },
  { key: 'utilitiesCost', label: 'pnl.utilitiesCost' },
  { key: 'deliveryCommissions', label: 'pnl.deliveryCommissions' },
  { key: 'marketingCost', label: 'pnl.marketingCost' },
  { key: 'maintenanceCost', label: 'pnl.maintenanceCost' },
  { key: 'adminSoftwareCost', label: 'pnl.adminSoftwareCost' },
  { key: 'otherOperatingCost', label: 'pnl.otherOperatingCost' },
];

function emptyDraft(period: string): PnlReportDraft {
  return {
    id: createPnlReportId(),
    period,
    notes: '',
    ...EMPTY_PNL_INPUTS,
  };
}

function asDraft(report: PnlReport): PnlReportDraft {
  const { createdAt: _createdAt, updatedAt: _updatedAt, syncState: _syncState, ...draft } = report;
  return draft;
}

function parseAmount(value: string) {
  const parsed = Number(value.replace(',', '.').replace(/[^0-9.]/g, ''));
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

function shiftPeriod(period: string, delta: number) {
  const [year, month] = period.split('-').map(Number);
  const date = new Date(year, month - 1 + delta, 1, 12);
  return currentPnlPeriod(date);
}

function periodLabel(period: string, locale: 'ro' | 'en') {
  const [year, month] = period.split('-').map(Number);
  return new Intl.DateTimeFormat(locale === 'ro' ? 'ro-RO' : 'en-GB', {
    month: 'long',
    year: 'numeric',
  }).format(new Date(year, month - 1, 1, 12));
}

export default function PnlScreen() {
  const auth = useAuth();
  const { t, locale } = useI18n();
  const { format, currency } = usePreferences();
  const userId = auth.user?.id ?? 'demo';
  const [reports, setReports] = useState<PnlReport[]>([]);
  const [period, setPeriod] = useState(currentPnlPeriod);
  const [draft, setDraft] = useState<PnlReportDraft>(() => emptyDraft(currentPnlPeriod()));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [grossPayroll, setGrossPayroll] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([syncPnlReports(userId), loadHrData(userId)]).then(([loaded, hrData]) => {
      if (cancelled) return;
      const payroll = totalMonthlyGrossSalary(hrData.employees);
      setGrossPayroll(payroll);
      setReports(loaded);
      const current = loaded.find((item) => item.period === currentPnlPeriod());
      setDraft({ ...(current ? asDraft(current) : emptyDraft(currentPnlPeriod())), payrollCost: payroll });
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [userId]);

  const result = useMemo(() => calculatePnl(draft), [draft]);
  const statusLabel = t(`pnl.status${result.healthStatus[0].toUpperCase()}${result.healthStatus.slice(1)}` as TranslationKey);
  const statusTone = result.healthStatus === 'incomplete' ? 'neutral' : result.healthStatus;

  const selectPeriod = (nextValue: string) => {
    const next = normalizePnlPeriod(nextValue);
    setPeriod(next);
    const existing = reports.find((item) => item.period === next);
    setDraft({ ...(existing ? asDraft(existing) : emptyDraft(next)), payrollCost: grossPayroll });
  };

  const updateAmount = (key: AmountKey, value: string) => {
    if (key === 'payrollCost') return;
    setDraft((current) => ({ ...current, [key]: parseAmount(value) }));
  };

  const save = async () => {
    setSaving(true);
    try {
      const saved = await savePnlReport(userId, { ...draft, period, payrollCost: grossPayroll });
      setDraft(asDraft(saved));
      setReports((current) => [saved, ...current.filter((item) => item.period !== saved.period)]);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
      Alert.alert(
        t('pnl.savedTitle'),
        saved.syncState === 'synced' ? t('pnl.savedSynced') : t('pnl.savedOffline'),
      );
    } catch {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => undefined);
      Alert.alert(t('pnl.saveFailedTitle'), t('pnl.saveFailedBody'));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Screen scroll={false}><ListSkeleton rows={3} /></Screen>;

  const breakEvenMessage = result.breakEvenGap === null
    ? t('pnl.breakEvenUnavailable')
    : result.breakEvenGap >= 0
      ? t('pnl.breakEvenAhead', { value: format.money(result.breakEvenGap) })
      : t('pnl.breakEvenBehind', { value: format.money(Math.abs(result.breakEvenGap)) });

  return (
    <Screen
      bottomSafeArea
      footer={<AppButton label={t('pnl.save')} icon="checkmark" fullWidth loading={saving} onPress={() => void save()} />}>
      <ToolHeader title={t('pnl.title')} subtitle={t('pnl.subtitle')} />

      <View style={styles.periodSelector}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('common.previous')}
          onPress={() => selectPeriod(shiftPeriod(period, -1))}
          style={({ pressed }) => [styles.periodButton, pressed && styles.pressed]}>
          <Ionicons name="chevron-back" size={20} color={Brand.navy} />
        </Pressable>
        <View style={styles.periodCopy}>
          <Text style={styles.periodCaption}>{t('pnl.period')}</Text>
          <Text style={styles.periodValue}>{periodLabel(period, locale)}</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('common.next')}
          onPress={() => selectPeriod(shiftPeriod(period, 1))}
          style={({ pressed }) => [styles.periodButton, pressed && styles.pressed]}>
          <Ionicons name="chevron-forward" size={20} color={Brand.navy} />
        </Pressable>
      </View>

      <Card tone="navy">
        <View style={styles.snapshotHeader}>
          <View style={styles.snapshotCopy}>
            <Text style={styles.lightEyebrow}>{t('pnl.snapshotEyebrow')}</Text>
            <Text style={styles.lightTitle}>{t('pnl.snapshotTitle')}</Text>
          </View>
          <StatusPill label={statusLabel} status={statusTone} />
        </View>
        <View style={styles.primaryResult}>
          <Text style={styles.primaryLabel}>{t('pnl.netResult')}</Text>
          <Text style={[
            styles.primaryValue,
            result.netResult < 0 ? styles.negative : styles.positive,
          ]} numberOfLines={1} adjustsFontSizeToFit>
            {format.money(result.netResult)}
          </Text>
        </View>
        <View style={styles.metrics}>
          <Result label={t('pnl.totalRevenue')} value={format.money(result.totalRevenue)} />
          <Result label={t('pnl.grossMargin')} value={format.percent(result.grossMarginPercent)} />
          <Result label={t('pnl.primeCost')} value={format.percent(result.primeCostPercent)} />
          <Result label={t('pnl.ebitda')} value={format.money(result.ebitda)} />
          <Result label={t('pnl.netMargin')} value={format.percent(result.netMarginPercent)} />
          <Result label={t('pnl.breakEven')} value={format.money(result.breakEvenRevenue)} />
        </View>
        <View style={styles.breakEvenRow}>
          <Ionicons name="speedometer-outline" size={17} color={Brand.mint} />
          <Text style={styles.breakEvenText}>{breakEvenMessage}</Text>
        </View>
      </Card>

      <Card tone="soft" style={styles.explanationCard}>
        <Ionicons name="information-circle-outline" size={22} color={Brand.navy} />
        <View style={styles.explanationCopy}>
          <Text style={styles.explanationTitle}>{t('pnl.ebitdaHelpTitle')}</Text>
          <Body>{t('pnl.ebitdaHelpBody')}</Body>
        </View>
      </Card>

      <AmountSection
        eyebrow={t('pnl.revenueEyebrow')}
        title={t('pnl.revenueTitle')}
        hint={t('pnl.revenueHint')}
        fields={REVENUE_FIELDS}
        draft={draft}
        currency={currency}
        translate={t}
        onChange={updateAmount}
      />
      <AmountSection
        eyebrow={t('pnl.cogsEyebrow')}
        title={t('pnl.cogsTitle')}
        hint={t('pnl.cogsHint')}
        fields={COGS_FIELDS}
        draft={draft}
        currency={currency}
        translate={t}
        onChange={updateAmount}
      />
      <AmountSection
        eyebrow={t('pnl.operationsEyebrow')}
        title={t('pnl.operationsTitle')}
        fields={OPERATING_FIELDS}
        draft={draft}
        currency={currency}
        translate={t}
        onChange={updateAmount}
      />

      <Card>
        <SectionHeader eyebrow={t('pnl.finalEyebrow')} title={t('pnl.finalTitle')} />
        <Field
          label={`${t('pnl.taxesInterestDepreciation')} (${currency})`}
          value={draft.taxesInterestDepreciation ? String(draft.taxesInterestDepreciation) : ''}
          keyboardType="decimal-pad"
          onChangeText={(value) => updateAmount('taxesInterestDepreciation', value)}
        />
        <Field
          label={t('pnl.notes')}
          placeholder={t('pnl.notesPlaceholder')}
          value={draft.notes}
          multiline
          maxLength={2000}
          onChangeText={(notes) => setDraft((current) => ({ ...current, notes }))}
        />
      </Card>

      <Card tone="soft" style={styles.disclaimerCard}>
        <Ionicons name="information-circle-outline" size={20} color={Brand.navy} />
        <Body>{t('pnl.disclaimer')}</Body>
      </Card>
    </Screen>
  );
}

function AmountSection({
  eyebrow,
  title,
  hint,
  fields,
  draft,
  currency,
  translate,
  onChange,
}: {
  eyebrow: string;
  title: string;
  hint?: string;
  fields: { key: AmountKey; label: TranslationKey }[];
  draft: PnlReportDraft;
  currency: string;
  translate: (key: TranslationKey, variables?: Record<string, string | number>) => string;
  onChange: (key: AmountKey, value: string) => void;
}) {
  return (
    <Card>
      <SectionHeader eyebrow={eyebrow} title={title} />
      {!!hint && <Body>{hint}</Body>}
      <View style={styles.fieldGrid}>
        {fields.map((field) => (
          <Field
            key={field.key}
            style={styles.field}
            label={`${translate(field.label)} (${currency})`}
            value={draft[field.key] ? String(draft[field.key]) : ''}
            keyboardType="decimal-pad"
            editable={field.key !== 'payrollCost'}
            hint={field.key === 'payrollCost' ? translate('pnl.payrollHint') : undefined}
            onChangeText={(value) => onChange(field.key, value)}
          />
        ))}
      </View>
    </Card>
  );
}

function Result({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  periodSelector: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: Brand.line,
    borderRadius: Radius.medium,
    backgroundColor: Brand.white,
    padding: 8,
  },
  periodButton: { width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: Brand.mint },
  periodCopy: { flex: 1, alignItems: 'center' },
  periodCaption: { color: Brand.muted, fontSize: 9, fontFamily: Fonts.bold, textTransform: 'uppercase' },
  periodValue: { color: Brand.navyDeep, fontSize: 17, lineHeight: 22, fontFamily: Fonts.extraBold, textTransform: 'capitalize', ...TabularNumbers },
  snapshotHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  snapshotCopy: { flex: 1 },
  lightEyebrow: { color: Brand.gold, fontSize: 10, fontFamily: Fonts.bold, letterSpacing: 1, textTransform: 'uppercase' },
  lightTitle: { color: Brand.white, fontSize: 21, lineHeight: 27, fontFamily: Fonts.extraBold, marginTop: 3 },
  primaryResult: { paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.16)' },
  primaryLabel: { color: '#C5D7DF', fontSize: 10, fontFamily: Fonts.bold, textTransform: 'uppercase' },
  primaryValue: { fontSize: 40, lineHeight: 48, fontFamily: Fonts.extraBold, letterSpacing: -1, ...TabularNumbers },
  positive: { color: '#79DDB5' },
  negative: { color: '#FFAAAA' },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  metric: { width: '48%', minWidth: 130, flexGrow: 1, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 13, padding: 10 },
  metricLabel: { color: '#C5D7DF', fontSize: 9, lineHeight: 12, fontFamily: Fonts.semiBold, textTransform: 'uppercase' },
  metricValue: { color: Brand.white, fontSize: 17, lineHeight: 22, fontFamily: Fonts.extraBold, marginTop: 4, ...TabularNumbers },
  breakEvenRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  breakEvenText: { flex: 1, color: '#D9EEE9', fontSize: 11, lineHeight: 16, fontFamily: Fonts.medium, ...TabularNumbers },
  fieldGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  field: { width: '48%', minWidth: 145, flexGrow: 1 },
  disclaimerCard: { flexDirection: 'row', alignItems: 'flex-start' },
  explanationCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  explanationCopy: { flex: 1, gap: 3 },
  explanationTitle: { color: Brand.navyDeep, fontSize: 13, lineHeight: 18, fontFamily: Fonts.bold },
  pressed: { opacity: 0.72, transform: [{ scale: 0.98 }] },
});
