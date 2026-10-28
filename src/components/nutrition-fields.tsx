/**
 * MANAGER 24/7™ by PARADIM — proprietary software.
 * Copyright © 2026 PARADIM Operations SRL. All rights reserved.
 * Concept author and product director: Marius Paul Nemeșu.
 * See LICENSE-PROPRIETARY.md.
 */

import { Linking, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { useEffect, useRef, useState } from 'react';

import { ChoiceRow, Select, type SelectOption } from '@/components/inputs';
import { AppButton, Field } from '@/components/ui';
import { Brand, Fonts } from '@/constants/theme';
import { useI18n } from '@/contexts/locale-context';
import type { TranslationKey } from '@/i18n/translations';
import { createEmptyIngredientNutrition, REQUIRED_NUTRIENT_KEYS, type NutrientKey } from '@/lib/nutrition';
import { findNutritionReferences, type NutritionReferenceProduct } from '@/lib/nutrition-reference';
import { CIQUAL_SOURCE, searchLocalNutrition } from '@/lib/nutrition-auto';
import type { IngredientNutrition, NutritionBasis, NutritionSource } from '@/types/recipe';

const NUTRIENT_FIELDS: readonly { key: NutrientKey; unit: string; labelKey: TranslationKey }[] = [
  { key: 'energyKj', unit: 'kJ', labelKey: 'nutrition.energyKj' },
  { key: 'energyKcal', unit: 'kcal', labelKey: 'nutrition.energyKcal' },
  { key: 'fat', unit: 'g', labelKey: 'nutrition.fat' },
  { key: 'saturates', unit: 'g', labelKey: 'nutrition.saturates' },
  { key: 'carbohydrates', unit: 'g', labelKey: 'nutrition.carbohydrates' },
  { key: 'sugars', unit: 'g', labelKey: 'nutrition.sugars' },
  { key: 'fibre', unit: 'g', labelKey: 'nutrition.fibre' },
  { key: 'protein', unit: 'g', labelKey: 'nutrition.protein' },
  { key: 'salt', unit: 'g', labelKey: 'nutrition.salt' },
];

function nullableNumber(value: string): number | null {
  const normalized = value.replace(',', '.').replace(/[^0-9.-]/g, '');
  if (!normalized.trim()) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : null;
}

export function NutritionFields({
  value,
  onChange,
  ingredientName = '',
}: {
  value: IngredientNutrition | undefined;
  onChange: (value: IngredientNutrition) => void;
  ingredientName?: string;
}) {
  const { t } = useI18n();
  const nutrition = value ?? createEmptyIngredientNutrition();
  const [lookupQuery, setLookupQuery] = useState(ingredientName);
  const [lookupTouched, setLookupTouched] = useState(false);
  const [lookupBusy, setLookupBusy] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [results, setResults] = useState<NutritionReferenceProduct[]>([]);
  const [localResults, setLocalResults] = useState<ReturnType<typeof searchLocalNutrition>>([]);
  const lookupId = useRef(0);
  useEffect(() => () => { lookupId.current += 1; }, []);

  useEffect(() => {
    if (!lookupTouched) setLookupQuery(ingredientName);
  }, [ingredientName, lookupTouched]);
  const basisOptions: SelectOption<NutritionBasis>[] = [
    { value: '100g', label: t('nutrition.basis100g') },
    { value: '100ml', label: t('nutrition.basis100ml') },
    { value: 'unit', label: t('nutrition.basisUnit') },
  ];
  const sourceOptions: SelectOption<NutritionSource>[] = [
    { value: 'product_label', label: t('nutrition.sourceLabel') },
    { value: 'laboratory', label: t('nutrition.sourceLaboratory') },
    { value: 'supplier', label: t('nutrition.sourceSupplier') },
    { value: 'accepted_database', label: t('nutrition.sourceDatabase') },
    { value: 'imported_workbook', label: t('nutrition.sourceWorkbook') },
    { value: 'estimated', label: t('nutrition.sourceEstimated') },
    { value: 'unknown', label: t('nutrition.sourceUnknown') },
  ];

  const manual = (change: Partial<IngredientNutrition>) => onChange({
    ...nutrition, ...change, automaticMatch: undefined, automaticDisabled: true,
  });
  const setNutrient = (key: NutrientKey, raw: string) => {
    const qualifiers = { ...nutrition.qualifiers };
    delete qualifiers[key];
    manual({ values: { ...nutrition.values, [key]: nullableNumber(raw) }, qualifiers, confirmed: false });
  };

  const canConfirm = nutrition.source !== 'unknown'
    && Boolean(nutrition.sourceReference?.trim())
    && REQUIRED_NUTRIENT_KEYS.every((key) => nutrition.values[key] !== null)
    && !Object.keys(nutrition.qualifiers ?? {}).length;

  const searchLocal = () => {
    lookupId.current += 1;
    setLookupBusy(false);
    setResults([]);
    const found = searchLocalNutrition(lookupQuery);
    setLocalResults(found);
    setLookupError(found.length ? null : t('nutrition.lookupEmpty'));
  };

  const search = async () => {
    if (lookupQuery.trim().length < 2) return;
    const requestId = ++lookupId.current;
    setLookupBusy(true);
    setLookupError(null);
    setResults([]);
    setLocalResults([]);
    try {
      const found = await findNutritionReferences(lookupQuery);
      if (lookupId.current !== requestId) return;
      setResults(found);
      if (!found.length) setLookupError(t('nutrition.lookupEmpty'));
    } catch (error) {
      if (lookupId.current !== requestId) return;
      const message = error instanceof Error ? error.message : '';
      setLookupError(message === 'nutrition-rate-limited'
        ? t('nutrition.lookupRateLimited')
        : t('nutrition.lookupFailed'));
    } finally {
      if (lookupId.current === requestId) setLookupBusy(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.lookupBox}>
        <Text style={styles.lookupTitle}>{t('nutrition.lookupTitle')}</Text>
        <Text style={styles.lookupHint}>{t('nutrition.lookupHint')}</Text>
        <Field
          label={t('nutrition.lookupQuery')}
          placeholder={t('nutrition.lookupPlaceholder')}
          value={lookupQuery}
          autoCapitalize="none"
          onChangeText={(next) => {
            setLookupTouched(true);
            setLookupQuery(next);
            setLookupError(null);
          }}
          onSubmitEditing={searchLocal}
          returnKeyType="search"
        />
        <AppButton
          label={t('nutrition.localLookup')}
          icon="search-outline"
          variant="secondary"
          disabled={lookupQuery.trim().length < 2}
          onPress={searchLocal}
        />
        {localResults.map((food) => (
          <Pressable key={food.code} accessibilityRole="button" accessibilityLabel={food.name}
            style={styles.result} onPress={() => { onChange(food.nutrition); setLocalResults([]); }}>
            <View style={styles.resultCopy}>
              <Text style={styles.resultName}>{food.name}</Text>
              <Text style={styles.resultMeta}>ANSES-Ciqual 2025 · {food.code} · {food.originalName}</Text>
            </View>
            <Text style={styles.resultUse}>{t('nutrition.lookupUse')}</Text>
          </Pressable>
        ))}
        <Text style={styles.attribution}>{CIQUAL_SOURCE}</Text>
        {!!nutrition.automaticMatch && <Text style={styles.lookupHint}>{t(nutrition.source === 'estimated' ? 'nutrition.genericEstimate' : 'nutrition.autoMatched')}</Text>}
        <AppButton label={t('nutrition.productLookup')} icon="barcode-outline" variant="ghost"
          loading={lookupBusy} disabled={lookupQuery.trim().length < 2} onPress={() => void search()} />
        {!!lookupError && <Text style={styles.lookupError}>{lookupError}</Text>}
        {results.map((product) => (
          <Pressable
            key={product.barcode}
            accessibilityRole="button"
            accessibilityLabel={product.name}
            onPress={() => {
              onChange({ ...product.nutrition, automaticDisabled: true });
              setResults([]);
            }}
            style={({ pressed }) => [styles.result, pressed && styles.pressed]}>
            <View style={styles.resultCopy}>
              <Text style={styles.resultName}>{product.name}</Text>
              <Text style={styles.resultMeta}>
                {[product.brand, product.quantityLabel, product.barcode].filter(Boolean).join(' · ')}
              </Text>
              <Text style={styles.resultSource}>
                {t('nutrition.lookupCompleteness', { count: product.completedRequiredFields })}
              </Text>
            </View>
            <Text style={styles.resultUse}>{t('nutrition.lookupUse')}</Text>
          </Pressable>
        ))}
        <Text style={styles.attribution}>{t('nutrition.lookupAttribution')}</Text>
      </View>
      <ChoiceRow
        label={t('nutrition.basis')}
        options={basisOptions}
        value={nutrition.basis}
        onChange={(basis) => manual({ basis, confirmed: false })}
      />
      <View style={styles.grid}>
        {NUTRIENT_FIELDS.map(({ key, unit, labelKey }) => (
          <Field
            key={key}
            style={styles.field}
            label={`${t(labelKey)} (${unit})`}
            hint={nutrition.qualifiers?.[key] ? t('nutrition.sourceQualifier', { value: nutrition.qualifiers[key]! }) : undefined}
            keyboardType="decimal-pad"
            value={nutrition.values[key] === null ? '' : String(nutrition.values[key])}
            onChangeText={(raw) => setNutrient(key, raw)}
          />
        ))}
      </View>
      <Select
        label={t('nutrition.source')}
        placeholder={t('nutrition.sourceUnknown')}
        value={nutrition.source}
        options={sourceOptions}
        onChange={(source) => manual({ source: source ?? 'unknown', confirmed: false })}
      />
      <Field
        label={t('nutrition.sourceReference')}
        placeholder={t('nutrition.sourceReferencePlaceholder')}
        value={nutrition.sourceReference ?? ''}
        onChangeText={(sourceReference) => manual({
          sourceReference: sourceReference.trim() ? sourceReference : null,
          confirmed: false,
        })}
      />
      <View style={styles.confirmRow}>
        <View style={styles.confirmCopy}>
          <Text style={styles.confirmTitle}>{t('nutrition.confirmed')}</Text>
          <Text style={styles.confirmHint}>{t('nutrition.confirmedHint')}</Text>
        </View>
        <Switch
          value={nutrition.confirmed}
          disabled={!canConfirm}
          onValueChange={(confirmed) => manual({ confirmed: canConfirm && confirmed })}
          trackColor={{ true: Brand.green, false: Brand.line }}
        />
      </View>
      {!canConfirm && <Text style={styles.confirmBlocked}>{t('nutrition.confirmBlocked')}</Text>}
      <Text style={styles.lookupHint}>{t('nutrition.massConversionHint')}</Text>
      <View style={styles.grid}>
        <Field style={styles.field} label={t('nutrition.gramsPerMl')} keyboardType="decimal-pad"
          value={nutrition.gramsPerMl ? String(nutrition.gramsPerMl) : ''}
          onChangeText={(raw) => onChange({ ...nutrition, gramsPerMl: nullableNumber(raw), confirmed: false })} />
        <Field style={styles.field} label={t('nutrition.gramsPerUnit')} keyboardType="decimal-pad"
          value={nutrition.gramsPerUnit ? String(nutrition.gramsPerUnit) : ''}
          onChangeText={(raw) => onChange({ ...nutrition, gramsPerUnit: nullableNumber(raw), confirmed: false })} />
      </View>
      {!!Object.keys(nutrition.qualifiers ?? {}).length && <Text style={styles.confirmBlocked}>{t('nutrition.approximationNote')}</Text>}
      {nutrition.sourceReference?.includes('https://') && (
        <AppButton
          label={t('nutrition.openSource')}
          icon="open-outline"
          variant="ghost"
          onPress={() => {
            const url = nutrition.sourceReference?.match(/https:\/\/\S+/)?.[0];
            if (url) void Linking.openURL(url);
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 12 },
  lookupBox: { gap: 9, padding: 12, borderRadius: 14, backgroundColor: Brand.tealSoft },
  lookupTitle: { color: Brand.navyDeep, fontSize: 14, fontFamily: Fonts.extraBold },
  lookupHint: { color: Brand.muted, fontSize: 11, lineHeight: 16, fontFamily: Fonts.regular },
  lookupError: { color: Brand.red, fontSize: 11, lineHeight: 16, fontFamily: Fonts.semiBold },
  result: { flexDirection: 'row', gap: 10, alignItems: 'center', padding: 10, borderRadius: 12, borderWidth: 1, borderColor: Brand.line, backgroundColor: Brand.white },
  resultCopy: { flex: 1, gap: 2 },
  resultName: { color: Brand.navyDeep, fontSize: 13, fontFamily: Fonts.bold },
  resultMeta: { color: Brand.muted, fontSize: 10, fontFamily: Fonts.regular },
  resultSource: { color: Brand.tealDeep, fontSize: 10, fontFamily: Fonts.semiBold },
  resultUse: { color: Brand.goldInk, fontSize: 11, fontFamily: Fonts.extraBold },
  attribution: { color: Brand.muted, fontSize: 9, lineHeight: 13, fontFamily: Fonts.regular },
  pressed: { opacity: 0.72 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  field: { flexGrow: 1, flexBasis: 142 },
  confirmRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  confirmCopy: { flex: 1, gap: 3 },
  confirmTitle: { color: Brand.navyDeep, fontSize: 13, fontFamily: Fonts.extraBold },
  confirmHint: { color: Brand.muted, fontSize: 11, lineHeight: 15 },
  confirmBlocked: { color: Brand.amber, fontSize: 10, lineHeight: 15, fontFamily: Fonts.semiBold },
});
