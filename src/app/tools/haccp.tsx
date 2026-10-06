/**
 * MANAGER 24/7™ by PARADIM — proprietary software.
 * Copyright © 2026 PARADIM Operations SRL. All rights reserved.
 * Concept author and product director: Marius Paul Nemeșu.
 * See LICENSE-PROPRIETARY.md.
 */

import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { HaccpAutocontrolCalendar } from '@/components/haccp-autocontrol-calendar';
import { HaccpDateInput } from '@/components/haccp-date-input';
import { HaccpFormBrowser } from '@/components/haccp-form-browser';
import { HaccpToday } from '@/components/haccp-today';
import { HaccpTimeInput } from '@/components/haccp-time-input';
import { ToolHeader } from '@/components/tool-header';
import { FolderHub, FolderLink, FolderSection } from '@/components/folder-section';
import { AppButton, Body, Card, Screen, StatusPill } from '@/components/ui';
import {
  HACCP_FORMS,
} from '@/constants/haccp-forms';
import { Brand, Fonts, TabularNumbers } from '@/constants/theme';
import { useAuth } from '@/contexts/auth-context';
import { useI18n } from '@/contexts/locale-context';
import { useHaccpFavorites } from '@/hooks/use-haccp-favorites';
import { useHaccpDocuments } from '@/hooks/use-haccp-documents';
import { useFocusedSyncRetry } from '@/hooks/use-focused-sync-retry';
import { haccpLocationMatches } from '@/lib/haccp-confirmation';
import { autoCompleteHaccpDossier, HACCP_AUTO_COMPLETE_EXCLUDED_CODES } from '@/lib/haccp-auto-complete';
import { exportHaccpControlPackPdf } from '@/lib/haccp-export';
import { getHaccpReminderSettings, setHaccpReminderTime, syncHaccpReminders } from '@/lib/haccp-reminders';
import { listHaccpEquipment, loadHaccpProfile } from '@/lib/haccp-routine-repository';
import { haccpDocumentMatchesMonth } from '@/lib/haccp-sheet';
import { localIsoDate } from '@/lib/local-date-time';
import { workspaceErrorMessage } from '@/lib/offline-workspace';
import type { HaccpRoutineProfile } from '@/types/haccp-routine';


export function HaccpWorkspace({ embedded = false }: { embedded?: boolean }) {
  const router = useRouter();
  const auth = useAuth();
  const { t, locale } = useI18n();
  const userId = auth.user?.id ?? 'demo';
  const { documents, isSyncing, syncError, pendingCount, refresh, save, saveMany } = useHaccpDocuments(userId);
  const [view, setView] = useState<'today' | 'forms' | 'control'>('today');
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const favorites = useHaccpFavorites(userId);
  const [reminderEnabled, setReminderEnabled] = useState(false);
  const [reminderTime, setReminderTime] = useState('20:00');
  const [reminderBusy, setReminderBusy] = useState(false);
  const [controlDate, setControlDate] = useState(localIsoDate());
  const [packBusy, setPackBusy] = useState(false);
  const [autoCompleteBusy, setAutoCompleteBusy] = useState(false);
  const [activeProfile, setActiveProfile] = useState<HaccpRoutineProfile | null>(null);
  useFocusedSyncRetry(refresh);
  useFocusEffect(useCallback(() => {
    let active = true;
    void loadHaccpProfile(userId, auth.user?.email ?? 'Operator').then((profile) => { if (active) setActiveProfile(profile); }).catch(() => undefined);
    return () => { active = false; };
  }, [auth.user?.email, userId]));
  const locationDocuments = useMemo(() => activeProfile
    ? documents.filter((document) => haccpLocationMatches(document, activeProfile)) : [], [activeProfile, documents]);
  const legacyCount = activeProfile?.defaultLocationId ? documents.filter((document) => !document.headerValues._location_id).length : 0;

  useEffect(() => {
    void getHaccpReminderSettings(userId).then((settings) => {
      setReminderEnabled(settings.enabled);
      setReminderTime(settings.time);
    });
  }, [userId]);

  useEffect(() => {
    if (reminderEnabled) void syncHaccpReminders(userId, documents, locale);
  }, [documents, locale, reminderEnabled, userId]);

  const activateReminder = async () => {
    setReminderBusy(true);
    try {
      const enabled = await setHaccpReminderTime(userId, reminderTime);
      if (!enabled) {
        Alert.alert(t('haccp.reminderTitle'), t('haccp.reminderPermission'));
        return;
      }
      setReminderEnabled(true);
      await syncHaccpReminders(userId, documents, locale);
    } finally {
      setReminderBusy(false);
    }
  };

  const openForm = (code: string) => {
    router.push({ pathname: '/tools/haccp/[code]', params: { code } } as never);
  };

  const controlDocuments = useMemo(
    () => locationDocuments.filter((document) => haccpDocumentMatchesMonth(document, controlDate)),
    [controlDate, locationDocuments],
  );
  const controlPeriod = useMemo(() => {
    const date = new Date(`${controlDate.slice(0, 7)}-01T12:00:00`);
    return Number.isNaN(date.getTime())
      ? controlDate.slice(0, 7)
      : date.toLocaleDateString(locale === 'ro' ? 'ro-RO' : 'en-GB', { month: 'long', year: 'numeric' });
  }, [controlDate, locale]);

  const exportControlPack = async () => {
    if (!controlDocuments.length) {
      Alert.alert(
        locale === 'ro' ? 'Niciun document în luna selectată' : 'No documents in the selected month',
        locale === 'ro' ? 'Alege o lună cu înregistrări HACCP.' : 'Choose a month that contains HACCP records.',
      );
      return;
    }
    setPackBusy(true);
    try {
      await exportHaccpControlPackPdf(controlDocuments, locale, controlPeriod);
    } catch (error) {
      Alert.alert(
        locale === 'ro' ? 'Pachetul PDF nu a fost generat' : 'PDF pack could not be generated',
        error instanceof Error ? error.message : (locale === 'ro' ? 'Încearcă din nou.' : 'Try again.'),
      );
    } finally {
      setPackBusy(false);
    }
  };

  const runAutoComplete = async () => {
    const selectedDate = new Date(`${controlDate}T12:00:00`);
    const targetDate = Number.isNaN(selectedDate.getTime()) ? new Date() : selectedDate;
    const identity = auth.user?.email ?? 'Operator';
    setAutoCompleteBusy(true);
    try {
      const [profile, equipment] = await Promise.all([
        loadHaccpProfile(userId, identity),
        listHaccpEquipment(userId),
      ]);
      const result = autoCompleteHaccpDossier({
        documents,
        equipment,
        profile,
        identity,
        locale,
        now: targetDate,
      });
      setActiveProfile(profile);
      const saved = await saveMany(result.documents);
      const nextDocuments = [
        ...saved.map((item) => item.document),
        ...documents.filter((document) => !saved.some((item) => item.document.id === document.id)),
      ];
      if (reminderEnabled) void syncHaccpReminders(userId, nextDocuments, locale);
      const pendingSync = saved.filter((item) => !item.synced).length;
      Alert.alert(
        locale === 'ro' ? 'Schițele HACCP sunt pregătite' : 'HACCP drafts prepared',
        locale === 'ro'
          ? `${result.completedFormCodes.length} formulare eligibile, ${result.documents.length} documente actualizate. Au fost create ${result.pendingDishNames} poziții de temperatură; introdu măsurătorile reale, denumirile și confirmă fiecare verificare.${pendingSync ? `\n\n${pendingSync} documente așteaptă sincronizarea.` : ''}`
          : `${result.completedFormCodes.length} eligible forms and ${result.documents.length} documents were updated. ${result.pendingDishNames} temperature entries were created; enter real readings and dish names, then confirm each check.${pendingSync ? `\n\n${pendingSync} documents are waiting to sync.` : ''}`,
      );
    } catch (error) {
      Alert.alert(
        locale === 'ro' ? 'Completarea automată nu a reușit' : 'Automatic completion failed',
        workspaceErrorMessage(error, locale === 'ro' ? 'Încearcă din nou.' : 'Try again.'),
      );
    } finally {
      setAutoCompleteBusy(false);
    }
  };

  const confirmAutoComplete = () => {
    Alert.alert(
      locale === 'ro' ? 'Completezi automat dosarul?' : 'Complete records automatically?',
      locale === 'ro'
        ? 'Aplicația va precompleta formularele eligibile pentru data selectată. Nu vor fi completate: Răcire rapidă, Vizitatori și Consum materii prime.\n\nLa verificările de temperatură din producție vor fi create câte 3 poziții; denumirile preparatelor se adaugă ulterior. Temperaturile, rezultatele și semnăturile rămân de completat de operator.'
        : 'The app will prefill eligible forms for the selected date. Rapid cooling, Visitors and Raw-material usage will not be completed.\n\nThree entries will be created for production temperature checks; dish names can be added later. Readings, results and signatures must be entered by the operator.',
      [
        { text: locale === 'ro' ? 'Renunță' : 'Cancel', style: 'cancel' },
        { text: locale === 'ro' ? 'Pregătește schițele' : 'Prepare drafts', onPress: () => void runAutoComplete() },
      ],
    );
  };

  const heading = <>
    <ToolHeader title={view === 'today' ? (locale === 'ro' ? 'HACCP · Azi' : 'HACCP · Today') : view === 'forms' ? (locale === 'ro' ? 'Formulare HACCP' : 'HACCP forms') : (locale === 'ro' ? 'Dosar / Control' : 'Records / Inspection')}
      subtitle={locale === 'ro' ? 'Verificări, favorite și documente în ordine.' : 'Checks, favorites and organised records.'} showBack={!embedded} />
    <View style={styles.viewSwitch}>
      {(['today', 'forms', 'control'] as const).map((value) => <Pressable key={value} accessibilityRole="tab" accessibilityState={{ selected: view === value }}
        onPress={() => { if (value === 'forms') setFavoritesOnly(false); setView(value); }}
        style={({ pressed }) => [styles.viewButton, view === value && styles.viewButtonActive, pressed && styles.pressed]}>
        <Text style={[styles.viewButtonText, view === value && styles.viewButtonTextActive]}>{value === 'today' ? (locale === 'ro' ? 'Azi' : 'Today') : value === 'forms' ? (locale === 'ro' ? 'Formulare' : 'Forms') : (locale === 'ro' ? 'Dosar' : 'Records')}</Text>
      </Pressable>)}
    </View>
  </>;

  if (view === 'control') return <FolderHub layout="grid" header={heading} notice={
    <FolderLink title={locale === 'ro' ? 'Control Mode · DSVSA / DSP / ITM' : 'Control Mode · inspections'} summary={locale === 'ro' ? 'Scor de pregătire și neconformități de rezolvat' : 'Readiness score and issues to resolve'} icon="shield-checkmark-outline" onPress={() => router.push('/tools/control-mode' as never)} />
  }>
    <FolderSection id="records" icon="document-text-outline" photo="exports" title={locale === 'ro' ? 'Dosar și export PDF' : 'Records and PDF export'} summary={locale === 'ro' ? 'Arhivă, sincronizare și pachet pentru control' : 'Archive, sync and inspection pack'}>
      <Card tone="soft" style={styles.summaryCard}>
        <View style={styles.summaryTop}>
          <View style={styles.summaryIcon}><Ionicons name="shield-checkmark" size={20} color={Brand.tealDeep} /></View>
          <View style={styles.flex}>
            <Text style={styles.summaryValue}>{documents.length}</Text>
            <Text style={styles.summaryLabel}>{t('haccp.savedDocuments')}</Text>
          </View>
          <StatusPill
            label={pendingCount ? t('haccp.pendingSync', { count: pendingCount }) : t('haccp.synced')}
            status={pendingCount || syncError ? 'watch' : 'healthy'}
          />
        </View>
        <Body>{t('haccp.offlineReady')}</Body>
        {(pendingCount > 0 || syncError) && (
          <AppButton
            label={isSyncing ? t('haccp.syncing') : t('haccp.syncNow')}
            icon="sync-outline"
            variant="secondary"
            disabled={isSyncing}
            onPress={() => void refresh()}
          />
        )}
      </Card>

      {legacyCount > 0 && <FolderLink title={locale === 'ro' ? 'Arhivă HACCP de confirmat' : 'HACCP archive to confirm'} icon="archive-outline" accent="amber"
        summary={locale === 'ro' ? `${legacyCount} documente vechi fără locație confirmată` : `${legacyCount} older documents without a confirmed location`}
        onPress={() => router.push('/tools/haccp/legacy' as never)} />}
      <Card tone="gold" style={styles.controlPackCard}>
        <View style={styles.controlPackTop}>
          <View style={styles.controlPackIcon}><Ionicons name="file-tray-full-outline" size={23} color={Brand.navy} /></View>
          <View style={styles.flex}>
            <Text style={styles.controlPackTitle}>{locale === 'ro' ? 'Pachet PDF pentru control' : 'Inspection PDF pack'}</Text>
            <Text style={styles.controlPackMeta}>
              {controlDocuments.length} {locale === 'ro' ? 'documente în perioada selectată' : 'documents in selected period'}
            </Text>
          </View>
        </View>
        <HaccpDateInput
          label={locale === 'ro' ? 'Alege o zi din luna controlată' : 'Choose a day in the inspection month'}
          locale={locale}
          value={controlDate}
          onChange={setControlDate}
        />
        <AppButton
          label={locale === 'ro' ? `Exportă ${controlPeriod}` : `Export ${controlPeriod}`}
          icon="download-outline"
          fullWidth
          loading={packBusy}
          disabled={!controlDocuments.length}
          onPress={() => void exportControlPack()}
        />
      </Card>

    </FolderSection>
    <FolderSection id="compliance-documents" icon="folder-open-outline" photo="exports" title={locale === 'ro' ? 'Documente și expirări' : 'Documents and expiry'} summary={locale === 'ro' ? 'Autorizații, medicina muncii, instruiri și termene' : 'Authorisations, occupational health, training and deadlines'}>
      <FolderLink title={locale === 'ro' ? 'Deschide centrul de documente' : 'Open document centre'} icon="calendar-outline" onPress={() => router.push('/tools/compliance-documents' as never)} />
    </FolderSection>
    <FolderSection id="preparation" icon="thermometer-outline" photo="haccp" title={locale === 'ro' ? 'Pregătire și remindere' : 'Preparation and reminders'} summary={locale === 'ro' ? 'Schițe, dată și ora notificărilor' : 'Drafts, date and reminder time'}>
      <Card tone="navy" style={styles.autoCompleteCard}>
        <View style={styles.autoCompleteTop}>
          <View style={styles.autoCompleteIcon}><Ionicons name="sparkles" size={23} color={Brand.gold} /></View>
          <View style={styles.flex}>
            <Text style={styles.autoCompleteTitle}>{locale === 'ro' ? 'Pregătire automată dosar' : 'Automatic draft preparation'}</Text>
            <Text style={styles.autoCompleteMeta}>
              {locale === 'ro'
                ? `${HACCP_FORMS.length - HACCP_AUTO_COMPLETE_EXCLUDED_CODES.length} din ${HACCP_FORMS.length} formulare · 3 poziții/preparat la temperaturi`
                : `${HACCP_FORMS.length - HACCP_AUTO_COMPLETE_EXCLUDED_CODES.length} of ${HACCP_FORMS.length} forms · 3 dish entries for temperature checks`}
            </Text>
          </View>
        </View>
        <Text style={styles.autoCompleteBody}>
          {locale === 'ro'
            ? 'Exceptate: Răcire rapidă, Vizitatori și Consum materii prime. Valorile existente nu sunt suprascrise.'
            : 'Excluded: Rapid cooling, Visitors and Raw-material usage. Existing values are preserved.'}
        </Text>
        <HaccpDateInput
          label={locale === 'ro' ? 'Data completării' : 'Completion date'}
          locale={locale}
          value={controlDate}
          onChange={setControlDate}
        />
        <AppButton
          label={locale === 'ro' ? 'Pregătește schițele' : 'Prepare drafts'}
          icon="checkmark-done-circle-outline"
          fullWidth
          loading={autoCompleteBusy}
          onPress={confirmAutoComplete}
        />
      </Card>

      {Platform.OS !== 'web' && (
        <Card style={styles.reminderCard}>
          <View style={styles.reminderCopy}>
            <Ionicons name="notifications-outline" size={20} color={Brand.goldInk} />
            <View style={styles.flex}>
              <Text style={styles.reminderTitle}>{t('haccp.reminderTitle')}</Text>
              <Text style={styles.reminderBody}>{reminderEnabled ? t('haccp.reminderEnabledAt', { time: reminderTime }) : t('haccp.reminderBody')}</Text>
            </View>
          </View>
          <HaccpTimeInput
            label={t('haccp.reminderTime')}
            locale={locale}
            value={reminderTime}
            onChange={setReminderTime}
          />
          <AppButton
            label={reminderEnabled ? t('haccp.reminderSaveTime') : t('haccp.reminderEnable')}
            variant="secondary"
            loading={reminderBusy}
            onPress={() => void activateReminder()}
          />
        </Card>
      )}

      <AppButton label={locale === 'ro' ? 'Locație și echipamente' : 'Location and equipment'} variant="secondary" onPress={() => router.push('/tools/haccp-settings')} />
    </FolderSection>
    <FolderSection id="calendar" icon="calendar-outline" photo="planning" title={locale === 'ro' ? 'Calendar autocontrol' : 'Self-check calendar'} summary={locale === 'ro' ? 'Probe, analize și termene' : 'Samples, tests and deadlines'}>
      <HaccpAutocontrolCalendar userId={userId} />
    </FolderSection>
    <FolderSection id="waste" icon="leaf-outline" photo="ingredients" title={locale === 'ro' ? 'Risipă și redistribuire' : 'Waste and redistribution'} summary={locale === 'ro' ? 'Plan, registru și documente' : 'Plan, register and documents'}>
      <FolderLink title={locale === 'ro' ? 'Deschide registrul' : 'Open register'} icon="leaf-outline" photo="suppliers" onPress={() => router.push('/tools/waste-compliance')} />
    </FolderSection>
  </FolderHub>;

  return <Screen>
    {heading}
    {view === 'today' ? <>
      <FolderLink title={locale === 'ro' ? `Formularele mele favorite (${favorites.codes.length})` : `My favorite forms (${favorites.codes.length})`}
        summary={locale === 'ro' ? 'Alege și deschide rapid formularele pe care le folosești.' : 'Choose and quickly open the forms you use.'}
        icon="thermometer-outline" photo="haccp" onPress={() => { setFavoritesOnly(true); setView('forms'); }} />
      <HaccpToday userId={userId} identity={auth.user?.email ?? 'Operator'} locale={locale} documents={documents} save={save} />
    </> : <HaccpFormBrowser key={favoritesOnly ? 'favorites' : 'all'} locale={locale} documents={locationDocuments}
      favorites={favorites.codes} ready={favorites.ready} initialFavorites={favoritesOnly} toggleFavorite={favorites.toggle} openForm={openForm} />}
    {favorites.error && <Body>{locale === 'ro' ? 'Favoritele nu au putut fi citite. Redeschide pagina pentru a reîncerca.' : 'Favorites could not be read. Reopen this page to retry.'}</Body>}
    <Body>{t('haccp.disclaimer')}</Body>
  </Screen>;
}

export default function HaccpScreen() {
  return <HaccpWorkspace />;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  viewSwitch: { flexDirection: 'row', gap: 8, backgroundColor: Brand.mint, borderRadius: 16, padding: 5 },
  viewButton: { flex: 1, minHeight: 48, borderRadius: 12, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  viewButtonActive: { backgroundColor: Brand.navy },
  viewButtonText: { color: Brand.navy, fontSize: 12, fontFamily: Fonts.extraBold },
  viewButtonTextActive: { color: Brand.white },
  wasteCard: { minHeight: 86, flexDirection: 'row', alignItems: 'center', gap: 11, borderRadius: 18, backgroundColor: Brand.white, paddingHorizontal: 14, paddingVertical: 13 },
  wasteIcon: { width: 44, height: 44, borderRadius: 14, backgroundColor: Brand.mint, alignItems: 'center', justifyContent: 'center' },
  wasteEyebrow: { color: Brand.tealDeep, fontSize: 9, fontFamily: Fonts.extraBold, letterSpacing: 0.7 },
  wasteTitle: { color: Brand.navyDeep, fontSize: 15, fontFamily: Fonts.extraBold, marginTop: 2 },
  wasteMeta: { color: Brand.muted, fontSize: 10, lineHeight: 14, fontFamily: Fonts.regular, marginTop: 3 },
  summaryCard: { gap: 8 },
  summaryTop: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  summaryIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: Brand.mint, alignItems: 'center', justifyContent: 'center' },
  summaryValue: { color: Brand.navyDeep, fontSize: 24, lineHeight: 26, fontFamily: Fonts.extraBold, ...TabularNumbers },
  summaryLabel: { color: Brand.muted, fontSize: 11, marginTop: 2, fontFamily: Fonts.regular },
  autoCompleteCard: { gap: 11 },
  autoCompleteTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  autoCompleteIcon: { width: 44, height: 44, borderRadius: 14, backgroundColor: Brand.navySoft, alignItems: 'center', justifyContent: 'center' },
  autoCompleteTitle: { color: Brand.white, fontSize: 15, fontFamily: Fonts.extraBold },
  autoCompleteMeta: { color: Brand.gold, fontSize: 10, marginTop: 3, fontFamily: Fonts.bold, ...TabularNumbers },
  autoCompleteBody: { color: Brand.white, opacity: 0.82, fontSize: 11, lineHeight: 16, fontFamily: Fonts.regular },
  reminderCard: { gap: 10 },
  reminderCopy: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  reminderTitle: { color: Brand.navyDeep, fontSize: 13, fontFamily: Fonts.bold },
  reminderBody: { color: Brand.muted, fontSize: 11, lineHeight: 16, marginTop: 2, fontFamily: Fonts.regular },
  controlPackCard: { gap: 11 },
  controlPackTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  controlPackIcon: { width: 44, height: 44, borderRadius: 14, backgroundColor: Brand.goldSoft, alignItems: 'center', justifyContent: 'center' },
  controlPackTitle: { color: Brand.navyDeep, fontSize: 14, fontFamily: Fonts.extraBold },
  controlPackMeta: { color: Brand.muted, fontSize: 10, marginTop: 3, fontFamily: Fonts.regular, ...TabularNumbers },
  category: { gap: 8 },
  formCard: { flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: 1, borderBottomColor: Brand.line, backgroundColor: Brand.white, paddingHorizontal: 4, paddingVertical: 11 },
  formIcon: { width: 30, height: 30, borderRadius: 10, backgroundColor: Brand.mint, alignItems: 'center', justifyContent: 'center' },
  code: { color: Brand.goldInk, fontSize: 9, fontFamily: Fonts.extraBold, letterSpacing: 0.7 },
  formTitle: { color: Brand.navyDeep, fontSize: 14, fontFamily: Fonts.bold, marginTop: 2 },
  formMeta: { color: Brand.muted, fontSize: 10, marginTop: 3, fontFamily: Fonts.regular },
  pressed: { opacity: 0.72, transform: [{ scale: 0.995 }] },
});
