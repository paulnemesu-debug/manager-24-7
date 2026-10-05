import type { HaccpDocument, HaccpValues } from '@/types/haccp';
import type { HaccpRoutineProfile } from '@/types/haccp-routine';
import { HACCP_FORMS, type HaccpFormDefinition } from '@/constants/haccp-forms';

const evidenceKeys = new Set(HACCP_FORMS.flatMap((form) => form.rowFields
  .filter((field) => ['temperature', 'time', 'signature', 'choice'].includes(field.type))
  .map((field) => field.key)));

export function haccpLocationMatches(document: HaccpDocument, profile: Pick<HaccpRoutineProfile, 'defaultLocationId' | 'defaultLocationName'>) {
  if (profile.defaultLocationId) return document.headerValues._location_id === profile.defaultLocationId;
  return !document.headerValues._location_id
    && (document.headerValues._location_name ?? document.headerValues.location ?? '') === profile.defaultLocationName;
}

export function haccpRowNeedsConfirmation(values: HaccpValues) {
  return Boolean((values._auto_date || values._requires_confirmation === 'true') && !values._confirmed_at);
}

export function haccpHeaderNeedsConfirmation(values: HaccpValues) {
  return Boolean(values._auto_completed_at && !values._header_confirmed_at);
}

export function clearUnconfirmedHeader(values: HaccpValues, form: HaccpFormDefinition) {
  const next = { ...values };
  if (haccpHeaderNeedsConfirmation(values)) {
    form.documentFields.filter((field) => field.type === 'signature').forEach((field) => { next[field.key] = ''; });
  }
  return next;
}

/** Older generated temperatures are suggestions, never evidence of measurement. */
export function clearUnconfirmedMeasurements(values: HaccpValues): HaccpValues {
  if (!haccpRowNeedsConfirmation(values)) return { ...values };
  const next = { ...values };
  for (const key of Object.keys(next)) {
    const slot = key.match(/^(?:temperature|time)_(\d)$/)?.[1];
    if (slot && next[`_confirmed_${slot}_at`]) continue;
    if (slot || evidenceKeys.has(key) || /signature|prepared_by|checked_by|cleaned_by/.test(key)) next[key] = '';
  }
  return next;
}
