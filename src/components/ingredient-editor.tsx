/**
 * MANAGER 24/7™ by PARADIM — proprietary software.
 * Copyright © 2026 PARADIM Operations SRL. All rights reserved.
 * Concept author and product director: Marius Paul Nemeșu.
 * See LICENSE-PROPRIETARY.md.
 */

import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, StyleSheet, Switch, Text, View } from 'react-native';

import { ChipGroup, ChoiceRow, type SelectOption } from '@/components/inputs';
import { NutritionFields } from '@/components/nutrition-fields';
import { PriceSparkline } from '@/components/price-sparkline';
import { AppButton, Body, Card, Field, IconButton, Screen, SectionHeader, Title } from '@/components/ui';
import { suggestAllergens } from '@/constants/allergen-presets';
import { ALLERGEN_LABELS, ALLERGENS, type Allergen } from '@/constants/allergens';
import { Brand, Fonts, Radius, TabularNumbers } from '@/constants/theme';
import { useI18n } from '@/contexts/locale-context';
import { usePreferences } from '@/contexts/preferences-context';
import { useSubscription } from '@/contexts/subscription-context';
import { useWorkspace } from '@/contexts/workspace-context';
import { calculateUnitPrice } from '@/lib/calculations';
import { listPriceHistory, type PriceHistoryEntry } from '@/lib/catalog-repository';
import { createEmptyIngredientNutrition, enrichIngredientNutrition, normalizeIngredientNutrition } from '@/lib/nutrition';
import { recipesUsingCatalogIngredient } from '@/lib/recipe-graph';
import type {
  CatalogIngredient,
  CatalogIngredientDraft,
  PriceUnit,
  SupplierOfferDraft,
} from '@/types/recipe';

const priceUnits: readonly PriceUnit[] = ['kg', 'l', 'buc'];

function toNumber(value: string) {
  return Number(value.replace(',', '.').replace(/[^0-9.-]/g, '')) || 0;
}

function draftFrom(entry?: CatalogIngredient): CatalogIngredientDraft {
  if (!entry) {
    return {
      name: '',
      purchasePrice: 0,
      priceUnit: 'kg',
      packageQuantity: null,
      packagePrice: null,
      defaultLossPercent: 0,
      supplier: null,
      priceSource: null,
      priceSourceDate: null,
      offers: [],
      notes: null,
      allergens: [],
      allergensConfirmed: false,
      additives: [],
      nutrition: createEmptyIngredientNutrition(),
      active: true,
    };
  }
  const offers = entry.offers?.length ? entry.offers.map(({ updatedAt: _updatedAt, ...offer }) => offer) : entry.supplier ? [{
    id: `offer-${entry.id}`,
    supplierName: entry.supplier,
    unitPrice: entry.purchasePrice,
    priceUnit: entry.priceUnit,
    packageQuantity: entry.packageQuantity,
    packagePrice: entry.packagePrice,
    source: entry.priceSource ?? null,
    sourceDate: entry.priceSourceDate ?? null,
    isActive: true,
  }] : [];
  return {
    ...entry,
    offers,
    allergensConfirmed: entry.allergensConfirmed ?? false,
    additives: entry.additives ?? [],
    nutrition: normalizeIngredientNutrition(entry.nutrition),
  };
}

export function IngredientEditor({ entry }: { entry?: CatalogIngredient }) {
  const router = useRouter();
  const { t, locale } = useI18n();
  const { format } = usePreferences();
  const { isViewer } = useSubscription();
  const { saveCatalogIngredient, removeCatalogIngredient, recipes } = useWorkspace();
  const [draft, setDraft] = useState<CatalogIngredientDraft>(() => enrichIngredientNutrition(draftFrom(entry)));
  const [isSaving, setIsSaving] = useState(false);
  // Cât timp bucătarul nu a atins lista, o completăm noi după denumire.
  const [allergensTouched, setAllergensTouched] = useState(Boolean(entry?.allergens.length));
  const [suggested, setSuggested] = useState(false);
  const [history, setHistory] = useState<PriceHistoryEntry[]>([]);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const calculatedUnitPrice = calculateUnitPrice(draft.packagePrice, draft.packageQuantity);
  const offers = draft.offers ?? [];
  const activeOffer = offers.find((offer) => offer.isActive) ?? null;
  const cheapestOffer = offers.length
    ? offers.reduce((best, offer) => offer.unitPrice < best.unitPrice ? offer : best)
    : null;
  const potentialSaving = activeOffer && cheapestOffer
    ? Math.max(0, activeOffer.unitPrice - cheapestOffer.unitPrice)
    : 0;

  useEffect(() => {
    if (!entry) return;
    let cancelled = false;
    void listPriceHistory(entry.id).then((rows) => {
      if (!cancelled) setHistory(rows);
    });
    return () => { cancelled = true; };
  }, [entry]);

  const affected = entry ? recipesUsingCatalogIngredient(recipes, entry.id).length : 0;

  const allergenOptions: SelectOption<Allergen>[] = ALLERGENS.map((allergen) => ({
    value: allergen,
    label: ALLERGEN_LABELS[locale][allergen],
  }));

  const unitOptions: SelectOption<PriceUnit>[] = priceUnits.map((unit) => ({
    value: unit,
    label: unit,
  }));

  const setField = <K extends keyof CatalogIngredientDraft>(
    field: K,
    value: CatalogIngredientDraft[K],
  ) => setDraft((current) => ({ ...current, [field]: value }));

  const setPackageField = (field: 'packagePrice' | 'packageQuantity', value: number) => {
    setDraft((current) => {
      const next = { ...current, [field]: value > 0 ? value : null };
      const unitPrice = calculateUnitPrice(next.packagePrice, next.packageQuantity);
      return { ...next, purchasePrice: unitPrice ?? current.purchasePrice };
    });
  };

  const changeName = (name: string) => {
    setDraft((current) => {
      if (allergensTouched) return enrichIngredientNutrition({ ...current, name, allergensConfirmed: false });
      const allergens = suggestAllergens(name);
      setSuggested(allergens.length > 0);
      return enrichIngredientNutrition({ ...current, name, allergens, allergensConfirmed: false });
    });
  };

  const toggleAllergen = (allergen: Allergen) => {
    setAllergensTouched(true);
    setSuggested(false);
    setDraft((current) => ({
      ...current,
      allergens: current.allergens.includes(allergen)
        ? current.allergens.filter((item) => item !== allergen)
        : [...current.allergens, allergen],
      allergensConfirmed: false,
    }));
  };

  const addOffer = () => {
    const offer: SupplierOfferDraft = {
      id: `offer-${Date.now()}`,
      supplierName: '',
      unitPrice: draft.purchasePrice,
      priceUnit: draft.priceUnit,
      packageQuantity: null,
      packagePrice: null,
      source: null,
      sourceDate: new Date().toISOString().slice(0, 10),
      isActive: offers.length === 0,
    };
    setField('offers', [...offers, offer]);
  };

  const updateOffer = (id: string, change: Partial<SupplierOfferDraft>) => {
    setField('offers', offers.map((offer) => offer.id === id ? { ...offer, ...change } : offer));
  };

  const activateOffer = (id: string) => {
    const selected = offers.find((offer) => offer.id === id);
    if (!selected) return;
    setDraft((current) => ({
      ...current,
      offers: (current.offers ?? []).map((offer) => ({ ...offer, isActive: offer.id === id })),
      supplier: selected.supplierName,
      purchasePrice: selected.unitPrice,
      priceUnit: selected.priceUnit,
      packageQuantity: selected.packageQuantity,
      packagePrice: selected.packagePrice,
      priceSource: selected.source,
      priceSourceDate: selected.sourceDate,
    }));
  };

  const removeOffer = (id: string) => {
    const remaining = offers.filter((offer) => offer.id !== id);
    if (remaining.length && !remaining.some((offer) => offer.isActive)) {
      remaining[0] = { ...remaining[0], isActive: true };
    }
    setField('offers', remaining);
  };

  const submit = async () => {
    if (!draft.name.trim()) {
      Alert.alert(t('ingredientEditor.missingName'), t('ingredientEditor.missingNameBody'));
      return;
    }
    setIsSaving(true);
    try {
      await saveCatalogIngredient({
        ...draft,
        purchasePrice: activeOffer?.unitPrice ?? calculatedUnitPrice ?? draft.purchasePrice,
        supplier: activeOffer?.supplierName ?? draft.supplier,
        priceUnit: activeOffer?.priceUnit ?? draft.priceUnit,
        packageQuantity: activeOffer?.packageQuantity ?? draft.packageQuantity,
        packagePrice: activeOffer?.packagePrice ?? draft.packagePrice,
        priceSource: activeOffer?.source ?? draft.priceSource,
        priceSourceDate: activeOffer?.sourceDate ?? draft.priceSourceDate,
      });
      router.replace('/(app)/ingredients');
    } catch (caught) {
      Alert.alert(
        t('ingredientEditor.saveFailed'),
        caught instanceof Error ? caught.message : t('common.tryAgain'),
      );
    } finally {
      setIsSaving(false);
    }
  };

  const confirmDelete = () => {
    if (!entry) return;
    Alert.alert(
      t('ingredientEditor.deleteConfirmTitle'),
      t('ingredientEditor.deleteConfirmBody'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: () => {
            void removeCatalogIngredient(entry.id)
              .then(() => router.replace('/(app)/ingredients'))
              .catch((caught) => Alert.alert(
                t('ingredientEditor.deleteFailed'),
                caught instanceof Error ? caught.message : t('common.tryAgain'),
              ));
          },
        },
      ],
    );
  };

  return (
    <Screen>
      <View style={styles.topBar}>
        <IconButton icon="arrow-back" label={t('common.back')} onPress={() => router.back()} />
        <Text style={styles.topTitle}>
          {entry ? t('ingredientEditor.titleEdit') : t('ingredientEditor.titleNew')}
        </Text>
        <View style={styles.topSpacer} />
      </View>

      <View>
        <Title>{entry ? entry.name : t('ingredientEditor.titleNew')}</Title>
        {affected > 0 && (
          <Body>
            {affected === 1
              ? t('ingredients.usedInOne')
              : t('ingredients.usedIn', { count: affected })}
          </Body>
        )}
      </View>

      <Card>
        <Field
          label={t('ingredientEditor.fieldName')}
          placeholder={t('ingredientEditor.fieldNamePlaceholder')}
          value={draft.name}
          onChangeText={changeName}
        />
        <SectionHeader eyebrow={t('ingredientEditor.quickMode')} title={t('ingredientEditor.packageTitle')} />
        <Body>{t('ingredientEditor.packageBody')}</Body>
        <View style={styles.row}>
          <Field
            style={styles.rowField}
            label={t('ingredientEditor.packagePrice')}
            keyboardType="decimal-pad"
            value={draft.packagePrice ? String(draft.packagePrice) : ''}
            onChangeText={(value) => setPackageField('packagePrice', toNumber(value))}
          />
          <Field
            style={styles.rowField}
            label={t('ingredientEditor.packageQuantity')}
            hint={t('ingredientEditor.packageQuantityHint', { unit: draft.priceUnit })}
            keyboardType="decimal-pad"
            value={draft.packageQuantity ? String(draft.packageQuantity) : ''}
            onChangeText={(value) => setPackageField('packageQuantity', toNumber(value))}
          />
        </View>
        <ChoiceRow
          label={t('ingredientEditor.fieldPriceUnit')}
          options={unitOptions}
          value={draft.priceUnit}
          onChange={(value) => setField('priceUnit', value)}
        />
        {calculatedUnitPrice !== null && (
          <View style={styles.unitResult}>
            <Text style={styles.unitResultLabel}>{t('ingredientEditor.unitResult')}</Text>
            <Text style={styles.unitResultValue}>
              {format.money(calculatedUnitPrice)} / {draft.priceUnit}
            </Text>
          </View>
        )}
        <AppButton
          label={advancedOpen ? t('ingredientEditor.hideAdvanced') : t('ingredientEditor.showAdvanced')}
          icon={advancedOpen ? 'chevron-up' : 'options-outline'}
          variant="ghost"
          fullWidth
          onPress={() => setAdvancedOpen((open) => !open)}
        />

        {advancedOpen && (
          <View style={styles.advanced}>
            <Field
              label={t('ingredientEditor.fieldPrice')}
              hint={t('ingredientEditor.directPriceHint')}
              keyboardType="decimal-pad"
              value={String(draft.purchasePrice)}
              onChangeText={(value) => setField('purchasePrice', toNumber(value))}
            />
            <Field
              label={t('ingredientEditor.fieldLoss')}
              hint={t('ingredientEditor.fieldLossHint')}
              keyboardType="decimal-pad"
              value={String(draft.defaultLossPercent)}
              onChangeText={(value) => setField('defaultLossPercent', Math.min(99, Math.max(0, toNumber(value))))}
            />
            <Field
              label={t('ingredientEditor.fieldSupplier')}
              placeholder={t('ingredientEditor.fieldSupplierPlaceholder')}
              value={draft.supplier ?? ''}
              onChangeText={(value) => setField('supplier', value)}
            />
            <Field
              label={t('ingredientEditor.fieldNotes')}
              multiline
              value={draft.notes ?? ''}
              onChangeText={(value) => setField('notes', value)}
            />
            <Field
              label={t('nutrition.additives')}
              hint={t('nutrition.additivesHint')}
              placeholder={t('nutrition.additivesPlaceholder')}
              value={(draft.additives ?? []).join(', ')}
              onChangeText={(value) => setField(
                'additives',
                value.split(',').map((item) => item.trim()).filter(Boolean),
              )}
            />
            <View style={styles.switchRow}>
              <Text style={styles.switchLabel}>{t('ingredientEditor.fieldActive')}</Text>
              <Switch
                value={draft.active}
                onValueChange={(value) => setField('active', value)}
                trackColor={{ true: Brand.gold, false: Brand.line }}
              />
            </View>
          </View>
        )}
      </Card>

      <Card>
        <SectionHeader
          eyebrow={t('ingredientEditor.suppliersEyebrow')}
          title={t('ingredientEditor.suppliersTitle')}
          action={<AppButton label={t('ingredientEditor.supplierAdd')} icon="add" variant="ghost" onPress={addOffer} />}
        />
        <Body>{t('ingredientEditor.suppliersBody')}</Body>
        {potentialSaving > 0 && (
          <View style={styles.savingBox}>
            <Text style={styles.savingLabel}>{t('ingredientEditor.potentialSaving')}</Text>
            <Text style={styles.savingValue}>{format.money(potentialSaving)} / {draft.priceUnit}</Text>
          </View>
        )}
        {offers.map((offer) => (
          <View key={offer.id} style={[styles.offerCard, offer.isActive && styles.offerCardActive]}>
            <View style={styles.offerTop}>
              <View style={styles.offerStatus}>
                <View style={[styles.offerDot, offer.isActive && styles.offerDotActive]} />
                <Text style={styles.offerStatusText}>
                  {offer.isActive ? t('ingredientEditor.offerActive') : t('ingredientEditor.offerAlternative')}
                </Text>
              </View>
              <AppButton
                label={offer.isActive ? t('ingredientEditor.offerActive') : t('ingredientEditor.offerActivate')}
                icon={offer.isActive ? 'checkmark-circle' : 'swap-horizontal-outline'}
                variant="ghost"
                disabled={offer.isActive}
                onPress={() => activateOffer(offer.id)}
              />
            </View>
            <View style={styles.row}>
              <Field
                style={styles.rowField}
                label={t('ingredientEditor.fieldSupplier')}
                value={offer.supplierName}
                onChangeText={(value) => updateOffer(offer.id, { supplierName: value })}
              />
              <Field
                style={styles.rowField}
                label={t('ingredientEditor.offerUnitPrice')}
                keyboardType="decimal-pad"
                value={String(offer.unitPrice || '')}
                onChangeText={(value) => updateOffer(offer.id, { unitPrice: toNumber(value) })}
              />
            </View>
            <View style={styles.row}>
              <Field
                style={styles.rowField}
                label={t('ingredientEditor.offerSource')}
                value={offer.source ?? ''}
                onChangeText={(value) => updateOffer(offer.id, { source: value || null })}
              />
              <Field
                style={styles.rowField}
                label={t('ingredientEditor.offerDate')}
                placeholder="YYYY-MM-DD"
                value={offer.sourceDate ?? ''}
                onChangeText={(value) => updateOffer(offer.id, { sourceDate: value || null })}
              />
            </View>
            {!offer.isActive && (
              <AppButton
                label={t('ingredientEditor.offerRemove')}
                icon="trash-outline"
                variant="danger"
                onPress={() => removeOffer(offer.id)}
              />
            )}
          </View>
        ))}
        {!offers.length && <Body>{t('ingredientEditor.suppliersEmpty')}</Body>}
      </Card>

      {advancedOpen && (
        <Card>
          <SectionHeader title={t('ingredientEditor.allergens')} />
          <Body>{t('ingredientEditor.allergensHint')}</Body>
          {suggested && <Body>{t('ingredientEditor.allergensSuggested')}</Body>}
          <ChipGroup
            options={allergenOptions}
            selected={draft.allergens}
            onToggle={toggleAllergen}
          />
          <View style={styles.confirmRow}>
            <View style={styles.confirmCopy}>
              <Text style={styles.confirmTitle}>{t('nutrition.allergensConfirmed')}</Text>
              <Text style={styles.confirmHint}>{t('nutrition.allergensConfirmedHint')}</Text>
            </View>
            <Switch
              value={draft.allergensConfirmed === true}
              onValueChange={(value) => setField('allergensConfirmed', value)}
              trackColor={{ true: Brand.green, false: Brand.line }}
            />
          </View>
        </Card>
      )}

      {advancedOpen && (
        <Card>
          <SectionHeader title={t('nutrition.sectionIngredient')} />
          <Body>{t('nutrition.sectionIngredientHint')}</Body>
          <NutritionFields
            value={draft.nutrition}
            ingredientName={draft.name}
            onChange={(nutrition) => setField('nutrition', nutrition)}
          />
        </Card>
      )}

      {!!entry && history.length > 0 && (
        <Card>
          <SectionHeader title={t('ingredientEditor.priceHistory')} />
          <PriceSparkline history={history} />
          {history.map((row) => (
            <View key={row.id} style={styles.historyRow}>
              <Text style={styles.historyDate}>
                {new Date(row.recordedAt).toLocaleDateString(locale === 'ro' ? 'ro-RO' : 'en-US')}
              </Text>
              <Text style={styles.historyPrice}>
                {row.oldPrice !== null ? `${format.money(row.oldPrice)} → ` : ''}{format.money(row.newPrice)}
              </Text>
              {row.deltaPercent !== null && (
                <Text style={[styles.historyDelta, row.deltaPercent > 0 ? styles.up : styles.down]}>
                  {row.deltaPercent > 0 ? '+' : ''}{row.deltaPercent}%
                </Text>
              )}
              <Text style={styles.historySource} numberOfLines={1}>
                {[row.supplier, row.source, row.sourceDate].filter(Boolean).join(' · ') || '—'}
              </Text>
            </View>
          ))}
        </Card>
      )}

      <AppButton
        label={t('ingredientEditor.save')}
        icon="checkmark"
        fullWidth
        loading={isSaving}
        disabled={isViewer}
        onPress={() => void submit()}
      />
      {!!entry && !isViewer && (
        <AppButton
          label={t('ingredientEditor.delete')}
          icon="trash-outline"
          variant="danger"
          fullWidth
          onPress={confirmDelete}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  topBar: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  topTitle: { flex: 1, textAlign: 'center', color: Brand.navy, fontSize: 15, fontFamily: Fonts.bold },
  topSpacer: { width: 42 },
  row: { flexDirection: 'row', gap: 12 },
  rowField: { flex: 1 },
  advanced: { gap: 12 },
  unitResult: {
    backgroundColor: Brand.tealSoft,
    borderRadius: 14,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  unitResultLabel: { flex: 1, color: Brand.muted, fontSize: 12, fontFamily: Fonts.bold },
  unitResultValue: { color: Brand.navyDeep, fontSize: 18, fontFamily: Fonts.extraBold, ...TabularNumbers },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  switchLabel: { flex: 1, color: Brand.navyDeep, fontSize: 14, fontFamily: Fonts.extraBold },
  confirmRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  confirmCopy: { flex: 1, gap: 3 },
  confirmTitle: { color: Brand.navyDeep, fontSize: 13, fontFamily: Fonts.extraBold },
  confirmHint: { color: Brand.muted, fontSize: 11, lineHeight: 15, fontFamily: Fonts.regular },
  savingBox: {
    flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12,
    borderRadius: Radius.medium, backgroundColor: Brand.greenSoft,
  },
  savingLabel: { flex: 1, color: Brand.green, fontSize: 12, fontFamily: Fonts.bold },
  savingValue: { color: Brand.green, fontSize: 17, fontFamily: Fonts.extraBold, ...TabularNumbers },
  offerCard: { gap: 10, borderWidth: 1, borderColor: Brand.line, borderRadius: Radius.medium, padding: 11, backgroundColor: '#FAFBFB' },
  offerCardActive: { borderColor: Brand.teal, backgroundColor: Brand.tealSoft },
  offerTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  offerStatus: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  offerDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Brand.muted },
  offerDotActive: { backgroundColor: Brand.teal },
  offerStatusText: { color: Brand.navySoft, fontSize: 10, fontFamily: Fonts.bold, textTransform: 'uppercase' },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexWrap: 'wrap',
    borderTopWidth: 1,
    borderTopColor: Brand.line,
    paddingTop: 10,
  },
  historyDate: { color: Brand.muted, fontSize: 11, width: 78, fontFamily: Fonts.regular, ...TabularNumbers },
  historyPrice: { flex: 1, color: Brand.navyDeep, fontSize: 13, fontFamily: Fonts.extraBold, ...TabularNumbers },
  historyDelta: { fontSize: 12, fontFamily: Fonts.extraBold, ...TabularNumbers },
  historySource: { width: '100%', paddingLeft: 88, color: Brand.muted, fontSize: 9, fontFamily: Fonts.regular },
  up: { color: Brand.red },
  down: { color: Brand.green },
});
