/**
 * MANAGER 24/7™ by PARADIM — proprietary software.
 * Copyright © 2026 PARADIM Operations SRL. All rights reserved.
 * Concept author and product director: Marius Paul Nemeșu.
 * See LICENSE-PROPRIETARY.md.
 */

import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
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
  loadHaccpProfile,
  saveHaccpEquipment,
  saveHaccpProfile,
} from '@/lib/haccp-routine-repository';
import { listLocations, type BusinessLocation } from '@/lib/locations-repository';
import type { HaccpEquipment, HaccpEquipmentDraft, HaccpEquipmentKind } from '@/types/haccp-routine';

const numberOrNull = (value: string) => {
  const parsed = Number(value.replace(',', '.').replace(/[^0-9.-]/g, ''));
  return value.trim() && Number.isFinite(parsed) ? parsed : null;
};

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
  const router = useRouter();
  const auth = useAuth();
  const { locale } = useI18n();
  const userId = auth.user?.id ?? 'demo';
  const identity = auth.user?.email ?? 'Operator';
  const [locations, setLocations] = useState<BusinessLocation[]>([]);
  const [equipment, setEquipment] = useState<HaccpEquipment[]>([]);
  const [profile, setProfile] = useState(() => defaultHaccpProfile(identity));
  const [draft, setDraft] = useState<HaccpEquipmentDraft>(() => emptyEquipment(null, 1));
  const [minimum, setMinimum] = useState('0');
  const [maximum, setMaximum] = useState('4');
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    const [nextLocations, nextEquipment, nextProfile] = await Promise.all([
      listLocations(userId),
      listHaccpEquipment(userId),
      loadHaccpProfile(userId, identity),
    ]);
    setLocations(nextLocations);
    setEquipment(nextEquipment);
    setProfile(nextProfile);
    setDraft((current) => ({
      ...current,
      locationId: current.locationId ?? nextProfile.defaultLocationId,
      sortOrder: Math.max(current.sortOrder, nextEquipment.length + 1),
    }));
  }, [identity, userId]);

  useEffect(() => { void reload(); }, [reload]);

  const chooseLocation = (locationId: string | null) => {
    const location = locations.find((item) => item.id === locationId);
    setProfile((current) => ({
      ...current,
      defaultLocationId: location?.id ?? null,
      defaultLocationName: location?.name ?? current.defaultLocationName,
    }));
    setDraft((current) => ({ ...current, locationId: location?.id ?? null }));
  };

  const persistProfile = async () => {
    setBusy(true);
    try {
      const saved = await saveHaccpProfile(userId, profile);
      setProfile(saved);
      Alert.alert(locale === 'ro' ? 'Setări salvate' : 'Settings saved');
    } catch (error) {
      Alert.alert(locale === 'ro' ? 'Nu s-au salvat' : 'Could not save', error instanceof Error ? error.message : '');
    } finally { setBusy(false); }
  };

  const changeKind = (kind: HaccpEquipmentKind) => {
    const defaults = kind === 'frozen'
      ? { criticalMin: -24, criticalMax: -18, requiredReadings: 3 }
      : kind === 'hot'
        ? { criticalMin: 63, criticalMax: null, requiredReadings: 1 }
        : { criticalMin: 0, criticalMax: 4, requiredReadings: 3 };
    setDraft((current) => ({ ...current, kind, ...defaults }));
    setMinimum(defaults.criticalMin === null ? '' : String(defaults.criticalMin));
    setMaximum(defaults.criticalMax === null ? '' : String(defaults.criticalMax));
  };

  const editEquipment = (item: HaccpEquipment) => {
    setDraft({ ...item });
    setMinimum(item.criticalMin === null ? '' : String(item.criticalMin));
    setMaximum(item.criticalMax === null ? '' : String(item.criticalMax));
  };

  const persistEquipment = async () => {
    if (!draft.name.trim()) return;
    const criticalMin = numberOrNull(minimum);
    const criticalMax = numberOrNull(maximum);
    if (criticalMin !== null && criticalMax !== null && criticalMax < criticalMin) {
      Alert.alert(locale === 'ro' ? 'Limită invalidă' : 'Invalid limit');
      return;
    }
    setBusy(true);
    try {
      await saveHaccpEquipment(userId, { ...draft, criticalMin, criticalMax });
      const next = await listHaccpEquipment(userId);
      setEquipment(next);
      setDraft(emptyEquipment(profile.defaultLocationId, next.length + 1));
      setMinimum('0');
      setMaximum('4');
    } catch (error) {
      Alert.alert(locale === 'ro' ? 'Echipamentul nu a fost salvat' : 'Equipment not saved', error instanceof Error ? error.message : '');
    } finally { setBusy(false); }
  };

  const removeEquipment = async (item: HaccpEquipment) => {
    setBusy(true);
    try {
      await deactivateHaccpEquipment(userId, item);
      setEquipment((current) => current.filter((entry) => entry.id !== item.id));
    } finally { setBusy(false); }
  };

  return (
    <Screen>
      <ToolHeader
        title={locale === 'ro' ? 'Configurare HACCP' : 'HACCP setup'}
        subtitle={locale === 'ro' ? 'Nomenclator, responsabil și limite critice' : 'Register, responsible person and critical limits'}
      />

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
          value={profile.defaultLocationName}
          onChangeText={(value) => setProfile((current) => ({ ...current, defaultLocationName: value }))}
        />
        <Field
          label={locale === 'ro' ? 'Responsabil implicit' : 'Default responsible person'}
          value={profile.responsibleName}
          onChangeText={(value) => setProfile((current) => ({ ...current, responsibleName: value }))}
        />
        <HaccpTimeInput
          label={locale === 'ro' ? 'Ora deschiderii turei' : 'Shift opening time'}
          locale={locale}
          value={profile.shiftStartTime}
          onChange={(value) => setProfile((current) => ({ ...current, shiftStartTime: value }))}
        />
        <AppButton label={locale === 'ro' ? 'Salvează antetul' : 'Save header'} icon="save-outline" loading={busy} onPress={() => void persistProfile()} />
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
        <Field label={locale === 'ro' ? 'Denumire' : 'Name'} value={draft.name} onChangeText={(name) => setDraft((current) => ({ ...current, name }))} />
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
          <View style={styles.copy}><Field label="Min °C" value={minimum} keyboardType="decimal-pad" onChangeText={setMinimum} /></View>
          <View style={styles.copy}><Field label="Max °C" value={maximum} keyboardType="decimal-pad" onChangeText={setMaximum} /></View>
        </View>
        <ChoiceRow
          label={locale === 'ro' ? 'Citiri pe zi' : 'Readings per day'}
          value={String(draft.requiredReadings)}
          onChange={(value) => setDraft((current) => {
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
        <AppButton label={locale === 'ro' ? 'Salvează echipamentul' : 'Save equipment'} icon="checkmark-circle-outline" disabled={!draft.name.trim()} loading={busy} fullWidth onPress={() => void persistEquipment()} />
        {!!draft.id && <AppButton label={locale === 'ro' ? 'Renunță la editare' : 'Cancel editing'} variant="ghost" onPress={() => setDraft(emptyEquipment(profile.defaultLocationId, equipment.length + 1))} />}
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
