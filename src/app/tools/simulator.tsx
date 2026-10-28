/**
 * MANAGER 24/7™ by PARADIM — proprietary software.
 * Copyright © 2026 PARADIM Operations SRL. All rights reserved.
 * Concept author and product director: Marius Paul Nemeșu.
 * See LICENSE-PROPRIETARY.md.
 */

import { useEffect, useMemo, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { Select, type SelectOption } from '@/components/inputs';
import { ToolHeader } from '@/components/tool-header';
import { AppButton, Body, Card, Field, Screen, SectionHeader } from '@/components/ui';
import { Brand, Fonts, TabularNumbers } from '@/constants/theme';
import { useI18n } from '@/contexts/locale-context';
import { usePreferences } from '@/contexts/preferences-context';
import { useWorkspace } from '@/contexts/workspace-context';
import { simulateProfit, scenarioSupplierOffers, type IngredientScenario } from '@/lib/profit-simulator';

function toNumber(value: string) {
  return Number(value.replace(',', '.').replace(/[^0-9.-]/g, '')) || 0;
}

export default function ProfitSimulatorScreen() {
  const { t } = useI18n();
  const { format } = usePreferences();
  const router = useRouter();
  const params = useLocalSearchParams<{ recipeId?: string }>();
  const { recipes, catalog } = useWorkspace();
  const sellable = useMemo(() => recipes.filter((recipe) => !recipe.isSubRecipe), [recipes]);
  const [recipeId, setRecipeId] = useState<string | null>(params.recipeId ?? sellable[0]?.id ?? null);
  const recipe = sellable.find((item) => item.id === recipeId) ?? sellable[0];
  const [salePrice, setSalePrice] = useState(recipe ? String(recipe.salePriceGross) : '0');
  const [costChange, setCostChange] = useState('0');
  const [monthlyPortions, setMonthlyPortions] = useState('100');
  const [ingredientId, setIngredientId] = useState<string | null>(null);
  const [changes, setChanges] = useState<Record<string, IngredientScenario>>({});
  const [ingredientInputs, setIngredientInputs] = useState<Record<string, { quantity?: string; price?: string }>>({});
  const [offerId, setOfferId] = useState<string | null>(null);

  useEffect(() => {
    setSalePrice(String(recipe?.salePriceGross ?? 0));
    setCostChange('0'); setChanges({}); setIngredientInputs({}); setIngredientId(null); setOfferId(null);
  }, [recipe?.id, recipe?.salePriceGross]);

  const ingredient = recipe?.ingredients.find((item) => item.id === ingredientId);
  const offers = recipe && ingredient ? scenarioSupplierOffers(recipe, ingredient.id, catalog) : [];
  const change = ingredient ? changes[ingredient.id] : undefined;
  const changeIngredient = (patch: Partial<IngredientScenario>) => {
    if (!ingredient) return;
    setChanges((current) => ({ ...current, [ingredient.id]: { ...current[ingredient.id], ingredientId: ingredient.id, ...patch } }));
  };
  const editIngredient = (field: 'quantity' | 'price', raw: string) => {
    if (!ingredient) return;
    setIngredientInputs((current) => ({ ...current, [ingredient.id]: { ...current[ingredient.id], [field]: raw } }));
    changeIngredient({ [field === 'price' ? 'purchasePrice' : 'quantity']: Math.max(0, toNumber(raw)) });
    if (field === 'price') setOfferId(null);
  };

  const options: SelectOption<string>[] = sellable.map((item) => ({
    value: item.id,
    label: item.title,
    description: t('simulator.currentFoodCost', { value: format.percent(item.totals.foodCostPercent) }),
  }));

  const result = recipe ? simulateProfit(recipe, {
    salePriceGross: toNumber(salePrice),
    ingredientCostChangePercent: toNumber(costChange),
    monthlyPortions: toNumber(monthlyPortions),
    ingredientChanges: Object.values(changes),
  }) : null;

  const chooseRecipe = (value: string | null) => {
    setRecipeId(value);
    const selected = sellable.find((item) => item.id === value);
    if (selected) setSalePrice(String(selected.salePriceGross));
  };

  return (
    <Screen>
      <ToolHeader title={t('simulator.title')} subtitle={t('simulator.subtitle')} />
      <Card>
        <SectionHeader eyebrow={t('simulator.whatIf')} title={t('simulator.scenario')} />
        <Select
          label={t('simulator.recipe')}
          placeholder={t('simulator.recipePlaceholder')}
          value={recipe?.id ?? null}
          options={options}
          onChange={chooseRecipe}
        />
        {recipe ? <>
          <View style={styles.row}>
            <Field
              style={styles.field}
              label={t('simulator.salePrice')}
              keyboardType="decimal-pad"
              value={salePrice}
              onChangeText={setSalePrice}
            />
            <Field
              style={styles.field}
              label={t('simulator.costChange')}
              keyboardType="numbers-and-punctuation"
              value={costChange}
              onChangeText={setCostChange}
            />
          </View>
          <Field
            label={t('simulator.monthlyPortions')}
            keyboardType="number-pad"
            value={monthlyPortions}
            onChangeText={setMonthlyPortions}
          />
        </> : <Body>{t('simulator.noRecipes')}</Body>}
      </Card>

      {recipe && <Card>
        <SectionHeader title={t('simulator.ingredientScenario')} />
        <Body>{t('simulator.ingredientHint')}</Body>
        <Select label={t('simulator.ingredient')} placeholder={t('simulator.chooseIngredient')}
          value={ingredientId} options={recipe.ingredients.map((item) => ({ value: item.id, label: item.name,
            description: `${format.number(item.quantity)} ${item.unit} · ${format.money(item.purchasePrice)}/${item.priceUnit}` }))}
          onChange={(value) => { setIngredientId(value); setOfferId(null); }} />
        {ingredient && <>
          <View style={styles.row}>
            <Field style={styles.field} label={t('simulator.quantity', { unit: ingredient.unit })} keyboardType="decimal-pad"
              value={ingredientInputs[ingredient.id]?.quantity ?? String(change?.quantity ?? ingredient.quantity)} onChangeText={(value) => editIngredient('quantity', value)} />
            <Field style={styles.field} label={t('simulator.unitPrice', { unit: ingredient.priceUnit })} keyboardType="decimal-pad"
              value={ingredientInputs[ingredient.id]?.price ?? String(change?.purchasePrice ?? ingredient.purchasePrice)} onChangeText={(value) => editIngredient('price', value)} />
          </View>
          {offers.length > 0 && <Select label={t('simulator.supplierOffer')} placeholder={t('simulator.chooseSupplier')}
            value={offerId} options={offers.map((offer) => ({ value: offer.id, label: offer.supplierName,
              description: `${format.money(offer.unitPrice)}/${offer.priceUnit}${offer.sourceDate ? ` · ${format.date(offer.sourceDate)}` : ''}` }))}
            onChange={(value) => { const offer = offers.find((item) => item.id === value); setOfferId(value);
              if (offer) {
                changeIngredient({ purchasePrice: offer.unitPrice });
                setIngredientInputs((current) => ({ ...current, [ingredient.id]: { ...current[ingredient.id], price: String(offer.unitPrice) } }));
              } }} />}
          {!!ingredient.catalogId && <AppButton label={t('simulator.priceHistory')} icon="trending-up-outline" variant="ghost"
            onPress={() => router.push(`/ingredient/${ingredient.catalogId}`)} />}
        </>}
        <AppButton label={t('simulator.reset')} icon="refresh-outline" variant="secondary" onPress={() => {
          setChanges({}); setIngredientInputs({}); setOfferId(null); setCostChange('0'); setSalePrice(String(recipe.salePriceGross));
        }} />
        <Body>{t('simulator.changesCount', { count: Object.keys(changes).length })}</Body>
      </Card>}

      {result && <Card tone="navy">
        <SectionHeader eyebrow={t('simulator.result')} title={t('simulator.monthlyResult')} light />
        <View style={styles.primaryResult}>
          <Text style={styles.primaryLabel}>{t('simulator.monthlyImpact')}</Text>
          <Text style={[
            styles.primaryValue,
            result.monthlyImpact < 0 ? styles.negative : styles.positive,
          ]}>
            {result.monthlyImpact > 0 ? '+' : ''}{format.money(result.monthlyImpact)}
          </Text>
        </View>
        <View style={styles.metrics}>
          <Result label={t('simulator.portionCost')} value={format.money(result.scenarioPortionCost)} />
          <Result label={t('simulator.newFoodCost')} value={format.percent(result.scenarioFoodCostPercent)} />
          <Result label={t('simulator.marginPortion')} value={format.money(result.contributionPerPortion)} />
          <Result label={t('simulator.monthlyMargin')} value={format.money(result.monthlyContribution)} />
          <Result label={t('simulator.targetPrice')} value={format.money(result.targetPriceGross)} />
        </View>
        <Text style={styles.note}>{t('simulator.note')}</Text>
      </Card>}
    </Screen>
  );
}

function Result({ label, value }: { label: string; value: string }) {
  return <View style={styles.metric}>
    <Text style={styles.metricLabel}>{label}</Text>
    <Text style={styles.metricValue}>{value}</Text>
  </View>;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 10 },
  field: { flex: 1 },
  primaryResult: { borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.18)', paddingBottom: 13 },
  primaryLabel: { color: '#C5D7DF', fontSize: 11, fontFamily: Fonts.bold, textTransform: 'uppercase' },
  primaryValue: { fontSize: 38, lineHeight: 44, fontFamily: Fonts.extraBold, marginTop: 4, ...TabularNumbers },
  positive: { color: '#63D1A4' },
  negative: { color: '#FF9999' },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  metric: { width: '48%', backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 13, padding: 11 },
  metricLabel: { color: '#C5D7DF', fontSize: 9, lineHeight: 12, textTransform: 'uppercase' },
  metricValue: { color: Brand.white, fontSize: 17, fontFamily: Fonts.extraBold, marginTop: 4, ...TabularNumbers },
  note: { color: '#B8CBD3', fontSize: 10, lineHeight: 15 },
});
