/**
 * MANAGER 24/7™ by PARADIM — proprietary software.
 * Copyright © 2026 PARADIM Operations SRL. All rights reserved.
 * Concept author and product director: Marius Paul Nemeșu.
 * See LICENSE-PROPRIETARY.md.
 */

import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

import { HaccpTemperatureInput } from '@/components/haccp-temperature-input';
import { AppButton, Body, Card, Field, SectionHeader, StatusPill } from '@/components/ui';
import { Brand, Fonts, Radius, TabularNumbers } from '@/constants/theme';
import type { Locale } from '@/i18n/translations';
import { defaultHaccpProfile, listHaccpEquipment, loadHaccpProfile } from '@/lib/haccp-routine-repository';
import {
  buildHaccpTodayTasks,
  completeCleaningToday,
  completeHygieneToday,
  recordEquipmentTemperature,
  temperatureIsConform,
} from '@/lib/haccp-today';
import type { HaccpDocument, HaccpSaveResult } from '@/types/haccp';
import type { HaccpEquipment, HaccpRoutineProfile, HaccpTodayTask } from '@/types/haccp-routine';

export function HaccpToday({
  userId,
  identity,
  locale,
  documents,
  save,
}: {
  userId: string;
  identity: string;
  locale: Locale;
  documents: readonly HaccpDocument[];
  save: (document: HaccpDocument) => Promise<HaccpSaveResult>;
}) {
  const router = useRouter();
  const [equipment, setEquipment] = useState<HaccpEquipment[]>([]);
  const [profile, setProfile] = useState<HaccpRoutineProfile>(() => defaultHaccpProfile(identity));
  const [temperature, setTemperature] = useState<Record<string, string>>({});
  const [corrective, setCorrective] = useState<Record<string, string>>({});
  const [busyKey, setBusyKey] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void Promise.all([
      listHaccpEquipment(userId),
      loadHaccpProfile(userId, identity),
    ]).then(([nextEquipment, nextProfile]) => {
      if (!active) return;
      setEquipment(nextEquipment);
      setProfile(nextProfile);
    });
    return () => { active = false; };
  }, [identity, userId]);

  const tasks = useMemo(
    () => buildHaccpTodayTasks(documents, equipment, locale, new Date(), profile),
    [documents, equipment, locale, profile],
  );
  const required = tasks.filter((task) => task.required);
  const completed = required.filter((task) => task.status === 'conform').length;

  const openForm = (formCode: string) => {
    router.push({ pathname: '/tools/haccp/[code]', params: { code: formCode } } as never);
  };

  const completeSimple = async (task: HaccpTodayTask) => {
    setBusyKey(task.key);
    try {
      const document = task.kind === 'hygiene'
        ? completeHygieneToday(documents, profile, identity)
        : completeCleaningToday(documents, profile, identity);
      await save(document);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      Alert.alert(
        locale === 'ro' ? 'Nu s-a salvat' : 'Could not save',
        error instanceof Error ? error.message : (locale === 'ro' ? 'Încearcă din nou.' : 'Try again.'),
      );
    } finally {
      setBusyKey(null);
    }
  };

  const saveTemperature = async (task: HaccpTodayTask) => {
    if (!task.equipment) return;
    const raw = temperature[task.key] ?? '';
    const amount = Number(raw.replace(',', '.'));
    if (!raw.trim() || !Number.isFinite(amount)) {
      Alert.alert(locale === 'ro' ? 'Introdu temperatura' : 'Enter temperature');
      return;
    }
    setBusyKey(task.key);
    try {
      const result = recordEquipmentTemperature({
        documents,
        equipment: task.equipment,
        profile,
        identity,
        temperature: amount,
        correctiveAction: corrective[task.key] ?? '',
      });
      await save(result.document);
      setTemperature((current) => ({ ...current, [task.key]: '' }));
      setCorrective((current) => ({ ...current, [task.key]: '' }));
      await Haptics.notificationAsync(
        result.conform ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Warning,
      );
    } catch (error) {
      const message = error instanceof Error && error.message === 'corrective-action-required'
        ? (locale === 'ro' ? 'Temperatura este în afara limitei. Acțiunea corectivă este obligatorie.' : 'Temperature is outside the limit. A corrective action is required.')
        : (locale === 'ro' ? 'Încearcă din nou.' : 'Try again.');
      Alert.alert(locale === 'ro' ? 'Citirea nu a fost salvată' : 'Reading not saved', message);
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <View style={styles.container}>
      <Card tone="navy" style={styles.shiftCard}>
        <View style={styles.shiftTop}>
          <View style={styles.progressIcon}>
            <Ionicons name="today-outline" size={24} color={Brand.navyDeep} />
          </View>
          <View style={styles.copy}>
            <Text style={styles.shiftTitle}>{locale === 'ro' ? 'Tura de azi' : 'Today’s shift'}</Text>
            <Text style={styles.shiftProgress}>{completed}/{required.length} {locale === 'ro' ? 'sarcini conforme' : 'tasks conform'}</Text>
          </View>
          <StatusPill
            label={completed === required.length ? (locale === 'ro' ? 'Închisă' : 'Closed') : (locale === 'ro' ? `${required.length - completed} restante` : `${required.length - completed} due`)}
            status={completed === required.length ? 'healthy' : 'watch'}
          />
        </View>
        <Body light>
          {profile.defaultLocationName} · {profile.responsibleName || identity}
        </Body>
        <AppButton
          label={locale === 'ro' ? 'Locații, echipamente și limite' : 'Locations, equipment and limits'}
          icon="settings-outline"
          variant="secondary"
          onPress={() => router.push('/tools/haccp-settings' as never)}
        />
      </Card>

      <SectionHeader
        eyebrow={locale === 'ro' ? '06:30 · FLUX DE TURĂ' : '06:30 · SHIFT FLOW'}
        title={locale === 'ro' ? 'Ce trebuie făcut' : 'What needs doing'}
      />

      {tasks.map((task) => (
        <TodayTaskCard
          key={task.key}
          task={task}
          locale={locale}
          value={temperature[task.key] ?? ''}
          correctiveAction={corrective[task.key] ?? ''}
          busy={busyKey === task.key}
          onValueChange={(value) => setTemperature((current) => ({ ...current, [task.key]: value }))}
          onCorrectiveChange={(value) => setCorrective((current) => ({ ...current, [task.key]: value }))}
          onComplete={() => void completeSimple(task)}
          onSaveTemperature={() => void saveTemperature(task)}
          onOpen={() => openForm(task.formCode)}
        />
      ))}
    </View>
  );
}

function TodayTaskCard({
  task,
  locale,
  value,
  correctiveAction,
  busy,
  onValueChange,
  onCorrectiveChange,
  onComplete,
  onSaveTemperature,
  onOpen,
}: {
  task: HaccpTodayTask;
  locale: Locale;
  value: string;
  correctiveAction: string;
  busy: boolean;
  onValueChange: (value: string) => void;
  onCorrectiveChange: (value: string) => void;
  onComplete: () => void;
  onSaveTemperature: () => void;
  onOpen: () => void;
}) {
  const icon = task.kind === 'temperature'
    ? task.equipment?.kind === 'hot' ? 'flame-outline' : 'snow-outline'
    : task.kind === 'hygiene' ? 'people-outline'
      : task.kind === 'cleaning' ? 'sparkles-outline' : 'car-outline';
  const amount = Number(value.replace(',', '.'));
  const currentConform = task.equipment && Number.isFinite(amount)
    ? temperatureIsConform(amount, task.equipment)
    : true;
  const canAddReading = task.kind === 'temperature' && task.completedSteps < task.totalSteps;
  const tone = task.status === 'conform' ? styles.taskConform : task.status === 'nonconform' ? styles.taskNonconform : null;

  return (
    <Card style={[styles.taskCard, tone]}>
      <View style={styles.taskHeader}>
        <View style={[styles.taskIcon, task.status === 'conform' && styles.taskIconDone, task.status === 'nonconform' && styles.taskIconAlert]}>
          <Ionicons name={icon} size={25} color={task.status === 'nonconform' ? Brand.red : Brand.navyDeep} />
        </View>
        <View style={styles.copy}>
          <Text style={styles.taskTitle}>{task.title}</Text>
          <Text style={styles.taskSubtitle}>{task.subtitle}</Text>
        </View>
        <StatusPill
          label={task.status === 'conform' ? 'OK' : task.status === 'nonconform' ? (locale === 'ro' ? 'Neconform' : 'Non-conform') : (task.required ? (locale === 'ro' ? 'Restant' : 'Due') : (locale === 'ro' ? 'Opțional' : 'Optional'))}
          status={task.status === 'conform' ? 'healthy' : task.status === 'nonconform' ? 'critical' : 'watch'}
        />
      </View>

      {canAddReading && task.equipment && (
        <>
          <Text style={styles.nextReading}>
            {locale === 'ro' ? 'Citirea următoare' : 'Next reading'}
            {task.equipment.readingTimes[task.completedSteps] ? ` · ${task.equipment.readingTimes[task.completedSteps]}` : ''}
          </Text>
          <HaccpTemperatureInput
            label={locale === 'ro' ? 'Temperatură măsurată' : 'Measured temperature'}
            value={value}
            onChange={onValueChange}
            criticalMin={task.equipment.criticalMin}
            criticalMax={task.equipment.criticalMax}
            large
          />
          {!currentConform && Number.isFinite(amount) && (
            <Field
              label={locale === 'ro' ? 'Acțiune corectivă obligatorie' : 'Required corrective action'}
              value={correctiveAction}
              multiline
              numberOfLines={3}
              onChangeText={onCorrectiveChange}
            />
          )}
          <AppButton
            label={locale === 'ro' ? 'Salvează citirea · următoarea' : 'Save reading · next'}
            icon="checkmark-circle-outline"
            fullWidth
            loading={busy}
            disabled={!value.trim() || (!currentConform && !correctiveAction.trim())}
            onPress={onSaveTemperature}
          />
        </>
      )}

      {task.kind !== 'temperature' && task.kind !== 'reception' && task.status === 'pending' && (
        <AppButton
          label={locale === 'ro' ? 'Totul conform' : 'Everything conforms'}
          icon="checkmark-done-circle-outline"
          fullWidth
          loading={busy}
          onPress={onComplete}
        />
      )}

      {(task.status !== 'pending' || task.kind === 'reception') && (
        <AppButton
          label={task.kind === 'reception'
            ? (locale === 'ro' ? 'Înregistrează recepția' : 'Record reception')
            : (locale === 'ro' ? 'Deschide fișa' : 'Open record')}
          icon="document-text-outline"
          variant="ghost"
          onPress={onOpen}
        />
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  container: { gap: 12 },
  copy: { flex: 1 },
  shiftCard: { gap: 12 },
  shiftTop: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  progressIcon: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: Brand.gold },
  shiftTitle: { color: Brand.white, fontSize: 20, fontFamily: Fonts.extraBold },
  shiftProgress: { color: '#D9EEE9', fontSize: 12, marginTop: 3, fontFamily: Fonts.bold, ...TabularNumbers },
  taskCard: { gap: 12, borderWidth: 1.5 },
  taskConform: { borderColor: '#B8DDCA', backgroundColor: '#F7FCF9' },
  taskNonconform: { borderColor: '#E8A39C', backgroundColor: '#FFF7F6' },
  taskHeader: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  taskIcon: { width: 52, height: 52, borderRadius: Radius.medium, alignItems: 'center', justifyContent: 'center', backgroundColor: Brand.goldSoft },
  taskIconDone: { backgroundColor: '#DDF3E7' },
  taskIconAlert: { backgroundColor: '#FBE3E0' },
  taskTitle: { color: Brand.navyDeep, fontSize: 17, fontFamily: Fonts.extraBold },
  taskSubtitle: { color: Brand.muted, fontSize: 11, lineHeight: 16, marginTop: 3, fontFamily: Fonts.regular, ...TabularNumbers },
  nextReading: { color: Brand.goldInk, fontSize: 12, fontFamily: Fonts.extraBold, ...TabularNumbers },
});
