import { translate, type Locale, type TranslationKey } from '@/i18n/translations';
import type { FoodProductOrigin, WasteMeasure } from '@/types/waste-compliance';

export const MODEL_WASTE_MEASURES: WasteMeasure[] = [
  'staff_training',
  'production_planning',
  'fifo',
  'discount_sale',
  'consumer_redistribution',
  'receiver_donation',
];

export const getWasteModelObjectives = (locale: Locale = 'ro') => translate(locale, 'waste.modelObjectives');
export const MODEL_WASTE_OBJECTIVES = getWasteModelObjectives();
export const wasteObjectivesForDraft = (draft: string | null, locale: Locale) => draft ?? getWasteModelObjectives(locale);

export function getFoodOriginLabels(locale: Locale = 'ro') {
  const t = (key: TranslationKey) => translate(locale, key);
  const labels: Record<FoodProductOrigin, string> = {
    animal: t('waste.origin.animal'),
    plant: t('waste.origin.plant'),
    prepared_food: t('waste.origin.prepared_food'),
  };
  return labels;
}
export const FOOD_ORIGIN_LABELS = getFoodOriginLabels();

export function getWasteReasonLabels(locale: Locale = 'ro') {
  const t = (key: TranslationKey) => translate(locale, key);
  const labels: Record<string, string> = {
    expired: t('waste.reason.expired'),
    preparation: t('waste.reason.preparation'),
    overproduction: t('waste.reason.overproduction'),
    quality: t('waste.reason.quality'),
    plate: t('waste.reason.plate'),
    other: t('waste.reason.other'),
  };
  return labels;
}
export const WASTE_REASON_LABELS = getWasteReasonLabels();

export function getWasteDossierChecklist(locale: Locale = 'ro') {
  const t = (key: TranslationKey) => translate(locale, key);
  const labels = [
    t('waste.checklist.plan'),
    t('waste.checklist.measures'),
    t('waste.checklist.receivers'),
    t('waste.checklist.transfer'),
    t('waste.checklist.safety'),
    t('waste.checklist.retention'),
  ] as const;
  return labels;
}
export const WASTE_DOSSIER_CHECKLIST = getWasteDossierChecklist();

export function quantityInKg(quantity: number, unit: string, explicitKg = 0) {
  if (explicitKg > 0) return explicitKg;
  if (unit === 'kg') return quantity;
  if (unit === 'g') return quantity / 1_000;
  return 0;
}
