import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { AppButton, Body, Card, SectionHeader } from '@/components/ui';
import { Brand, Fonts, TabularNumbers } from '@/constants/theme';
import { useI18n } from '@/contexts/locale-context';
import { usePreferences } from '@/contexts/preferences-context';
import type { TranslationKey } from '@/i18n/translations';
import { calculateRecipeNutrition, DECLARED_NUTRIENT_KEYS, type NutrientKey } from '@/lib/nutrition';
import type { RecipeDraft } from '@/types/recipe';

const LABELS: Record<NutrientKey, TranslationKey> = {
  energyKj: 'nutrition.energyKj', energyKcal: 'nutrition.energyKcal', fat: 'nutrition.fat',
  saturates: 'nutrition.saturates', carbohydrates: 'nutrition.carbohydrates', sugars: 'nutrition.sugars',
  fibre: 'nutrition.fibre', protein: 'nutrition.protein', salt: 'nutrition.salt',
};

/** Visible on the final recipe without opening another tab; shares the export calculator. */
export function RecipeNutritionSummary({ recipe, onReview }: { recipe: RecipeDraft; onReview?: () => void }) {
  const { t } = useI18n();
  const { format } = usePreferences();
  const result = useMemo(() => calculateRecipeNutrition(recipe), [recipe]);
  const render = (key: NutrientKey, amount: number | null) => amount === null ? '—'
    : `${result.approximateKeys.includes(key) ? '≈ ' : ''}${format.number(amount, key.startsWith('energy') ? 0 : 2)} ${key === 'energyKj' ? 'kJ' : key === 'energyKcal' ? 'kcal' : 'g'}`;
  return <Card>
    <SectionHeader title={t('nutrition.automaticTitle')} />
    <Body>{t('nutrition.coverage', { count: result.coveredIngredientCount, total: result.ingredientCount })}</Body>
    <View style={styles.table}>
      <View style={[styles.row, styles.header]}>
        <Text style={styles.name}>{t('nutrition.value')}</Text>
        <Text style={styles.value}>{t('nutrition.per100g')}</Text>
        <Text style={styles.value}>{t('nutrition.perPortion')}</Text>
      </View>
      {DECLARED_NUTRIENT_KEYS.map((key) => <View key={key} style={styles.row}>
        <Text style={styles.name}>{t(LABELS[key])}</Text>
        <Text style={styles.value}>{render(key, result.per100g[key])}</Text>
        <Text style={styles.value}>{render(key, result.perPortion[key])}</Text>
      </View>)}
    </View>
    {!result.finalWeightMeasured && <Body>{t('nutrition.weightEstimateShort')}</Body>}
    {!!result.missingIngredients.length && <Body>{t('nutrition.missingIngredients', { names: result.missingIngredients.join(', ') })}</Body>}
    {!!result.incompatibleIngredients.length && <Body>{t('nutrition.incompatibleIngredients', { names: result.incompatibleIngredients.join(', ') })}</Body>}
    {!!result.approximateKeys.length && <Body>{t('nutrition.approximationNote')}</Body>}
    {!!result.sources.some((source) => source.startsWith('Anses. 2025.')) && <Text style={styles.source}>{t('nutrition.localAttribution')}</Text>}
    {onReview && <AppButton label={t('nutrition.reviewWeightSources')} variant="ghost" onPress={onReview} />}
  </Card>;
}

const styles = StyleSheet.create({
  table: { borderWidth: 1, borderColor: Brand.line, borderRadius: 12, overflow: 'hidden' },
  row: { flexDirection: 'row', padding: 9, gap: 5, borderTopWidth: 1, borderColor: Brand.line },
  header: { backgroundColor: Brand.tealSoft, borderTopWidth: 0 },
  name: { flex: 1.25, color: Brand.navyDeep, fontFamily: Fonts.semiBold, fontSize: 11 },
  value: { flex: 1, textAlign: 'right', color: Brand.navyDeep, fontFamily: Fonts.regular, fontSize: 11, ...TabularNumbers },
  source: { color: Brand.muted, fontFamily: Fonts.regular, fontSize: 10, lineHeight: 15 },
});
