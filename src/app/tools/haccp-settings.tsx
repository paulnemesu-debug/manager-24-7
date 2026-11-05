/**
 * MANAGER 24/7™ by PARADIM — proprietary software.
 * Copyright © 2026 PARADIM Operations SRL. All rights reserved.
 * Concept author and product director: Marius Paul Nemeșu.
 * See LICENSE-PROPRIETARY.md.
 */

import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

import { HaccpTimeInput } from '@/components/haccp-time-input';
import { ChoiceRow, Select } from '@/components/inputs';
import { ToolHeader } from '@/components/tool-header';
import { AppButton, Body, Card, Field, IconButton, Screen, SectionHeader, StatusPill } from '@/components/ui';
import { Brand, Fonts, TabularNumbers } from '@/constants/theme';
import { useAuth } from '@/contexts/auth-context';
import { useI18n } from '@/contexts/locale-context';
import {
  deactivateHaccpEquipment,
  defaultHaccpProfile,
  listHaccpEquipment,
  loadHaccpProfileForEntry,
  readHaccpEquipmentRegistrySnapshot,
  readHaccpProfileSnapshot,
  saveHaccpEquipment,
  saveHaccpProfile,
} from '@/lib/haccp-routine-repository';
import { listLocations, type BusinessLocation } from '@/lib/locations-repository';
import { parseHaccpNumber } from '@/lib/haccp-input-validation';
import type { HaccpEquipment, HaccpEquipmentDraft, HaccpEquipmentKind } from '@/types/haccp-routine';

const emptyEquipment = (locationId: string | null, sortOrder: number): HaccpEquipmentDraft => ({
  locationId,
  name: '',
  kind: 'cold',
  criticalMin: 0,
  criticalMax: 4,
  requiredReadings: 3,
  readingTimes: ['06:00', '12:00', '18:00'],
  active: true,
  sortOrder,
});

export default function HaccpSettingsScreen() {
  const auth = useAuth();
  const userId = auth.user?.id ?? 'demo';
  const identity = auth.user?.email ?? 'Operator';
  return <HaccpSettingsSession key={userId} userId={userId} identity={identity} />;
}

function HaccpSettingsSession({ userId, identity }: { userId: string; identity: string }) {
  const router = useRouter();
  const { locale } = useI18n();
  const [locations, setLocations] = useState<BusinessLocation[]>([]);
  const [equipment, setEquipment] = useState<HaccpEquipment[]>([]);
  const [profile, setProfile] = useState(() => defaultHaccpProfile(identity));
  const [draft, setDraft] = useState<HaccpEquipmentDraft>(() => emptyEquipment(null, 1));
  const [minimum, setMinimum] = useState('0');
  const [maximum, setMaximum] = useState('4');
  const [busy, setBusy] = useState(false);
  const [profileReady, setProfileReady] = useState(false);
  const [equipmentReady, setEquipmentReady] = useState(false);
  const [loadErrors, setLoadErrors] = useState<Record<string, boolean>>({});
  const mounted = useRef(true);
  const loadingGeneration = useRef(0);
  const profileRevision = useRef(0);
  const equipmentRevision = useRef(0);
  const draftRevision = useRef(0);
  const profileDirty = useRef(false);
  const draftDirty = useRef(false);
  const saving = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; loadingGeneration.current += 1; };
  }, []);

  const reload = useCallback(() => {
    const generation = ++loadingGeneration.current;
    const profileVersion = profileRevision.current, equipmentVersion = equipmentRevision.current;
    const current = () => mounted.current && generation === loadingGeneration.current;
    setLoadErrors({});
    const failed = (key: string) => { if (current()) setLoadErrors(previous => ({ ...previous, [key]: true })); };
    const applyProfile = (next: typeof profile) => {
      if (!current() || profileRevision.current !== profileVersion || profileDirty.current) return;
      setProfile(next); setProfileReady(true);
      if (!draftDirty.current) setDraft(previous => ({ ...previous, locationId: next.defaultLocationId }));
    };
    const applyEquipment = (next: HaccpEquipment[]) => {
      if (!current() || equipmentRevision.current !== equipmentVersion) return;
      const active = next.filter(item => item.active);
      setEquipment(active); setEquipmentReady(true);
      if (!draftDirty.current) setDraft(previous => ({ ...previous, sortOrder: active.length + 1 }));
    };
    void (async () => {
      try {
        const cached = await readHaccpProfileSnapshot(userId);
        if (!current()) return;
        if (cached) applyProfile(cached);
        applyProfile(await loadHaccpProfileForEntry(userId, identity));
      } catch { failed('profile'); }
    })();
    void (async () => {
      try {
        applyEquipment(await readHaccpEquipmentRegistrySnapshot(userId));
        if (current()) applyEquipment(await listHaccpEquipment(userId));
      } catch { failed('equipment'); }
    })();
    void listLocations(userId).then(next => { if (current()) setLocations(next); }).catch(() => failed('locations'));
  }, [identity, userId]);

  useFocusEffect(useCallback(() => {
    reload();
    return () => { loadingGeneration.current += 1; };
  }, [reload]));

  const changeProfile = (update: (current: typeof profile) => typeof profile) => {
    if (!profileReady || saving.current) return;
    profileDirty.current = true; profileRevision.current += 1; setProfile(update);
  };
  const changeDraft = (update: (current: HaccpEquipmentDraft) => HaccpEquipmentDraft) => {
    if (!profileReady || !equipmentReady || saving.current) return;
    draftDirty.current = true; draftRevision.current += 1; setDraft(update);
  };

  const chooseLocation = (locationId: string | null) => {
    const location = locations.find((item) => item.id === locationId);
    changeProfile((current) => ({
      ...current,
      defaultLocationId: location?.id ?? null,
      defaultLocationName: location?.name ?? current.defaultLocationName,
    }));
    changeDraft((current) => ({ ...current, locationId: location?.id ?? null }));
  };

  const persistProfile = async () => {
    if (!profileReady || saving.current || !mounted.current) return;
    const generation = loadingGeneration.current, version = ++profileRevision.current;
    saving.current = true; setBusy(true);
    try {
      const saved = await saveHaccpProfile(userId, profile);
      if (!mounted.current || version !== profileRevision.current) return;
      profileDirty.current = false;
      if (generation !== loadingGeneration.current) return;
      setProfile(saved);
      Alert.alert(locale === 'ro' ? 'Setări salvate' : 'Settings saved');
    } catch (error) {
      if (mounted.current && generation === loadingGeneration.current) Alert.alert(locale === 'ro' ? 'Nu s-au salvat' : 'Could not save', error instanceof Error ? error.message : '');
    } finally { saving.current = false; if (mounted.current) setBusy(false); }
  };

  const changeKind = (kind: HaccpEquipmentKind) => {
    if (!profileReady || !equipmentReady || saving.current) return;
    const defaults = kind === 'frozen'
      ? { criticalMin: -24, criticalMax: -18, requiredReadings: 3 }
      : kind === 'hot'
        ? { criticalMin: 63, criticalMax: null, requiredReadings: 1 }
        : { criticalMin: 0, criticalMax: 4, requiredReadings: 3 };
    changeDraft((current) => ({ ...current, kind, ...defaults }));
    setMinimum(defaults.criticalMin === null ? '' : String(defaults.criticalMin));
    setMaximum(defaults.criticalMax === null ? '' : String(defaults.criticalMax));
  };

  const editEquipment = (item: HaccpEquipment) => {
    if (!profileReady || !equipmentReady || saving.current) return;
    changeDraft(() => ({ ...item }));
    setMinimum(item.criticalMin === null ? '' : String(item.criticalMin));
    setMaximum(item.criticalMax === null ? '' : String(item.criticalMax));
  };

  const resetEquipment = (count: number) => {
    draftDirty.current = false; draftRevision.current += 1;
    setDraft(emptyEquipment(profile.defaultLocationId, count + 1));
    setMinimum('0');
    setMaximum('4');
  };

  const persistEquipment = async () => {
    if (!profileReady || !equipmentReady || saving.current || !mounted.current || !draft.name.trim()) return;
    const criticalMin = parseHaccpNumber(minimum);
    const criticalMax = parseHaccpNumber(maximum);
    if ((minimum.trim() && criticalMin === null) || (maximum.trim() && criticalMax === null)) {
      Alert.alert(locale === 'ro' ? 'Limită invalidă' : 'Invalid limit', locale === 'ro'
        ? 'Introdu limite numerice valide sau lasă câmpul gol dacă nu există limită.'
        : 'Enter valid numeric limits, or leave the field empty when no limit applies.');
      return;
    }
    if (criticalMin !== null && criticalMax !== null && criticalMax < criticalMin) {
      Alert.alert(locale === 'ro' ? 'Limită invalidă' : 'Invalid limit');
      return;
    }
    const generation = loadingGeneration.current, version = ++equipmentRevision.current, draftVersion = draftRevision.current;
    let persisted = false;
    saving.current = true; setBusy(true);
    try {
      const saved = await saveHaccpEquipment(userId, { ...draft, criticalMin, criticalMax });
      persisted = true;
      if (!mounted.current || generation !== loadingGeneration.current || version !== equipmentRevision.current) return;
      // Keep a confirmed ID even if the local readback fails, so a retry cannot
      // create a second item. The preceding locked load may have discovered rows.
      if (draftVersion === draftRevision.current) setDraft(previous => ({ ...previous, id: saved.id }));
      const next = (await readHaccpEquipmentRegistrySnapshot(userId)).filter(item => item.active);
      if (!mounted.current || generation !== loadingGeneration.current || version !== equipmentRevision.current) return;
      setEquipment(next);
      if (draftVersion === draftRevision.current) resetEquipment(next.length);
    } catch (error) {
      if (mounted.current && generation === loadingGeneration.current) {
        if (persisted) setLoadErrors(previous => ({ ...previous, equipment: true }));
        Alert.alert(persisted
          ? (locale === 'ro' ? 'Echipamentul a fost salvat; lista nu a putut fi reîncărcată' : 'Equipment saved; the list could not be reloaded')
          : (locale === 'ro' ? 'Echipamentul nu a fost salvat' : 'Equipment not saved'), error instanceof Error ? error.message : '');
      }
    } finally { saving.current = false; if (mounted.current) setBusy(false); }
  };

  const removeEquipment = async (item: HaccpEquipment) => {
    if (!profileReady || !equipmentReady || saving.current || !mounted.current) return;
    const generation = loadingGeneration.current, version = ++equipmentRevision.current;
    saving.current = true; setBusy(true);
    try {
      await deactivateHaccpEquipment(userId, item);
      if (!mounted.current || generation !== loadingGeneration.current || version !== equipmentRevision.current) return;
      setEquipment((current) => current.filter((entry) => entry.id !== item.id));
    } catch (error) {
      if (mounted.current && generation === loadingGeneration.current) Alert.alert(locale === 'ro' ? 'Echipamentul nu a fost șters' : 'Equipment not deleted', error instanceof Error ? error.message : '');
    } finally { saving.current = false; if (mounted.current) setBusy(false); }
  };

  return (
    <Screen>
      <ToolHeader
        title={locale === 'ro' ? 'Configurare HACCP' : 'HACCP setup'}
        subtitle={locale === 'ro' ? 'Nomenclator, responsabil și limite critice' : 'Register, responsible person and critical limits'}
      />

      {Object.values(loadErrors).some(Boolean) && <Card>
        <Body>{locale === 'ro' ? 'Setările HACCP nu au putut fi încărcate. Datele salvate au fost păstrate.' : 'HACCP settings could not be loaded. Saved data has been preserved.'}</Body>
        <AppButton label={locale === 'ro' ? 'Reîncearcă încărcarea setărilor' : 'Retry loading settings'} variant="secondary" onPress={reload} />
      </Card>}
      {!profileReady && !Object.values(loadErrors).some(Boolean) && <Body>{locale === 'ro' ? 'Se încarcă setările salvate…' : 'Loading saved settings…'}</Body>}

      <Card>
        <SectionHeader eyebrow={locale === 'ro' ? 'ANTET AUTOMAT' : 'AUTOMATIC HEADER'} title={locale === 'ro' ? 'Locație și responsabil' : 'Location and responsible person'} />
        {!!locations.length && (
          <Select
            label={locale === 'ro' ? 'Locație implicită' : 'Default location'}
            placeholder={locale === 'ro' ? 'Alege locația' : 'Choose location'}
            value={profile.defaultLocationId}
            options={locations.map((item) => ({ value: item.id, label: item.name, description: item.address }))}
            onChange={chooseLocation}
          />
        )}
        <Field
          label={locale === 'ro' ? 'Denumire tipărită în fișe' : 'Name printed on records'}
          value={profileReady ? profile.defaultLocationName : ''}
          editable={profileReady && !busy}
          onChangeText={(value) => changeProfile((current) => ({ ...current, defaultLocationName: value }))}
        />
        <Field
          label={locale === 'ro' ? 'Responsabil implicit' : 'Default responsible person'}
          value={profileReady ? profile.responsibleName : ''}
          editable={profileReady && !busy}
          onChangeText={(value) => changeProfile((current) => ({ ...current, responsibleName: value }))}
        />
        <HaccpTimeInput
          label={locale === 'ro' ? 'Ora deschiderii turei' : 'Shift opening time'}
          locale={locale}
          value={profile.shiftStartTime}
          onChange={(value) => changeProfile((current) => ({ ...current, shiftStartTime: value }))}
        />
        <AppButton label={locale === 'ro' ? 'Salvează antetul' : 'Save header'} icon="save-outline" disabled={!profileReady} loading={busy} onPress={() => void persistProfile()} />
      </Card>

      <Card tone="soft">
        <SectionHeader eyebrow={locale === 'ro' ? 'LOCAȚIE' : 'LOCATION'} title={locale === 'ro' ? 'Administrare centralizată' : 'Centralised management'} />
        <Body>{locale === 'ro'
          ? 'Locația se creează și se editează din Cont, apoi este folosită automat în inventar, HACCP și rapoarte.'
          : 'Create and edit the location in Account, then reuse it automatically in inventory, HACCP and reports.'}</Body>
        <AppButton
          label={locale === 'ro' ? 'Gestionează locația în Cont' : 'Manage location in Account'}
          icon="business-outline"
          variant="secondary"
          onPress={() => router.push('/account')}
        />
      </Card>

      <Card>
        <SectionHeader eyebrow={locale === 'ro' ? 'NOMENCLATOR' : 'REGISTER'} title={locale === 'ro' ? 'Echipamente monitorizate' : 'Monitored equipment'} />
        {equipment.map((item) => (
          <View key={item.id} style={styles.equipmentRow}>
            <View style={styles.equipmentIcon}><Ionicons name={item.kind === 'hot' ? 'flame-outline' : 'snow-outline'} size={20} color={Brand.navy} /></View>
            <View style={styles.copy}>
              <Text style={styles.equipmentName}>{item.name}</Text>
              <Text style={styles.equipmentMeta}>
                {item.criticalMin ?? '—'}…{item.criticalMax ?? '—'} °C · {item.requiredReadings} {locale === 'ro' ? 'citiri/zi' : 'readings/day'}
              </Text>
            </View>
            <StatusPill label={item.syncState === 'synced' ? 'Sync' : 'Local'} status={item.syncState === 'synced' ? 'healthy' : 'watch'} />
            <IconButton icon="create-outline" label={locale === 'ro' ? 'Editează' : 'Edit'} onPress={() => editEquipment(item)} />
            <IconButton icon="trash-outline" label={locale === 'ro' ? 'Șterge' : 'Delete'} danger onPress={() => void removeEquipment(item)} />
          </View>
        ))}
      </Card>

      <Card tone="gold">
        <SectionHeader eyebrow={draft.id ? (locale === 'ro' ? 'EDITARE' : 'EDITING') : (locale === 'ro' ? 'ECHIPAMENT NOU' : 'NEW EQUIPMENT')} title={draft.id ? draft.name : (locale === 'ro' ? 'Adaugă echipament' : 'Add equipment')} />
        <Field label={locale === 'ro' ? 'Denumire' : 'Name'} value={draft.name} editable={profileReady && equipmentReady && !busy} onChangeText={(name) => changeDraft((current) => ({ ...current, name }))} />
        <ChoiceRow
          label={locale === 'ro' ? 'Tip' : 'Type'}
          value={draft.kind}
          onChange={changeKind}
          large
          options={[
            { value: 'cold', label: locale === 'ro' ? 'Frigider' : 'Fridge' },
            { value: 'frozen', label: locale === 'ro' ? 'Congelator' : 'Freezer' },
            { value: 'hot', label: locale === 'ro' ? 'Linie caldă' : 'Hot line' },
            { value: 'other', label: locale === 'ro' ? 'Altul' : 'Other' },
          ]}
        />
        <View style={styles.limitRow}>
          <View style={styles.copy}><Field label="Min °C" value={minimum} editable={profileReady && equipmentReady && !busy} keyboardType="decimal-pad" onChangeText={(value) => { if (!profileReady || !equipmentReady || saving.current) return; changeDraft(current => current); setMinimum(value); }} /></View>
          <View style={styles.copy}><Field label="Max °C" value={maximum} editable={profileReady && equipmentReady && !busy} keyboardType="decimal-pad" onChangeText={(value) => { if (!profileReady || !equipmentReady || saving.current) return; changeDraft(current => current); setMaximum(value); }} /></View>
        </View>
        <ChoiceRow
          label={locale === 'ro' ? 'Citiri pe zi' : 'Readings per day'}
          value={String(draft.requiredReadings)}
          onChange={(value) => changeDraft((current) => {
            const requiredReadings = Number(value);
            const defaults = ['06:00', '12:00', '18:00'];
            return {
              ...current,
              requiredReadings,
              readingTimes: Array.from(
                { length: requiredReadings },
                (_, index) => current.readingTimes[index] ?? defaults[index] ?? profile.shiftStartTime,
              ),
            };
          })}
          options={[{ value: '1', label: '1' }, { value: '2', label: '2' }, { value: '3', label: '3' }]}
          large
        />
        <AppButton label={locale === 'ro' ? 'Salvează echipamentul' : 'Save equipment'} icon="checkmark-circle-outline" disabled={!profileReady || !equipmentReady || !draft.name.trim()} loading={busy} fullWidth onPress={() => void persistEquipment()} />
        {!!draft.id && <AppButton label={locale === 'ro' ? 'Renunță la editare' : 'Cancel editing'} variant="ghost" onPress={() => resetEquipment(equipment.length)} />}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  copy: { flex: 1 },
  equipmentRow: { flexDirection: 'row', alignItems: 'center', gap: 8, borderTopWidth: 1, borderTopColor: Brand.line, paddingTop: 10 },
  equipmentIcon: { width: 42, height: 42, borderRadius: 14, backgroundColor: Brand.tealSoft, alignItems: 'center', justifyContent: 'center' },
  equipmentName: { color: Brand.navyDeep, fontSize: 14, fontFamily: Fonts.extraBold },
  equipmentMeta: { color: Brand.muted, fontSize: 10, marginTop: 3, fontFamily: Fonts.regular, ...TabularNumbers },
  limitRow: { flexDirection: 'row', gap: 10 },
});
