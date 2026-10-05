/**
 * MANAGER 24/7™ by PARADIM — proprietary software.
 * Copyright © 2026 PARADIM Operations SRL. All rights reserved.
 * Concept author and product director: Marius Paul Nemeșu.
 * See LICENSE-PROPRIETARY.md.
 */

import { clearUnconfirmedMeasurements, haccpLocationMatches, haccpRowNeedsConfirmation } from '@/lib/haccp-confirmation';
import type { Locale } from '@/i18n/translations';
import type { HaccpDocument, HaccpDocumentRow, HaccpValues } from '@/types/haccp';
import type { HaccpEquipment, HaccpRoutineProfile, HaccpTodayTask } from '@/types/haccp-routine';

const uuid = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (character) => {
  const random = Math.floor(Math.random() * 16);
  return (character === 'x' ? random : (random & 3) | 8).toString(16);
});

export function localDateKey(now = new Date()) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

export function localTimeKey(now = new Date()) {
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
}

export function haccpIdentityStamp(identity: string, now = new Date()) {
  return `${identity.trim() || 'Operator'} · ${localDateKey(now)} ${localTimeKey(now)}`;
}

export function temperatureIsConform(value: number, equipment: Pick<HaccpEquipment, 'criticalMin' | 'criticalMax'>) {
  if (!Number.isFinite(value)) return false;
  if (equipment.criticalMin !== null && value < equipment.criticalMin) return false;
  if (equipment.criticalMax !== null && value > equipment.criticalMax) return false;
  return true;
}

function newDocument(formCode: string, headerValues: HaccpValues, now: Date): HaccpDocument {
  const stamp = now.toISOString();
  return {
    id: uuid(),
    formCode,
    headerValues,
    rows: [],
    createdAt: stamp,
    updatedAt: stamp,
    syncState: 'local',
  };
}

function upsertRow(document: HaccpDocument, row: HaccpDocumentRow, match: (item: HaccpDocumentRow) => boolean) {
  return {
    ...document,
    rows: [row, ...document.rows.filter((item) => !match(item))].sort((left, right) => {
      const leftDay = Number(left.values.day ?? 0);
      const rightDay = Number(right.values.day ?? 0);
      return leftDay && rightDay ? leftDay - rightDay : left.createdAt.localeCompare(right.createdAt);
    }),
    updatedAt: row.updatedAt,
  };
}

function periodParts(now: Date) {
  return {
    date: localDateKey(now),
    day: String(now.getDate()),
    month: String(now.getMonth() + 1).padStart(2, '0'),
    year: String(now.getFullYear()),
    period: `${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`,
  };
}

function findMonthlyDocument(
  documents: readonly HaccpDocument[],
  formCode: string,
  now: Date,
  extra?: (document: HaccpDocument) => boolean,
) {
  const { month, year } = periodParts(now);
  return documents.find((document) => (
    document.formCode === formCode
    && document.headerValues.month === month
    && document.headerValues.year === year
    && (!extra || extra(document))
  ));
}

function statusForTemperature(document: HaccpDocument | undefined, equipment: HaccpEquipment, now: Date) {
  if (!document) return { completedSteps: 0, status: 'pending' as const };
  const { day, date } = periodParts(now);
  const row = equipment.kind === 'hot'
    ? document.rows.find((item) => (item.values._equipment_id === equipment.id || (!item.values._equipment_id && item.values.menu === equipment.name)) && document.headerValues.date === date)
    : document.rows.find((item) => item.values.day === day);
  if (!row) return { completedSteps: 0, status: 'pending' as const };
  const readings = [1, 2, 3]
    .filter((slot) => !haccpRowNeedsConfirmation(row.values) || Boolean(row.values[`_confirmed_${slot}_at`]))
    .map((slot) => row.values[`temperature_${slot}`])
    .filter((value) => value?.trim());
  const hasNonconform = readings.some((raw) => !temperatureIsConform(Number(raw.replace(',', '.')), equipment));
  return {
    completedSteps: Math.min(equipment.requiredReadings, readings.length),
    status: hasNonconform ? 'nonconform' as const : readings.length >= equipment.requiredReadings ? 'conform' as const : 'pending' as const,
  };
}

export function buildHaccpTodayTasks(
  documents: readonly HaccpDocument[],
  equipment: readonly HaccpEquipment[],
  locale: Locale,
  now = new Date(),
  profile?: Pick<HaccpRoutineProfile, 'defaultLocationId' | 'defaultLocationName'>,
): HaccpTodayTask[] {
  if (profile) {
    documents = documents.filter((document) => haccpLocationMatches(document, profile));
    equipment = equipment.filter((item) => !item.locationId || item.locationId === profile.defaultLocationId);
  }
  const { day, date } = periodParts(now);
  const hygieneDocument = findMonthlyDocument(documents, 'FO-H-04-01', now);
  const hygieneRow = hygieneDocument?.rows.find((row) => row.values.day === day && !haccpRowNeedsConfirmation(row.values));
  const hygieneNonconform = hygieneRow
    ? Object.values(hygieneRow.values).some((value) => value === 'no' || value === 'nonconform')
    : false;
  const cleaningDocument = documents.find((document) => document.formCode === 'FO-H-06-02' && document.headerValues.period === periodParts(now).period);
  const cleaningDone = cleaningDocument?.rows.some((row) => row.values.when?.startsWith(date) && !haccpRowNeedsConfirmation(row.values)) ?? false;
  const receptionDocument = documents.find((document) => document.formCode === 'FO-H-20-01' && document.headerValues.period === periodParts(now).period);
  const receptionDone = receptionDocument?.rows.some((row) => row.values.date === date && !haccpRowNeedsConfirmation(row.values)) ?? false;

  const tasks: HaccpTodayTask[] = [
    {
      key: 'hygiene',
      title: locale === 'ro' ? 'Igienă personal' : 'Staff hygiene',
      subtitle: locale === 'ro' ? 'O bifă pentru verificările de deschidere' : 'One tap for opening checks',
      formCode: 'FO-H-04-01', kind: 'hygiene', completedSteps: hygieneRow ? 1 : 0, totalSteps: 1,
      status: hygieneNonconform ? 'nonconform' : hygieneRow ? 'conform' : 'pending', required: true,
    },
    ...equipment.filter((item) => item.active).sort((a, b) => a.sortOrder - b.sortOrder).map((item) => {
      const document = item.kind === 'hot'
        ? documents.find((candidate) => candidate.formCode === 'FO-H-18-01' && candidate.headerValues.date === date)
        : findMonthlyDocument(documents, 'FO-H-20-02', now, (candidate) => candidate.headerValues._equipment_id === item.id || (!candidate.headerValues._equipment_id && candidate.headerValues.cold_room === item.name));
      const state = statusForTemperature(document, item, now);
      const range = [
        item.criticalMin === null ? null : `${item.criticalMin} °C`,
        item.criticalMax === null ? null : `${item.criticalMax} °C`,
      ].filter(Boolean).join(' – ');
      return {
        key: `equipment:${item.id}`,
        title: item.name,
        subtitle: `${state.completedSteps}/${item.requiredReadings}${range ? ` · ${range}` : ''}`,
        formCode: item.kind === 'hot' ? 'FO-H-18-01' : 'FO-H-20-02',
        kind: 'temperature' as const,
        equipment: item,
        completedSteps: state.completedSteps,
        totalSteps: item.requiredReadings,
        status: state.status,
        required: true,
      };
    }),
    {
      key: 'cleaning',
      title: locale === 'ro' ? 'Curățenie deschidere' : 'Opening cleaning',
      subtitle: locale === 'ro' ? 'Suprafețe și ustensile verificate' : 'Surfaces and utensils checked',
      formCode: 'FO-H-06-02', kind: 'cleaning', completedSteps: cleaningDone ? 1 : 0, totalSteps: 1,
      status: cleaningDone ? 'conform' : 'pending', required: true,
    },
    {
      key: 'reception',
      title: locale === 'ro' ? 'Recepție marfă' : 'Goods reception',
      subtitle: receptionDone
        ? (locale === 'ro' ? 'Recepție înregistrată azi' : 'Reception recorded today')
        : (locale === 'ro' ? 'Doar dacă este programată' : 'Only when scheduled'),
      formCode: 'FO-H-20-01', kind: 'reception', completedSteps: receptionDone ? 1 : 0, totalSteps: 1,
      status: receptionDone ? 'conform' : 'pending', required: false,
    },
  ];
  return tasks;
}

export function pendingHaccpTodayCount(
  documents: readonly HaccpDocument[],
  equipment: readonly HaccpEquipment[],
  locale: Locale,
  now = new Date(),
  profile?: HaccpRoutineProfile,
) {
  return buildHaccpTodayTasks(documents, equipment, locale, now, profile)
    .filter((task) => task.required && task.status !== 'conform').length;
}

export function completeHygieneToday(
  documents: readonly HaccpDocument[],
  profile: HaccpRoutineProfile,
  identity: string,
  now = new Date(),
) {
  documents = documents.filter((item) => haccpLocationMatches(item, profile));
  const parts = periodParts(now);
  const document = findMonthlyDocument(documents, 'FO-H-04-01', now)
    ?? newDocument('FO-H-04-01', {
      form_date: parts.date,
      month: parts.month,
      year: parts.year,
      location: profile.defaultLocationName,
      _location_id: profile.defaultLocationId ?? '',
      _location_name: profile.defaultLocationName,
    }, now);
  const existing = document.rows.find((item) => item.values.day === parts.day);
  const stamp = now.toISOString();
  const values: HaccpValues = {
    ...(existing?.values ?? {}),
    day: parts.day,
    hygiene_check: 'yes',
    equipment_clean: 'yes',
    fit_for_work: 'yes',
    hands_clear: 'yes',
    changing_filter: 'yes',
    new_restrictions: 'yes',
    temperature_checked: 'yes',
    monitoring_time: localTimeKey(now),
    supervisor: profile.responsibleName || identity,
    signature: haccpIdentityStamp(identity, now),
    corrective_action: '',
    _confirmed_at: stamp,
    _confirmed_by: identity,
  };
  return upsertRow(document, {
    id: existing?.id ?? uuid(),
    values,
    createdAt: existing?.createdAt ?? stamp,
    updatedAt: stamp,
  }, (item) => item.values.day === parts.day);
}

export function completeCleaningToday(
  documents: readonly HaccpDocument[],
  profile: HaccpRoutineProfile,
  identity: string,
  now = new Date(),
) {
  documents = documents.filter((item) => haccpLocationMatches(item, profile));
  const parts = periodParts(now);
  const document = documents.find((item) => item.formCode === 'FO-H-06-02' && item.headerValues.period === parts.period)
    ?? newDocument('FO-H-06-02', {
      form_date: parts.date,
      location: profile.defaultLocationName,
      _location_id: profile.defaultLocationId ?? '',
      _location_name: profile.defaultLocationName,
      period: parts.period,
    }, now);
  const existing = document.rows.find((item) => item.values.when?.startsWith(parts.date));
  const stamp = now.toISOString();
  return upsertRow(document, {
    id: existing?.id ?? uuid(),
    values: {
      ...(existing?.values ?? {}),
      _confirmed_at: stamp,
      _confirmed_by: identity,
      surface: localeSurface(identity),
      when: `${parts.date} ${localTimeKey(now)}`,
      product: 'Procedură internă aprobată',
      cleaned_by: haccpIdentityStamp(identity, now),
      checked_by: haccpIdentityStamp(profile.responsibleName || identity, now),
    },
    createdAt: existing?.createdAt ?? stamp,
    updatedAt: stamp,
  }, (item) => item.values.when?.startsWith(parts.date) ?? false);
}

function localeSurface(_identity: string) {
  return 'Suprafețe și ustensile - deschidere tură';
}

export function recordEquipmentTemperature({
  documents,
  equipment,
  profile,
  identity,
  temperature,
  correctiveAction,
  now = new Date(),
}: {
  documents: readonly HaccpDocument[];
  equipment: HaccpEquipment;
  profile: HaccpRoutineProfile;
  identity: string;
  temperature: number;
  correctiveAction: string;
  now?: Date;
}) {
  if (!Number.isFinite(temperature)) throw new Error('invalid-temperature');
  documents = documents.filter((item) => haccpLocationMatches(item, profile));
  const conform = temperatureIsConform(temperature, equipment);
  if (!conform && !correctiveAction.trim()) throw new Error('corrective-action-required');
  const parts = periodParts(now);
  const stamp = now.toISOString();
  const identityStamp = haccpIdentityStamp(identity, now);

  if (equipment.kind === 'hot') {
    const document = documents.find((item) => item.formCode === 'FO-H-18-01' && item.headerValues.date === parts.date)
      ?? newDocument('FO-H-18-01', {
        form_date: parts.date,
        date: parts.date,
        location: profile.defaultLocationName,
      _location_id: profile.defaultLocationId ?? '',
      _location_name: profile.defaultLocationName,
        corrective_actions: '',
        responsible: profile.responsibleName || identity,
      }, now);
    const existing = document.rows.find((item) => item.values._equipment_id === equipment.id || (!item.values._equipment_id && item.values.menu === equipment.name));
    const values = clearUnconfirmedMeasurements(existing?.values ?? {});
    const slot = [1, 2, 3].slice(0, equipment.requiredReadings).find((index) => !values[`temperature_${index}`]?.trim());
    if (!slot) throw new Error('readings-complete');
    const row: HaccpDocumentRow = {
      id: existing?.id ?? uuid(),
      values: {
        ...values,
        _equipment_id: equipment.id,
        [`_confirmed_${slot}_at`]: stamp,
        _confirmed_by: identity,
        menu: equipment.name,
        [`time_${slot}`]: localTimeKey(now),
        [`temperature_${slot}`]: String(temperature),
        signature: identityStamp,
      },
      createdAt: existing?.createdAt ?? stamp,
      updatedAt: stamp,
    };
    const updated = upsertRow(document, row, (item) => item.values._equipment_id === equipment.id || (!item.values._equipment_id && item.values.menu === equipment.name));
    if (!conform) updated.headerValues.corrective_actions = correctiveAction.trim();
    return { document: updated, conform, slot };
  }

  const document = findMonthlyDocument(
    documents,
    'FO-H-20-02',
    now,
    (item) => item.headerValues._equipment_id === equipment.id || (!item.headerValues._equipment_id && item.headerValues.cold_room === equipment.name),
  ) ?? newDocument('FO-H-20-02', {
    form_date: parts.date,
    month: parts.month,
    year: parts.year,
    cold_room: equipment.name,
    _equipment_id: equipment.id,
    location: profile.defaultLocationName,
      _location_id: profile.defaultLocationId ?? '',
      _location_name: profile.defaultLocationName,
  }, now);
  const existing = document.rows.find((item) => item.values.day === parts.day);
  const values: HaccpValues = { ...clearUnconfirmedMeasurements(existing?.values ?? {}), day: parts.day, _equipment_id: equipment.id };
  const firstEmpty = [1, 2, 3].slice(0, equipment.requiredReadings).find((slot) => !values[`temperature_${slot}`]?.trim());
  if (!firstEmpty) throw new Error('readings-complete');
  const slot = firstEmpty;
  values[`_confirmed_${slot}_at`] = stamp;
  values._confirmed_by = identity;
  values[`time_${slot}`] = localTimeKey(now);
  values[`temperature_${slot}`] = String(temperature);
  values.corrective_action = conform ? values.corrective_action ?? '' : correctiveAction.trim();
  values.prepared_by = identityStamp;
  values.checked_by = haccpIdentityStamp(profile.responsibleName || identity, now);
  const row: HaccpDocumentRow = {
    id: existing?.id ?? uuid(),
    values,
    createdAt: existing?.createdAt ?? stamp,
    updatedAt: stamp,
  };
  return {
    document: upsertRow(document, row, (item) => item.values.day === parts.day),
    conform,
    slot,
  };
}
