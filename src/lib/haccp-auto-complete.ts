/**
 * MANAGER 24/7™ by PARADIM — proprietary software.
 * Copyright © 2026 PARADIM Operations SRL. All rights reserved.
 * Concept author and product director: Marius Paul Nemeșu.
 * See LICENSE-PROPRIETARY.md.
 */

import {
  HACCP_FORMS,
  type HaccpFieldDefinition,
  type HaccpFormDefinition,
} from '@/constants/haccp-forms';
import type { Locale } from '@/i18n/translations';
import { haccpIdentityStamp, localDateKey } from '@/lib/haccp-today';
import type { HaccpDocument, HaccpDocumentRow, HaccpValues } from '@/types/haccp';
import type { HaccpEquipment, HaccpRoutineProfile } from '@/types/haccp-routine';

export const HACCP_AUTO_COMPLETE_EXCLUDED_CODES = [
  'FO-H-07-01', // Consum materii prime
  'FO-H-10-01', // Vizitatori
  'FO-H-16-01', // Răcire rapidă
] as const;

const excludedCodes = new Set<string>(HACCP_AUTO_COMPLETE_EXCLUDED_CODES);
const TEMPERATURE_DISH_FORMS = new Set(['FO-H-14-01', 'FO-H-18-01']);

type AutoCompleteContext = {
  form: HaccpFormDefinition;
  profile: HaccpRoutineProfile;
  identity: string;
  identityStamp: string;
  now: Date;
  locale: Locale;
  equipment?: HaccpEquipment;
  slot?: number;
};

export type HaccpAutoCompleteResult = {
  documents: HaccpDocument[];
  completedFormCodes: string[];
  excludedFormCodes: string[];
  createdDocuments: number;
  updatedDocuments: number;
  pendingDishNames: number;
};

function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (character) => {
    const random = Math.floor(Math.random() * 16);
    return (character === 'x' ? random : (random & 3) | 8).toString(16);
  });
}

function parts(now: Date) {
  return {
    date: localDateKey(now),
    day: String(now.getDate()),
    month: String(now.getMonth() + 1).padStart(2, '0'),
    year: String(now.getFullYear()),
    period: `${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`,
  };
}

function genericFieldValue(field: HaccpFieldDefinition, context: AutoCompleteContext): string {
  const date = parts(context.now);
  if (field.key === 'location') return context.profile.defaultLocationName;
  if (field.key === 'cold_room') return context.equipment?.name ?? '';
  if (field.key === 'period') return date.period;
  if (field.key === 'day') return date.day;
  if (field.key === 'month' || field.key === 'month_axis') return date.month;
  if (field.key === 'year') return date.year;
  if (field.type === 'date') return date.date;
  if (field.type !== 'signature' && /responsible|supervisor/.test(field.key)) return context.profile.responsibleName || context.identity;
  return '';
}

function pendingDishName(context: AutoCompleteContext) {
  const slot = context.slot ?? 1;
  return context.locale === 'ro'
    ? `Preparat ${slot} — adaugă denumirea`
    : `Dish ${slot} — add name`;
}

function rowValues(context: AutoCompleteContext) {
  const values = context.form.rowFields.reduce<HaccpValues>((result, field) => {
    result[field.key] = genericFieldValue(field, context);
    return result;
  }, {});
  const dateParts = parts(context.now);
  if (TEMPERATURE_DISH_FORMS.has(context.form.code)) {
    values[context.form.code === 'FO-H-14-01' ? 'dish' : 'menu'] = pendingDishName(context);
    values._name_pending = 'true';
  }
  values._requires_confirmation = 'true';
  if (context.equipment) values._equipment_id = context.equipment.id;
  values._auto_date = dateParts.date;
  if (context.slot) values._auto_slot = String(context.slot);
  return values;
}

function headerValues(context: AutoCompleteContext) {
  const dateParts = parts(context.now);
  const responsible = context.profile.responsibleName || context.identity;
  const values = context.form.documentFields.reduce<HaccpValues>((result, field) => {
    result[field.key] = genericFieldValue(field, context);
    return result;
  }, {});
  if (values.period !== undefined && !values.period) values.period = dateParts.period;
  if (values.responsible !== undefined && !values.responsible) values.responsible = responsible;
  if (values.corrective_actions !== undefined) values.corrective_actions = values.corrective_actions || '';
  values._location_id = context.profile.defaultLocationId ?? '';
  values._location_name = context.profile.defaultLocationName;
  if (context.equipment) values._equipment_id = context.equipment.id;
  values._auto_completed_at = context.now.toISOString();
  values._auto_completed_by = context.identityStamp;
  return values;
}

function mergeMissing(generated: HaccpValues, existing: HaccpValues | undefined) {
  const next = { ...generated };
  Object.entries(existing ?? {}).forEach(([key, value]) => {
    if (value?.trim()) next[key] = value;
  });
  return next;
}

function matchesDocument(
  document: HaccpDocument,
  form: HaccpFormDefinition,
  generatedHeader: HaccpValues,
  equipment: HaccpEquipment | undefined,
  profile: HaccpRoutineProfile,
) {
  if ((document.headerValues._location_id ?? '') !== (profile.defaultLocationId ?? '')) return false;
  if (!profile.defaultLocationId && (document.headerValues._location_name ?? document.headerValues.location ?? '') !== profile.defaultLocationName) return false;
  if (equipment && document.headerValues._equipment_id !== equipment.id) return false;
  if (document.formCode !== form.code) return false;
  const keys = new Set(form.documentFields.map((field) => field.key));
  if (form.code === 'FO-H-20-02') {
    return document.headerValues.month === generatedHeader.month
      && document.headerValues.year === generatedHeader.year
      && document.headerValues.cold_room === (equipment?.name ?? generatedHeader.cold_room);
  }
  if (keys.has('month') && keys.has('year')) {
    return document.headerValues.month === generatedHeader.month
      && document.headerValues.year === generatedHeader.year;
  }
  if (keys.has('year') && !keys.has('month')) return document.headerValues.year === generatedHeader.year;
  if (keys.has('period')) return document.headerValues.period === generatedHeader.period;
  if (keys.has('date')) return document.headerValues.date === generatedHeader.date;
  return document.headerValues.form_date === generatedHeader.form_date;
}

function isDailyDocument(form: HaccpFormDefinition) {
  const keys = new Set(form.documentFields.map((field) => field.key));
  return keys.has('date') && !keys.has('month') && !keys.has('year') && !keys.has('period');
}

function findExistingRow(
  document: HaccpDocument,
  form: HaccpFormDefinition,
  generated: HaccpValues,
  slot?: number,
) {
  if (slot) {
    return document.rows.find((row) => row.values._auto_slot === String(slot))
      ?? document.rows[slot - 1];
  }
  const axis = form.rowFields[0];
  if (form.axisOrder && axis) {
    return document.rows.find((row) => row.values[axis.key] === generated[axis.key]);
  }
  const dateField = form.rowFields.find((field) => field.type === 'date');
  if (dateField) return document.rows.find((row) => row.values[dateField.key] === generated[dateField.key]);
  if (generated.when) return document.rows.find((row) => row.values.when?.startsWith(generated._auto_date));
  return document.rows.find((row) => row.values._auto_date === generated._auto_date)
    ?? (isDailyDocument(form) ? document.rows[0] : undefined);
}

function sortRows(rows: HaccpDocumentRow[], form: HaccpFormDefinition) {
  const axis = form.rowFields[0];
  if (!form.axisOrder || !axis) return rows.sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  const order = new Map(form.axisOrder.map((value, index) => [value, index]));
  return rows.sort((left, right) => (
    (order.get(left.values[axis.key]) ?? Number.MAX_SAFE_INTEGER)
    - (order.get(right.values[axis.key]) ?? Number.MAX_SAFE_INTEGER)
  ));
}

function buildDocument(
  documents: readonly HaccpDocument[],
  context: AutoCompleteContext,
) {
  const generatedHeader = headerValues(context);
  const existing = documents.find((document) => matchesDocument(document, context.form, generatedHeader, context.equipment, context.profile));
  const nowStamp = context.now.toISOString();
  const document: HaccpDocument = existing
    ? {
        ...existing,
        headerValues: {
          ...mergeMissing(generatedHeader, existing.headerValues),
          _auto_completed_at: nowStamp,
          _auto_completed_by: context.identityStamp,
        },
        rows: existing.rows.map((row) => ({ ...row, values: { ...row.values } })),
        updatedAt: nowStamp,
      }
    : {
        id: uuid(),
        formCode: context.form.code,
        headerValues: generatedHeader,
        rows: [],
        createdAt: nowStamp,
        updatedAt: nowStamp,
        syncState: 'local',
      };

  const slots = TEMPERATURE_DISH_FORMS.has(context.form.code) ? [1, 2, 3] : [undefined];
  slots.forEach((slot) => {
    if (!context.form.rowFields.length) return;
    const generated = rowValues({ ...context, slot });
    const current = findExistingRow(document, context.form, generated, slot);
    const values = mergeMissing(generated, current?.values);
    if (current?.values._confirmed_at) delete values._requires_confirmation;
    const nameKey = context.form.code === 'FO-H-14-01' ? 'dish'
      : context.form.code === 'FO-H-18-01' ? 'menu' : null;
    if (nameKey && current?.values[nameKey]?.trim() && !current.values._name_pending) {
      delete values._name_pending;
    }
    const row: HaccpDocumentRow = {
      id: current?.id ?? uuid(),
      values,
      createdAt: current?.createdAt ?? nowStamp,
      updatedAt: nowStamp,
    };
    document.rows = [row, ...document.rows.filter((item) => item.id !== row.id)];
  });
  document.rows = sortRows(document.rows, context.form);
  return { document, created: !existing };
}

export function autoCompleteHaccpDossier({
  documents,
  equipment,
  profile,
  identity,
  locale,
  now = new Date(),
}: {
  documents: readonly HaccpDocument[];
  equipment: readonly HaccpEquipment[];
  profile: HaccpRoutineProfile;
  identity: string;
  locale: Locale;
  now?: Date;
}): HaccpAutoCompleteResult {
  equipment = equipment.filter((item) => !item.locationId || item.locationId === profile.defaultLocationId);
  const generated: HaccpDocument[] = [];
  const completedFormCodes: string[] = [];
  let createdDocuments = 0;

  HACCP_FORMS.forEach((form) => {
    if (excludedCodes.has(form.code)) return;
    const formEquipment = form.code === 'FO-H-20-02'
      ? equipment.filter((item) => item.active && (item.kind === 'cold' || item.kind === 'frozen'))
      : [form.code === 'FO-H-18-01' ? equipment.find((item) => item.active && item.kind === 'hot') : undefined];
    const targets = formEquipment.length ? formEquipment : [undefined];

    targets.forEach((item) => {
      const result = buildDocument(documents, {
        form,
        profile,
        identity,
        identityStamp: haccpIdentityStamp(identity, now),
        now,
        locale,
        equipment: item,
      });
      generated.push(result.document);
      if (result.created) createdDocuments += 1;
    });
    completedFormCodes.push(form.code);
  });

  const pendingDishNames = generated.reduce((total, document) => total + document.rows.filter(
    (row) => row.values._name_pending === 'true',
  ).length, 0);
  return {
    documents: generated,
    completedFormCodes,
    excludedFormCodes: [...HACCP_AUTO_COMPLETE_EXCLUDED_CODES],
    createdDocuments,
    updatedDocuments: generated.length - createdDocuments,
    pendingDishNames,
  };
}
