/**
 * MANAGER 24/7™ by PARADIM — proprietary software.
 * Copyright © 2026 PARADIM Operations SRL. All rights reserved.
 * Concept author and product director: Marius Paul Nemeșu.
 * See LICENSE-PROPRIETARY.md.
 */

import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

import { HaccpTemperatureInput } from '@/components/haccp-temperature-input';
import { AppButton, Body, Card, Field, SectionHeader, StatusPill } from '@/components/ui';
import { Brand, Fonts, Radius, TabularNumbers } from '@/constants/theme';
import type { Locale } from '@/i18n/translations';
import { listHaccpEquipment, loadHaccpProfileForEntry, readHaccpEquipmentRegistrySnapshot, readHaccpProfileSnapshot } from '@/lib/haccp-routine-repository';
import {
  buildHaccpTodayTasks,
  completeCleaningToday,
  completeHygieneToday,
  recordEquipmentTemperature,
  temperatureIsConform,
} from '@/lib/haccp-today';
import type { HaccpDocument, HaccpSaveResult } from '@/types/haccp';
import type { HaccpEquipment, HaccpRoutineProfile, HaccpTodayTask } from '@/types/haccp-routine';

type HaccpTodayProps = {
  userId: string;
  identity: string;
  locale: Locale;
  documents: readonly HaccpDocument[];
  save: (document: HaccpDocument) => Promise<HaccpSaveResult>;
};

export function HaccpToday(props: HaccpTodayProps) {
  return <HaccpTodaySession key={props.userId} {...props} />;
}

function HaccpTodaySession({ userId, identity, locale, documents, save }: HaccpTodayProps) {
  const router = useRouter();
  const [equipment, setEquipment] = useState<HaccpEquipment[]>([]);
  const [profile, setProfile] = useState<HaccpRoutineProfile | null>(null);
  const [temperature, setTemperature] = useState<Record<string, string>>({});
  const [corrective, setCorrective] = useState<Record<string, string>>({});
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [loadError, setLoadError] = useState(false);
  const mounted = useRef(true);
  const generation = useRef(0);
  const saving = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; generation.current += 1; };
  }, []);
  const reload = useCallback(() => {
    const request = ++generation.current;
    const current = () => mounted.current && request === generation.current;
    setLoadError(false);
    void (async () => {
      try {
        const [cachedEquipment, cachedProfile] = await Promise.all([
          readHaccpEquipmentRegistrySnapshot(userId), readHaccpProfileSnapshot(userId),
        ]);
        if (!current()) return;
        setEquipment(cachedEquipment.filter(item => item.active));
        if (cachedProfile) setProfile(cachedProfile);
        const [nextEquipment, nextProfile] = await Promise.all([
          listHaccpEquipment(userId), loadHaccpProfileForEntry(userId, identity),
        ]);
        if (!current()) return;
        setEquipment(nextEquipment); setProfile(nextProfile);
      } catch { if (current()) setLoadError(true); }
    })();
  }, [identity, userId]);
  useFocusEffect(useCallback(() => {
    reload();
    return () => { generation.current += 1; };
  }, [reload]));

  const tasks = useMemo(
    () => profile ? buildHaccpTodayTasks(documents, equipment, locale, new Date(), profile) : [],
    [documents, equipment, locale, profile],
  );
  const required = tasks.filter((task) => task.required);
  const completed = required.filter((task) => task.status === 'conform').length;

  const openForm = (formCode: string) => {
    router.push({ pathname: '/tools/haccp/[code]', params: { code: formCode } } as never);
  };

  const completeSimple = async (task: HaccpTodayTask) => {
    if (!profile || saving.current || !mounted.current) return;
    const request = generation.current;
    const current = () => mounted.current && request === generation.current;
    saving.current = true;
    setBusyKey(task.key);
    try {
      const document = task.kind === 'hygiene'
        ? completeHygieneToday(documents, profile, identity)
        : completeCleaningToday(documents, profile, identity);
      await save(document);
      if (!current()) return;
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      if (current()) Alert.alert(
        locale === 'ro' ? 'Nu s-a salvat' : 'Could not save',
        error instanceof Error ? error.message : (locale === 'ro' ? 'Încearcă din nou.' : 'Try again.'),
      );
    } finally {
      saving.current = false; if (mounted.current) setBusyKey(null);
    }
  };

  const saveTemperature = async (task: HaccpTodayTask) => {
    if (!profile || !task.equipment || saving.current || !mounted.current) return;
    const raw = temperature[task.key] ?? '';
    const amount = Number(raw.replace(',', '.'));
    if (!raw.trim() || !Number.isFinite(amount)) {
      Alert.alert(locale === 'ro' ? 'Introdu temperatura' : 'Enter temperature');
      return;
    }
    const request = generation.current;
    const current = () => mounted.current && request === generation.current;
    const savedCorrective = corrective[task.key] ?? '';
    saving.current = true; setBusyKey(task.key);
    try {
      const result = recordEquipmentTemperature({
        documents,
        equipment: task.equipment,
        profile,
        identity,
        temperature: amount,
        correctiveAction: savedCorrective,
      });
      await save(result.document);
      if (!current()) return;
      setTemperature((current) => current[task.key] === raw ? { ...current, [task.key]: '' } : current);
      setCorrective((current) => (current[task.key] ?? '') === savedCorrective ? { ...current, [task.key]: '' } : current);
      await Haptics.notificationAsync(
        result.conform ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Warning,
      );
    } catch (error) {
      const message = error instanceof Error && error.message === 'corrective-action-required'
        ? (locale === 'ro' ? 'Temperatura este în afara limitei. Acțiunea corectivă este obligatorie.' : 'Temperature is outside the limit. A corrective action is required.')
        : (locale === 'ro' ? 'Încearcă din nou.' : 'Try again.');
      if (current()) Alert.alert(locale === 'ro' ? 'Citirea nu a fost salvată' : 'Reading not saved', message);
    } finally {
      saving.current = false; if (mounted.current) setBusyKey(null);
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
            <Text style={styles.shiftProgress}>{profile
              ? `${completed}/${required.length} ${locale === 'ro' ? 'sarcini conforme' : 'tasks conform'}`
              : (locale === 'ro' ? 'Se verifică rutina salvată…' : 'Checking saved routine…')}</Text>
          </View>
          <StatusPill
            label={!profile ? (loadError ? (locale === 'ro' ? 'Indisponibil' : 'Unavailable') : (locale === 'ro' ? 'Se încarcă' : 'Loading'))
              : completed === required.length ? (locale === 'ro' ? 'Închisă' : 'Closed') : (locale === 'ro' ? `${required.length - completed} restante` : `${required.length - completed} due`)}
            status={profile && completed === required.length ? 'healthy' : 'watch'}
          />
        </View>
        <Body light>
          {profile ? `${profile.defaultLocationName} · ${profile.responsibleName || identity}` : (locale === 'ro' ? 'Se încarcă rutina salvată…' : 'Loading saved routine…')}
        </Body>
        <AppButton
          label={locale === 'ro' ? 'Locații, echipamente și limite' : 'Locations, equipment and limits'}
          icon="settings-outline"
          variant="secondary"
          onPress={() => router.push('/tools/haccp-settings' as never)}
        />
      </Card>

      {loadError && <Card>
        <Body>{locale === 'ro' ? 'Rutina HACCP nu a putut fi încărcată. Datele salvate au fost păstrate.' : 'HACCP routine could not be loaded. Saved data has been preserved.'}</Body>
        <AppButton label={locale === 'ro' ? 'Reîncearcă încărcarea rutinei' : 'Retry loading routine'} variant="secondary" onPress={reload} />
      </Card>}

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
