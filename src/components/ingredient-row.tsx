/**
 * MANAGER 24/7™ by PARADIM — proprietary software.
 * Copyright © 2026 PARADIM Operations SRL. All rights reserved.
 * Concept author and product director: Marius Paul Nemeșu.
 * See LICENSE-PROPRIETARY.md.
 */

import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import { ChipGroup, ChoiceRow, type SelectOption } from '@/components/inputs';
import { NutritionFields } from '@/components/nutrition-fields';
import { Field, IconButton } from '@/components/ui';
import { suggestAllergens } from '@/constants/allergen-presets';
import { ALLERGEN_LABELS, ALLERGENS, type Allergen } from '@/constants/allergens';
import { Brand, Fonts, Radius, TabularNumbers } from '@/constants/theme';
import { useI18n } from '@/contexts/locale-context';
import { usePreferences } from '@/contexts/preferences-context';
import { calculateIngredientCost, calculateUnitPrice, compatibleQuantityUnits } from '@/lib/calculations';
import type {
  CatalogIngredient,
  IngredientDraft,
  PriceUnit,
  QuantityUnit,
} from '@/types/recipe';

const priceUnits: readonly PriceUnit[] = ['kg', 'l', 'buc'];

function toNumber(value: string) {
  return Number(value.replace(',', '.').replace(/[^0-9.-]/g, '')) || 0;
}

export function IngredientRow({
  ingredient,
  index,
  catalog,
  canRemove,
  onChange,
  onRemove,
}: {
  ingredient: IngredientDraft;
  index: number;
  catalog: readonly CatalogIngredient[];
  canRemove: boolean;
  onChange: (change: Partial<IngredientDraft>) => void;
  onRemove: () => void;
}) {
  const { t, locale } = useI18n();
  const { format } = usePreferences();
  const [allergensOpen, setAllergensOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [allergensTouched, setAllergensTouched] = useState(ingredient.allergens.length > 0);
  const isSubRecipe = ingredient.kind === 'sub_recipe';
  const isLinked = Boolean(ingredient.catalogId);
  const locked = isSubRecipe || isLinked;
  const packageUnitPrice = calculateUnitPrice(ingredient.packagePrice, ingredient.packageQuantity);

  const suggestions = useMemo(() => {
    if (locked) return [];
    const needle = ingredient.name.trim().toLocaleLowerCase('ro-RO');
    if (needle.length < 2) return [];
    return catalog
      .filter((entry) => entry.active && entry.name.toLocaleLowerCase('ro-RO').includes(needle))
      .slice(0, 4);
  }, [catalog, ingredient.name, locked]);

  const unitOptions: SelectOption<QuantityUnit>[] = compatibleQuantityUnits(ingredient.priceUnit)
    .map((unit) => ({ value: unit, label: unit }));
  const priceUnitOptions: SelectOption<PriceUnit>[] = priceUnits.map((unit) => ({
    value: unit,
    label: unit,
  }));
  const allergenOptions: SelectOption<Allergen>[] = ALLERGENS.map((allergen) => ({
    value: allergen,
    label: ALLERGEN_LABELS[locale][allergen],
  }));

  const linkTo = (entry: CatalogIngredient) => {
    const [firstUnit] = compatibleQuantityUnits(entry.priceUnit);
    onChange({
      catalogId: entry.id,
      name: entry.name,
      purchasePrice: entry.purchasePrice,
      priceUnit: entry.priceUnit,
      packageQuantity: entry.packageQuantity,
      packagePrice: entry.packagePrice,
      lossPercent: entry.defaultLossPercent,
      allergens: entry.allergens,
      allergensConfirmed: entry.allergensConfirmed,
      additives: entry.additives,
      nutrition: entry.nutrition,
      unit: firstUnit,
    });
  };

  const changePriceUnit = (priceUnit: PriceUnit) => {
    const [firstUnit] = compatibleQuantityUnits(priceUnit);
    onChange({ priceUnit, unit: firstUnit });
  };

  const changePackage = (
    field: 'packagePrice' | 'packageQuantity',
    value: number,
  ) => {
    const next = {
      packagePrice: ingredient.packagePrice ?? null,
      packageQuantity: ingredient.packageQuantity ?? null,
      [field]: value > 0 ? value : null,
    };
    const unitPrice = calculateUnitPrice(next.packagePrice, next.packageQuantity);
    onChange({ ...next, ...(unitPrice !== null ? { purchasePrice: unitPrice } : {}) });
  };

  return (
    <View style={styles.ingredient}>
      <View style={styles.header}>
        <View style={[styles.badge, isSubRecipe && styles.badgeSub]}>
          <Text style={styles.badgeText}>{String(index + 1).padStart(2, '0')}</Text>
        </View>
        <Text style={styles.title} numberOfLines={1}>
          {ingredient.name || t('editor.ingredientPlaceholderName')}
        </Text>
        {canRemove && (
          <IconButton
            icon="trash-outline"
            label={t('editor.removeIngredient')}
            danger
            onPress={onRemove}
          />
        )}
      </View>

      {isSubRecipe ? (
        <View style={styles.linkNotice}>
          <Ionicons name="git-merge-outline" size={15} color={Brand.navyDeep} />
          <Text style={styles.linkText}>
            {t('editor.subRecipeBadge')} · {t('editor.subRecipeUnitCost', {
              price: format.money(ingredient.purchasePrice),
              unit: ingredient.priceUnit,
            })}
          </Text>
        </View>
      ) : (
        <>
          <Field
            label={t('editor.fieldIngredient')}
            placeholder={t('editor.fieldIngredientPlaceholder')}
            value={ingredient.name}
            onChangeText={(name) => onChange(allergensTouched
              ? { name, allergensConfirmed: false }
              : { name, allergens: suggestAllergens(name), allergensConfirmed: false })}
          />
          {isLinked ? (
            <View style={styles.linkNotice}>
              <Ionicons name="link-outline" size={15} color={Brand.navyDeep} />
              <Text style={styles.linkText}>{t('editor.catalogLinked')}</Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => onChange({ catalogId: null })}
                style={({ pressed }) => pressed && styles.pressed}>
                <Text style={styles.unlink}>{t('editor.catalogUnlink')}</Text>
              </Pressable>
            </View>
          ) : suggestions.length > 0 && (
            <View style={styles.suggestions}>
              <Text style={styles.suggestionsLabel}>{t('editor.catalogSuggestions')}</Text>
              <View style={styles.suggestionChips}>
                {suggestions.map((entry) => (
                  <Pressable
                    key={entry.id}
                    accessibilityRole="button"
                    onPress={() => linkTo(entry)}
                    style={({ pressed }) => [styles.suggestion, pressed && styles.pressed]}>
                    <Ionicons name="add" size={13} color={Brand.navyDeep} />
                    <Text style={styles.suggestionText}>
                      {entry.name} · {format.money(entry.purchasePrice)}/{entry.priceUnit}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          )}
        </>
      )}

      <View style={styles.row}>
        <Field
          style={styles.rowField}
          label={t('editor.fieldQuantity')}
          keyboardType="decimal-pad"
          value={String(ingredient.quantity)}
          onChangeText={(value) => onChange({ quantity: toNumber(value) })}
        />
        {!isSubRecipe && !isLinked && (
          <Field
            style={styles.rowField}
            label={t('editor.fieldPurchasePrice')}
            keyboardType="decimal-pad"
            value={String(ingredient.purchasePrice)}
            onChangeText={(value) => onChange({ purchasePrice: toNumber(value) })}
          />
        )}
      </View>

      <ChoiceRow
        options={unitOptions}
        value={ingredient.unit}
        onChange={(unit) => onChange({ unit })}
      />

      {!isSubRecipe && !isLinked && (
        <ChoiceRow
          label={t('editor.priceFor')}
          options={priceUnitOptions}
          value={ingredient.priceUnit}
          onChange={changePriceUnit}
        />
      )}

      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: advancedOpen }}
        onPress={() => setAdvancedOpen((open) => !open)}
        style={({ pressed }) => [styles.advancedToggle, pressed && styles.pressed]}>
        <Ionicons name={advancedOpen ? 'chevron-up' : 'options-outline'} size={15} color={Brand.navySoft} />
        <Text style={styles.advancedToggleText}>
          {advancedOpen ? t('editor.hideAdvanced') : t('editor.showAdvanced')}
        </Text>
      </Pressable>

      {advancedOpen && (
        <View style={styles.advancedPanel}>
          <Field
            label={t('editor.fieldLoss')}
            keyboardType="decimal-pad"
            value={String(ingredient.lossPercent)}
            onChangeText={(value) => onChange({
              lossPercent: Math.min(99, Math.max(0, toNumber(value))),
            })}
          />
          {!locked && (
            <>
              <Text style={styles.advancedLabel}>{t('editor.packageCalculator')}</Text>
              <View style={styles.row}>
                <Field
                  style={styles.rowField}
                  label={t('editor.packagePrice')}
                  keyboardType="decimal-pad"
                  value={ingredient.packagePrice ? String(ingredient.packagePrice) : ''}
                  onChangeText={(value) => changePackage('packagePrice', toNumber(value))}
                />
                <Field
                  style={styles.rowField}
                  label={t('editor.packageQuantity')}
                  keyboardType="decimal-pad"
                  value={ingredient.packageQuantity ? String(ingredient.packageQuantity) : ''}
                  onChangeText={(value) => changePackage('packageQuantity', toNumber(value))}
                />
              </View>
              {packageUnitPrice !== null && (
                <Text style={styles.packageResult}>
                  {t('editor.unitPriceResult', {
                    price: format.money(packageUnitPrice),
                    unit: ingredient.priceUnit,
                  })}
                </Text>
              )}
              <Field
                label={t('nutrition.additives')}
                hint={t('nutrition.additivesHint')}
                placeholder={t('nutrition.additivesPlaceholder')}
                value={(ingredient.additives ?? []).join(', ')}
                onChangeText={(value) => onChange({
                  additives: value.split(',').map((item) => item.trim()).filter(Boolean),
                })}
              />
              <View style={styles.nutritionSection}>
                <Text style={styles.advancedLabel}>{t('nutrition.sectionIngredient')}</Text>
                <Text style={styles.advancedHint}>{t('nutrition.sectionIngredientHint')}</Text>
                <NutritionFields
                  value={ingredient.nutrition}
                  ingredientName={ingredient.name}
                  onChange={(nutrition) => onChange({ nutrition })}
                />
              </View>
            </>
          )}
        </View>
      )}

      {!locked && advancedOpen && (
        <View style={styles.allergens}>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: allergensOpen }}
            onPress={() => setAllergensOpen((open) => !open)}
            style={({ pressed }) => [styles.allergenToggle, pressed && styles.pressed]}>
            <Ionicons
              name={allergensOpen ? 'chevron-up' : 'chevron-down'}
              size={15}
              color={Brand.navySoft}
            />
            <Text style={styles.allergenToggleText}>
              {ingredient.allergens.length
                ? t('editor.allergensToggle', { count: ingredient.allergens.length })
                : t('editor.allergensToggleEmpty')}
            </Text>
          </Pressable>

          {!allergensOpen && ingredient.allergens.length > 0 && (
            <View style={styles.allergenSummary}>
              {ingredient.allergens.map((allergen) => (
                <View key={allergen} style={styles.allergenPill}>
                  <Text style={styles.allergenPillText}>{ALLERGEN_LABELS[locale][allergen]}</Text>
                </View>
              ))}
            </View>
          )}

          {allergensOpen && (
            <ChipGroup
              options={allergenOptions}
              selected={ingredient.allergens}
              onToggle={(allergen) => {
                setAllergensTouched(true);
                onChange({
                  allergens: ingredient.allergens.includes(allergen)
                    ? ingredient.allergens.filter((item) => item !== allergen)
                    : [...ingredient.allergens, allergen],
                  allergensConfirmed: false,
                });
              }}
            />
          )}
          {allergensOpen && (
            <View style={styles.confirmRow}>
              <View style={styles.confirmCopy}>
                <Text style={styles.confirmTitle}>{t('nutrition.allergensConfirmed')}</Text>
                <Text style={styles.confirmHint}>{t('nutrition.allergensConfirmedHint')}</Text>
              </View>
              <Switch
                value={ingredient.allergensConfirmed === true}
                onValueChange={(allergensConfirmed) => onChange({ allergensConfirmed })}
                trackColor={{ true: Brand.green, false: Brand.line }}
              />
            </View>
          )}
        </View>
      )}

      <View style={styles.lineCost}>
        <Ionicons name="calculator-outline" size={17} color={Brand.gold} />
        <Text style={styles.lineCostLabel}>{t('editor.lineCost')}</Text>
        <Text style={styles.lineCostValue}>{format.money(calculateIngredientCost(ingredient))}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  ingredient: {
    borderRadius: Radius.large,
    borderWidth: 1,
    borderColor: Brand.line,
    backgroundColor: '#FAFBFB',
    padding: 11,
    gap: 9,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  badge: {
    width: 30,
    height: 30,
    borderRadius: 10,
    backgroundColor: Brand.navy,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeSub: { backgroundColor: Brand.gold },
  badgeText: { color: Brand.white, fontSize: 11, fontFamily: Fonts.bold },
  title: { flex: 1, color: Brand.navy, fontSize: 14, fontFamily: Fonts.extraBold },
  row: { flexDirection: 'row', gap: 9 },
  rowField: { flex: 1 },
  linkNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Brand.goldSoft,
    borderRadius: Radius.medium,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  linkText: { flex: 1, color: Brand.navyDeep, fontSize: 11, fontFamily: Fonts.extraBold },
  unlink: { color: Brand.navySoft, fontSize: 11, fontFamily: Fonts.bold, textDecorationLine: 'underline' },
  pressed: { opacity: 0.7 },
  suggestions: { gap: 6 },
  suggestionsLabel: { color: Brand.muted, fontSize: 10, fontFamily: Fonts.bold, textTransform: 'uppercase' },
  suggestionChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  suggestion: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Brand.white,
    borderColor: Brand.line,
    borderWidth: 1,
    borderRadius: Radius.pill,
    paddingHorizontal: 11,
    paddingVertical: 7,
  },
  suggestionText: { color: Brand.navyDeep, fontSize: 11, fontFamily: Fonts.extraBold },
  allergens: { gap: 8 },
  allergenToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    alignSelf: 'flex-start',
    paddingVertical: 4,
  },
  allergenToggleText: {
    color: Brand.navySoft,
    fontSize: 11,
    fontFamily: Fonts.bold,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  allergenSummary: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  advancedToggle: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingVertical: 5,
  },
  advancedToggleText: { color: Brand.navySoft, fontSize: 11, fontFamily: Fonts.bold },
  advancedPanel: { gap: 9, paddingTop: 2 },
  advancedLabel: { color: Brand.muted, fontSize: 10, fontFamily: Fonts.bold, textTransform: 'uppercase' },
  packageResult: { color: Brand.tealDeep, fontSize: 12, fontFamily: Fonts.extraBold, ...TabularNumbers },
  nutritionSection: { gap: 10, borderTopWidth: 1, borderTopColor: Brand.line, paddingTop: 12 },
  advancedHint: { color: Brand.muted, fontSize: 11, lineHeight: 16 },
  confirmRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 10 },
  confirmCopy: { flex: 1, gap: 3 },
  confirmTitle: { color: Brand.navyDeep, fontSize: 12, fontFamily: Fonts.extraBold },
  confirmHint: { color: Brand.muted, fontSize: 10, lineHeight: 14 },
  allergenPill: {
    backgroundColor: Brand.goldSoft,
    borderRadius: Radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  allergenPillText: { color: Brand.navyDeep, fontSize: 10, fontFamily: Fonts.extraBold },
  lineCost: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Brand.white,
    padding: 8,
    borderRadius: Radius.medium,
  },
  lineCostLabel: { flex: 1, color: Brand.muted, fontSize: 12, fontFamily: Fonts.bold },
  lineCostValue: { color: Brand.navy, fontSize: 14, fontFamily: Fonts.extraBold, ...TabularNumbers },
});
