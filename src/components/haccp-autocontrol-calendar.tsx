/**
 * MANAGER 24/7™ by PARADIM — proprietary software.
 * Copyright © 2026 PARADIM Operations SRL. All rights reserved.
 * Concept author and product director: Marius Paul Nemeșu.
 * See LICENSE-PROPRIETARY.md.
 */

import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import { HaccpDateInput } from '@/components/haccp-date-input';
import { HaccpTimeInput } from '@/components/haccp-time-input';
import { Select, type SelectOption } from '@/components/inputs';
import { AppButton, Body, Card, Field, LoadingState, SectionHeader, StatusPill } from '@/components/ui';
import { Brand, Fonts, Radius, TabularNumbers } from '@/constants/theme';
import { useI18n } from '@/contexts/locale-context';
import { useHaccpAutocontrol } from '@/hooks/use-haccp-autocontrol';
import {
  buildHaccpAutocontrolDraft,
  createHaccpAutocontrolForm,
  eventsForMonth,
  formFromHaccpAutocontrolEvent,
  monthKey,
  shiftMonthKey,
  type HaccpAutocontrolForm,
} from '@/lib/haccp-autocontrol';
import { parseHaccpAutocontrolImport } from '@/lib/haccp-autocontrol-import';
import { syncAutocontrolNotifications } from '@/lib/haccp-autocontrol-notifications';
import type { HaccpAutocontrolEvent, HaccpAutocontrolType } from '@/types/haccp-autocontrol';

export function HaccpAutocontrolCalendar({ userId }: { userId: string }) {
  const { t, locale } = useI18n();
  const { events, isLoading, isSyncing, syncError, pendingCount, refresh, save, saveMany, remove } = useHaccpAutocontrol(userId);
  const [visibleMonth, setVisibleMonth] = useState(monthKey());
  const [form, setForm] = useState<HaccpAutocontrolForm>(() => createHaccpAutocontrolForm());
  const [formOpen, setFormOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [importing, setImporting] = useState(false);

  const typeOptions: SelectOption<HaccpAutocontrolType>[] = [
    { value: 'food_sample', label: t('haccp.autocontrolFoodSample') },
    { value: 'hygiene_test', label: t('haccp.autocontrolHygieneTest') },
    { value: 'water_test', label: t('haccp.autocontrolWaterTest') },
  ];
  const typeLabel = (type: HaccpAutocontrolType) => (
    typeOptions.find((option) => option.value === type)?.label ?? type
  );
  const visibleEvents = useMemo(() => eventsForMonth(events, visibleMonth), [events, visibleMonth]);
  const monthLabel = useMemo(() => {
    const date = new Date(`${visibleMonth}-01T12:00:00`);
    return date.toLocaleDateString(locale === 'ro' ? 'ro-RO' : 'en-GB', { month: 'long', year: 'numeric' });
  }, [locale, visibleMonth]);

  useEffect(() => {
    void syncAutocontrolNotifications(userId, events, locale).catch(() => undefined);
  }, [events, locale, userId]);

  const setField = <K extends keyof HaccpAutocontrolForm>(key: K, value: HaccpAutocontrolForm[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const resetForm = () => {
    setForm(createHaccpAutocontrolForm());
    setFormOpen(false);
  };

  const syncNotifications = async (
    changed: readonly HaccpAutocontrolEvent[],
    requestPermission = false,
  ) => {
    const changedIds = new Set(changed.map((event) => event.id));
    const merged = [...changed, ...events.filter((event) => !changedIds.has(event.id))];
    const enabled = await syncAutocontrolNotifications(userId, merged, locale, requestPermission);
    if (!enabled && requestPermission) {
      Alert.alert(t('haccp.reminderTitle'), t('haccp.reminderPermission'));
    }
  };

  const saveForm = async () => {
    setBusy(true);
    try {
      const draft = buildHaccpAutocontrolDraft(form, typeLabel(form.controlType));
      const saved = await save(draft);
      await syncNotifications([saved], Boolean(saved.reminderAt));
      setVisibleMonth(monthKey(new Date(saved.scheduledAt)));
      resetForm();
      Alert.alert(t('haccp.autocontrolSavedTitle'), t('haccp.autocontrolSavedBody'));
    } catch (error) {
      const key = error instanceof Error ? error.message : '';
      Alert.alert(
        key === 'reminder-after-schedule'
          ? t('haccp.autocontrolInvalidReminderTitle')
          : t('haccp.autocontrolSaveFailed'),
        key === 'reminder-after-schedule'
          ? t('haccp.autocontrolInvalidReminderBody')
          : t('common.tryAgain'),
      );
    } finally {
      setBusy(false);
    }
  };

  const pickImport = async () => {
    const picked = await DocumentPicker.getDocumentAsync({
      type: [
        'text/csv',
        'text/plain',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      ],
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (picked.canceled || !picked.assets[0]) return;
    const asset = picked.assets[0];
    setImporting(true);
    try {
      const response = await fetch(asset.uri);
      if (!response.ok) throw new Error('import-read-failed');
      const data = asset.name.toLowerCase().endsWith('.csv') || asset.name.toLowerCase().endsWith('.txt')
        ? await response.text()
        : await response.arrayBuffer();
      const drafts = await parseHaccpAutocontrolImport(data, asset.name);
      if (!drafts.length) {
        Alert.alert(t('haccp.autocontrolImportInvalidTitle'), t('haccp.autocontrolImportInvalidBody'));
        return;
      }
      Alert.alert(
        t('haccp.autocontrolImportReadyTitle'),
        t('haccp.autocontrolImportReadyBody', { count: drafts.length }),
        [
          { text: t('common.cancel'), style: 'cancel' },
          {
            text: t('haccp.autocontrolImportConfirm'),
            onPress: () => {
              void (async () => {
                setImporting(true);
                try {
                  const saved = await saveMany(drafts);
                  await syncNotifications(saved, saved.some((event) => Boolean(event.reminderAt)));
                  if (saved[0]) setVisibleMonth(monthKey(new Date(saved[0].scheduledAt)));
                } catch {
                  Alert.alert(t('haccp.autocontrolImportFailed'), t('common.tryAgain'));
                } finally {
                  setImporting(false);
                }
              })();
            },
          },
        ],
      );
    } catch {
      Alert.alert(t('haccp.autocontrolImportFailed'), t('common.tryAgain'));
    } finally {
      setImporting(false);
    }
  };

  const edit = (event: HaccpAutocontrolEvent) => {
    setForm(formFromHaccpAutocontrolEvent(event));
    setFormOpen(true);
  };

  const complete = async (event: HaccpAutocontrolEvent) => {
    setBusy(true);
    try {
      const saved = await save({ ...event, status: 'completed', completedAt: new Date().toISOString(), reminderAt: null });
      await syncNotifications([saved]);
    } catch {
      Alert.alert(t('haccp.autocontrolSaveFailed'), t('common.tryAgain'));
    } finally {
      setBusy(false);
    }
  };

  const confirmDelete = (event: HaccpAutocontrolEvent) => {
    Alert.alert(
      t('haccp.autocontrolDeleteTitle'),
      t('haccp.autocontrolDeleteBody'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: () => {
            void (async () => {
              const deleted = await remove(event);
              if (deleted) {
                await syncAutocontrolNotifications(
                  userId,
                  events.filter((item) => item.id !== event.id),
                  locale,
                ).catch(() => undefined);
              }
            })();
          },
        },
      ],
    );
  };

  return (
    <Card style={styles.calendarCard}>
      <View style={styles.headerRow}>
        <View style={styles.headerIcon}><Ionicons name="calendar-outline" size={22} color={Brand.tealDeep} /></View>
        <View style={styles.flex}>
          <SectionHeader eyebrow={t('haccp.autocontrolEyebrow')} title={t('haccp.autocontrolTitle')} />
          <Body>{t('haccp.autocontrolBody')}</Body>
        </View>
      </View>

      <View style={styles.actions}>
        <AppButton
          label={t('haccp.autocontrolAddManual')}
          icon="add-circle-outline"
          onPress={() => {
            if (formOpen) resetForm();
            else { setForm(createHaccpAutocontrolForm()); setFormOpen(true); }
          }}
        />
        <AppButton
          label={t('haccp.autocontrolImport')}
          icon="document-attach-outline"
          variant="secondary"
          loading={importing}
          onPress={() => void pickImport()}
        />
      </View>

      {formOpen && (
        <View style={styles.editor}>
          <SectionHeader title={form.id ? t('haccp.autocontrolEdit') : t('haccp.autocontrolNew')} />
          <Select
            label={t('haccp.autocontrolType')}
            value={form.controlType}
            options={typeOptions}
            placeholder={t('haccp.autocontrolType')}
            onChange={(value) => { if (value) setField('controlType', value); }}
          />
          <Field
            label={t('haccp.autocontrolEventTitle')}
            placeholder={typeLabel(form.controlType)}
            value={form.title}
            onChangeText={(value) => setField('title', value)}
          />
          <View style={styles.twoColumns}>
            <View style={styles.column}><HaccpDateInput label={t('haccp.autocontrolDate')} locale={locale} value={form.date} onChange={(value) => setField('date', value)} /></View>
            <View style={styles.column}><HaccpTimeInput label={t('haccp.autocontrolTime')} locale={locale} value={form.time} onChange={(value) => setField('time', value)} /></View>
          </View>
          <View style={styles.reminderToggle}>
            <View style={styles.flex}>
              <Text style={styles.toggleTitle}>{t('haccp.autocontrolReminder')}</Text>
              <Text style={styles.toggleHint}>{t('haccp.autocontrolReminderHint')}</Text>
            </View>
            <Switch
              value={form.reminderEnabled}
              onValueChange={(value) => setField('reminderEnabled', value)}
              trackColor={{ true: Brand.teal, false: Brand.line }}
            />
          </View>
          {form.reminderEnabled && (
            <View style={styles.twoColumns}>
              <View style={styles.column}><HaccpDateInput label={t('haccp.autocontrolReminderDate')} locale={locale} value={form.reminderDate} onChange={(value) => setField('reminderDate', value)} /></View>
              <View style={styles.column}><HaccpTimeInput label={t('haccp.autocontrolReminderTime')} locale={locale} value={form.reminderTime} onChange={(value) => setField('reminderTime', value)} /></View>
            </View>
          )}
          <Field label={t('haccp.autocontrolLocation')} value={form.location} onChangeText={(value) => setField('location', value)} />
          <Field label={t('haccp.autocontrolResponsible')} value={form.responsiblePerson} onChangeText={(value) => setField('responsiblePerson', value)} />
          <Field label={t('haccp.autocontrolLaboratory')} value={form.laboratory} onChangeText={(value) => setField('laboratory', value)} />
          <Field label={t('haccp.autocontrolNotes')} value={form.notes} multiline onChangeText={(value) => setField('notes', value)} />
          <View style={styles.actions}>
            <AppButton label={form.id ? t('haccp.autocontrolUpdate') : t('haccp.autocontrolSave')} icon="checkmark-circle-outline" loading={busy} onPress={() => void saveForm()} />
            <AppButton label={t('common.cancel')} variant="ghost" onPress={resetForm} />
          </View>
        </View>
      )}

      <View style={styles.monthNavigator}>
        <Pressable accessibilityRole="button" accessibilityLabel={t('haccp.autocontrolPreviousMonth')} onPress={() => setVisibleMonth((value) => shiftMonthKey(value, -1))} style={styles.monthButton}>
          <Ionicons name="chevron-back" size={20} color={Brand.navy} />
        </Pressable>
        <View style={styles.monthCopy}>
          <Text style={styles.monthTitle}>{monthLabel}</Text>
          <Text style={styles.monthCount}>{t('haccp.autocontrolMonthCount', { count: visibleEvents.length })}</Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel={t('haccp.autocontrolNextMonth')} onPress={() => setVisibleMonth((value) => shiftMonthKey(value, 1))} style={styles.monthButton}>
          <Ionicons name="chevron-forward" size={20} color={Brand.navy} />
        </Pressable>
      </View>

      {(pendingCount > 0 || syncError) && (
        <View style={styles.syncRow}>
          <StatusPill label={t('haccp.pendingSync', { count: pendingCount })} status="watch" />
          <AppButton label={t('haccp.syncNow')} icon="sync-outline" variant="ghost" loading={isSyncing} onPress={() => void refresh()} />
        </View>
      )}

      {isLoading ? <LoadingState /> : visibleEvents.length ? visibleEvents.map((event) => (
        <AutocontrolEventCard
          key={event.id}
          event={event}
          locale={locale}
          typeLabel={typeLabel(event.controlType)}
          statusLabel={event.status === 'completed' ? t('haccp.autocontrolCompleted') : event.status === 'cancelled' ? t('haccp.autocontrolCancelled') : t('haccp.autocontrolScheduled')}
          onEdit={() => edit(event)}
          onComplete={() => void complete(event)}
          onDelete={() => confirmDelete(event)}
        />
      )) : (
        <View style={styles.empty}>
          <Ionicons name="calendar-clear-outline" size={28} color={Brand.muted} />
          <Text style={styles.emptyText}>{t('haccp.autocontrolEmpty')}</Text>
        </View>
      )}
    </Card>
  );
}

function AutocontrolEventCard({
  event,
  locale,
  typeLabel,
  statusLabel,
  onEdit,
  onComplete,
  onDelete,
}: {
  event: HaccpAutocontrolEvent;
  locale: 'ro' | 'en';
  typeLabel: string;
  statusLabel: string;
  onEdit: () => void;
  onComplete: () => void;
  onDelete: () => void;
}) {
  const { t } = useI18n();
  const date = new Date(event.scheduledAt);
  const reminder = event.reminderAt ? new Date(event.reminderAt) : null;
  const status = event.status === 'completed' ? 'healthy' : event.status === 'cancelled' ? 'neutral' : 'watch';
  return (
    <View style={styles.eventCard}>
      <View style={styles.eventTop}>
        <View style={styles.dateBadge}>
          <Text style={styles.dateDay}>{date.toLocaleDateString(locale === 'ro' ? 'ro-RO' : 'en-GB', { day: '2-digit' })}</Text>
          <Text style={styles.dateMonth}>{date.toLocaleDateString(locale === 'ro' ? 'ro-RO' : 'en-GB', { month: 'short' }).replace('.', '')}</Text>
        </View>
        <View style={styles.flex}>
          <Text style={styles.eventType}>{typeLabel}</Text>
          <Text style={styles.eventTitle}>{event.title}</Text>
          <Text style={styles.eventTime}>{date.toLocaleTimeString(locale === 'ro' ? 'ro-RO' : 'en-GB', { hour: '2-digit', minute: '2-digit' })}</Text>
        </View>
        <StatusPill label={statusLabel} status={status} />
      </View>
      {!!event.location && <Text style={styles.eventMeta}>📍 {event.location}</Text>}
      {!!event.responsiblePerson && <Text style={styles.eventMeta}>👤 {event.responsiblePerson}</Text>}
      {!!event.laboratory && <Text style={styles.eventMeta}>🧪 {event.laboratory}</Text>}
      {!!reminder && <Text style={styles.reminderMeta}>{t('haccp.autocontrolReminderAt', { value: reminder.toLocaleString(locale === 'ro' ? 'ro-RO' : 'en-GB', { dateStyle: 'short', timeStyle: 'short' }) })}</Text>}
      {!!event.sourceFileName && <Text style={styles.sourceMeta}>{t('haccp.autocontrolImportedFrom', { file: event.sourceFileName })}</Text>}
      {!!event.notes && <Text style={styles.eventNotes}>{event.notes}</Text>}
      <View style={styles.eventActions}>
        {event.status === 'scheduled' && <AppButton label={t('haccp.autocontrolComplete')} icon="checkmark-outline" variant="secondary" onPress={onComplete} />}
        {event.status === 'scheduled' && <AppButton label={t('haccp.autocontrolEdit')} icon="create-outline" variant="ghost" onPress={onEdit} />}
        <AppButton label={t('common.delete')} icon="trash-outline" variant="danger" onPress={onDelete} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  calendarCard: { gap: 14 },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 11 },
  headerIcon: { width: 42, height: 42, borderRadius: 14, backgroundColor: Brand.tealSoft, alignItems: 'center', justifyContent: 'center' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  editor: { gap: 12, padding: 13, borderRadius: Radius.medium, borderWidth: 1, borderColor: Brand.line, backgroundColor: Brand.cream },
  twoColumns: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  column: { flexGrow: 1, flexBasis: 180 },
  reminderToggle: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 11, borderRadius: Radius.medium, backgroundColor: Brand.white },
  toggleTitle: { color: Brand.navyDeep, fontSize: 13, fontFamily: Fonts.bold },
  toggleHint: { color: Brand.muted, fontSize: 10, lineHeight: 15, fontFamily: Fonts.regular, marginTop: 2 },
  monthNavigator: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 },
  monthButton: { width: 40, height: 40, borderRadius: 13, backgroundColor: Brand.tealSoft, alignItems: 'center', justifyContent: 'center' },
  monthCopy: { flex: 1, alignItems: 'center' },
  monthTitle: { color: Brand.navyDeep, fontSize: 16, fontFamily: Fonts.extraBold, textTransform: 'capitalize' },
  monthCount: { color: Brand.muted, fontSize: 10, fontFamily: Fonts.medium, marginTop: 2, ...TabularNumbers },
  syncRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  empty: { alignItems: 'center', gap: 7, paddingVertical: 18, borderRadius: Radius.medium, backgroundColor: Brand.cream },
  emptyText: { color: Brand.muted, fontSize: 12, fontFamily: Fonts.medium, textAlign: 'center' },
  eventCard: { gap: 7, padding: 12, borderRadius: Radius.medium, borderWidth: 1, borderColor: Brand.line, backgroundColor: Brand.white },
  eventTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  dateBadge: { width: 48, minHeight: 52, borderRadius: 14, backgroundColor: Brand.navy, alignItems: 'center', justifyContent: 'center' },
  dateDay: { color: Brand.white, fontSize: 18, lineHeight: 20, fontFamily: Fonts.extraBold, ...TabularNumbers },
  dateMonth: { color: Brand.gold, fontSize: 9, fontFamily: Fonts.bold, textTransform: 'uppercase' },
  eventType: { color: Brand.goldInk, fontSize: 9, fontFamily: Fonts.extraBold, textTransform: 'uppercase' },
  eventTitle: { color: Brand.navyDeep, fontSize: 14, lineHeight: 18, fontFamily: Fonts.bold, marginTop: 2 },
  eventTime: { color: Brand.navySoft, fontSize: 11, fontFamily: Fonts.semiBold, marginTop: 2, ...TabularNumbers },
  eventMeta: { color: Brand.navySoft, fontSize: 10, fontFamily: Fonts.medium },
  reminderMeta: { color: Brand.tealDeep, fontSize: 10, fontFamily: Fonts.semiBold },
  sourceMeta: { color: Brand.muted, fontSize: 9, fontFamily: Fonts.regular },
  eventNotes: { color: Brand.muted, fontSize: 10, lineHeight: 15, fontFamily: Fonts.regular, paddingTop: 3 },
  eventActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 3 },
});
