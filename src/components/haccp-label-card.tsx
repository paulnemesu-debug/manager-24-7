/**
 * MANAGER 24/7™ by PARADIM — proprietary software.
 * Copyright © 2026 PARADIM Operations SRL. All rights reserved.
 * Concept author and product director: Marius Paul Nemeșu.
 * See LICENSE-PROPRIETARY.md.
 */

import { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

import { HaccpDateInput } from '@/components/haccp-date-input';
import { HaccpTimeInput } from '@/components/haccp-time-input';
import { ChoiceRow, Select } from '@/components/inputs';
import { AppButton, Body, Card, Field, SectionHeader } from '@/components/ui';
import { ALLERGEN_LABELS } from '@/constants/allergens';
import { Brand, Fonts } from '@/constants/theme';
import { useI18n } from '@/contexts/locale-context';
import { useWorkspace } from '@/contexts/workspace-context';
import { localIsoDate } from '@/lib/local-date-time';
import { exportHaccpLabelPdf } from '@/lib/haccp-label-export';
import { buildHaccpLabelHtml } from '@/lib/haccp-label-sheet';

export function HaccpLabelCard() {
  const { t, locale } = useI18n();
  const { recipes } = useWorkspace();
  const [recipeId, setRecipeId] = useState<string | null>(null);
  const [producedAt, setProducedAt] = useState(localIsoDate());
  const [producedTime, setProducedTime] = useState(() => {
    const now = new Date();
    return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  });
  const [shelfLifeHours, setShelfLifeHours] = useState(24);
  const [labelSize, setLabelSize] = useState<'50x30' | '40x60'>('50x30');
  const recipe = recipes.find((item) => item.id === recipeId);
  const expiresAt = new Date(new Date(`${producedAt}T${producedTime || '00:00'}:00`).getTime()
    + shelfLifeHours * 60 * 60 * 1000);

  const exportLabel = async () => {
    if (!recipe) return;
    try {
      const html = buildHaccpLabelHtml({
        title: recipe.title, allergens: recipe.allergens, size: labelSize, locale,
        producedAt: new Date(`${producedAt}T${producedTime}:00`), expiresAt,
      });
      const uri = await exportHaccpLabelPdf(html);
      if (uri) Alert.alert(t('haccp.generated'), uri);
    } catch (error) {
      Alert.alert(t('haccp.exportFailed'), error instanceof Error ? error.message : t('common.tryAgain'));
    }
  };

  return (
    <Card>
      <SectionHeader eyebrow={t('haccp.fromRecipe')} title={t('haccp.labelTitle')} />
      <Select
        label={t('haccp.recipe')}
        placeholder={t('haccp.recipePlaceholder')}
        options={recipes.map((item) => ({ value: item.id, label: item.title }))}
        value={recipeId}
        onChange={setRecipeId}
      />
      <View style={styles.row}>
        <View style={styles.flex}><HaccpDateInput label={t('haccp.productionDate')} locale={locale} value={producedAt} onChange={setProducedAt} /></View>
        <View style={styles.flex}><HaccpTimeInput label={locale === 'ro' ? 'Ora producției' : 'Production time'} locale={locale} value={producedTime} onChange={setProducedTime} /></View>
      </View>
      <View style={styles.row}>
        <Field style={styles.flex} label={t('haccp.shelfLife')} keyboardType="number-pad" value={String(shelfLifeHours)} onChangeText={(value) => setShelfLifeHours(Math.max(1, Number(value.replace(/\D/g, '')) || 1))} />
      </View>
      <ChoiceRow
        label={locale === 'ro' ? 'Format etichetă' : 'Label size'}
        value={labelSize}
        onChange={setLabelSize}
        large
        options={[{ value: '50x30', label: '50 × 30 mm' }, { value: '40x60', label: '40 × 60 mm' }]}
      />
      {recipe && (
        <View style={styles.preview}>
          <Text style={styles.name}>{recipe.title}</Text>
          <Text style={styles.meta}>{t('haccp.expires')}: {expiresAt.toLocaleString(locale === 'ro' ? 'ro-RO' : 'en-GB')}</Text>
          <Text style={styles.meta}>{t('haccp.allergens')}: {recipe.allergens.length ? recipe.allergens.map((item) => ALLERGEN_LABELS[locale][item]).join(', ') : t('haccp.noneDeclared')}</Text>
        </View>
      )}
      <AppButton label={t('haccp.exportLabel')} icon="print-outline" fullWidth disabled={!recipe} onPress={() => void exportLabel()} />
      <Body>{t('haccp.labelDisclaimer')}</Body>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 10 },
  flex: { flex: 1 },
  preview: { borderRadius: 16, borderWidth: 2, borderColor: Brand.navy, padding: 14, gap: 7, backgroundColor: Brand.white },
  name: { color: Brand.navyDeep, fontSize: 20, fontFamily: Fonts.extraBold },
  meta: { color: Brand.ink, fontSize: 12, lineHeight: 17 },
});
