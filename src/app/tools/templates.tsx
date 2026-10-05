/**
 * MANAGER 24/7™ by PARADIM — proprietary software.
 * Copyright © 2026 PARADIM Operations SRL. All rights reserved.
 * Concept author and product director: Marius Paul Nemeșu.
 * See LICENSE-PROPRIETARY.md.
 */

import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { ChoiceRow, type SelectOption } from '@/components/inputs';
import { Body, BrandHeader, Card, IconButton, Screen, SectionHeader, StatusPill, Title } from '@/components/ui';
import { CATEGORY_LABEL_KEY, RECIPE_CATEGORIES, type RecipeCategory } from '@/constants/categories';
import { RECIPE_TEMPLATES } from '@/constants/recipe-templates';
import { Brand, Fonts, Radius, TabularNumbers } from '@/constants/theme';
import { useI18n } from '@/contexts/locale-context';
import { usePreferences } from '@/contexts/preferences-context';

type Filter = RecipeCategory | 'all';

export default function RecipeTemplatesScreen() {
  const router = useRouter();
  const { t } = useI18n();
  const { format } = usePreferences();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');

  const filterOptions: SelectOption<Filter>[] = [
    { value: 'all', label: t('templates.all') },
    ...RECIPE_CATEGORIES
      .filter((category) => RECIPE_TEMPLATES.some((template) => template.category === category))
      .map((category) => ({ value: category, label: t(CATEGORY_LABEL_KEY[category]) })),
  ];

  const visible = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('ro-RO');
    return RECIPE_TEMPLATES.filter((template) => (
      (filter === 'all' || template.category === filter)
      && (!needle || template.title.toLocaleLowerCase('ro-RO').includes(needle)
        || template.ingredients.some((ingredient) => ingredient.name.toLocaleLowerCase('ro-RO').includes(needle)))
    ));
  }, [filter, query]);

  return (
    <Screen>
      <BrandHeader mini />
      <View style={styles.topBar}>
        <IconButton icon="arrow-back" label={t('common.back')} onPress={() => router.back()} />
        <Text style={styles.topTitle}>{t('templates.title')}</Text>
        <View style={styles.topSpacer} />
      </View>

      <View>
        <Title>{t('templates.heading')}</Title>
        <Body>{t('templates.subtitle', { count: RECIPE_TEMPLATES.length })}</Body>
      </View>

      <Card tone="gold">
        <SectionHeader title={t('templates.legalTitle')} />
        <Body>{t('templates.legalBody')}</Body>
      </Card>

      <View style={styles.search}>
        <Ionicons name="search" size={19} color={Brand.muted} />
        <TextInput
          accessibilityLabel={t('templates.searchLabel')}
          placeholder={t('templates.searchPlaceholder')}
          placeholderTextColor="#98A3AD"
          value={query}
          onChangeText={setQuery}
          style={styles.searchInput}
        />
      </View>
      <ChoiceRow options={filterOptions} value={filter} onChange={setFilter} />

      <Text style={styles.resultCount}>{t('templates.results', { count: visible.length })}</Text>
      {visible.map((template) => {
        const nutritionRows = template.ingredients.filter((item) => item.energyKcalPer100g !== null).length;
        const hasMissingEnergy = nutritionRows !== template.ingredients.length;
        return (
          <Pressable
            key={template.id}
            accessibilityRole="button"
            accessibilityLabel={t('templates.useNamed', { title: template.title })}
            onPress={() => router.push(`/recipe/new?template=${template.id}`)}
            style={({ pressed }) => [styles.templatePressable, pressed && styles.pressed]}>
            <Card style={styles.templateCard}>
              <View style={styles.templateTop}>
                <View style={styles.templateCopy}>
                  <Text style={styles.category}>{t(CATEGORY_LABEL_KEY[template.category])}</Text>
                  <Text style={styles.templateTitle}>{template.title}</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={Brand.gold} />
              </View>
              <View style={styles.metrics}>
                <Text style={styles.metric}>{t('templates.ingredients', { count: template.ingredients.length })}</Text>
                <Text style={styles.metric}>
                  {format.number(template.energyKcalPerPortion, 0)} kcal / {t('templates.portion')}
                </Text>
              </View>
              <StatusPill
                label={hasMissingEnergy ? t('templates.energyPartial') : t('templates.energyImported')}
                status={hasMissingEnergy ? 'watch' : 'neutral'}
              />
              <View style={styles.useRow}>
                <Ionicons name="create-outline" size={16} color={Brand.navy} />
                <Text style={styles.useText}>{t('templates.use')}</Text>
              </View>
            </Card>
          </Pressable>
        );
      })}
    </Screen>
  );
}

const styles = StyleSheet.create({
  topBar: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  topTitle: { flex: 1, textAlign: 'center', color: Brand.navy, fontSize: 15, fontFamily: Fonts.bold },
  topSpacer: { width: 42 },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Brand.white,
    borderColor: Brand.line,
    borderWidth: 1,
    borderRadius: Radius.medium,
    paddingHorizontal: 13,
  },
  searchInput: { flex: 1, minHeight: 46, paddingHorizontal: 9, color: Brand.ink, fontSize: 14, fontFamily: Fonts.regular },
  resultCount: { color: Brand.muted, fontSize: 12, fontFamily: Fonts.bold, ...TabularNumbers },
  templatePressable: { borderRadius: Radius.large },
  templateCard: { gap: 11 },
  templateTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  templateCopy: { flex: 1, gap: 4 },
  category: { color: Brand.goldInk, fontSize: 10, fontFamily: Fonts.extraBold, textTransform: 'uppercase', letterSpacing: 0.7 },
  templateTitle: { color: Brand.navyDeep, fontSize: 16, lineHeight: 21, fontFamily: Fonts.extraBold },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  metric: { color: Brand.muted, fontSize: 11, fontFamily: Fonts.semiBold, ...TabularNumbers },
  useRow: {
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    borderWidth: 1,
    borderColor: Brand.line,
    borderRadius: Radius.medium,
    backgroundColor: Brand.white,
  },
  useText: { color: Brand.navy, fontSize: 13, fontFamily: Fonts.extraBold },
  pressed: { opacity: 0.75 },
});
