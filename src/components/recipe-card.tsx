/**
 * MANAGER 24/7™ by PARADIM — proprietary software.
 * Copyright © 2026 PARADIM Operations SRL. All rights reserved.
 * Concept author and product director: Marius Paul Nemeșu.
 * See LICENSE-PROPRIETARY.md.
 */

import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Card, StatusPill } from '@/components/ui';
import { RecipeCover } from '@/components/recipe-cover';
import { CATEGORY_LABEL_KEY } from '@/constants/categories';
import { Brand, Fonts, Radius, TabularNumbers } from '@/constants/theme';
import { useI18n } from '@/contexts/locale-context';
import { usePreferences } from '@/contexts/preferences-context';
import { getFoodCostStatus } from '@/lib/calculations';
import type { Recipe } from '@/types/recipe';

export function RecipeCard({
  recipe,
  onPress,
  compact = false,
  showSaved = false,
}: {
  recipe: Recipe;
  onPress: () => void;
  compact?: boolean;
  showSaved?: boolean;
}) {
  const { t, locale } = useI18n();
  const { format } = usePreferences();
  const status = getFoodCostStatus(recipe.totals.foodCostPercent, recipe.targetFoodCost);

  const meta = [
    t('card.servingsResult', { count: format.number(recipe.totals.effectiveServings) }),
    t('card.updated', { date: format.date(recipe.updatedAt) }),
  ].filter(Boolean).join(' · ');

  if (compact) {
    return (
      <Pressable accessibilityRole="button" accessibilityLabel={t('card.open', { title: recipe.title })} onPress={onPress} style={({ pressed }) => pressed && styles.pressed}>
        <Card style={styles.compactCard}>
          <View style={styles.header}>
            <Ionicons name="restaurant-outline" size={20} color={Brand.goldInk} />
            <View style={styles.titleWrap}>
              <Text style={styles.compactTitle} numberOfLines={2}>{recipe.title}</Text>
              <Text style={styles.compactMeta}>{recipe.isSubRecipe ? t('editor.subRecipeBadge') : recipe.category ? t(CATEGORY_LABEL_KEY[recipe.category]) : t('tabs.recipes')}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={Brand.navy} />
          </View>
          {showSaved && (
            <View style={styles.savedBadge}>
              <Ionicons name="checkmark-circle" size={13} color={Brand.green} />
              <Text style={styles.savedText}>{locale === 'ro' ? 'Salvată' : 'Saved'}</Text>
            </View>
          )}
          <View style={styles.compactMetrics}>
            <Text style={styles.compactMeta}>{t('card.portionCost')}: <Text style={styles.compactValue}>{format.money(recipe.totals.portionCost)}</Text></Text>
            <StatusPill label={format.percent(recipe.totals.foodCostPercent)} status={status === 'incomplete' ? 'neutral' : status} />
          </View>
        </Card>
      </Pressable>
    );
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('card.open', { title: recipe.title })}
      onPress={onPress}
      style={({ pressed }) => pressed && styles.pressed}>
      <Card style={styles.card}>
        <RecipeCover
          compact
          uri={recipe.photoUrl}
          category={recipe.category}
          foodCost={format.percent(recipe.totals.foodCostPercent)}
        />
        <View style={styles.header}>
          <View style={styles.titleWrap}>
            <Text style={styles.title} numberOfLines={1}>{recipe.title}</Text>
            <Text style={styles.meta}>{meta}</Text>
          </View>
          <Ionicons name="chevron-forward" size={22} color={Brand.gold} />
        </View>

        {(!!recipe.category || recipe.isSubRecipe) && (
          <View style={styles.badges}>
            {!!recipe.category && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{t(CATEGORY_LABEL_KEY[recipe.category])}</Text>
              </View>
            )}
            {recipe.isSubRecipe && (
              <View style={[styles.badge, styles.badgeSub]}>
                <Ionicons name="git-merge-outline" size={12} color={Brand.navyDeep} />
                <Text style={styles.badgeText}>{t('editor.subRecipeBadge')}</Text>
              </View>
            )}
          </View>
        )}

        <View style={styles.metrics}>
          <View style={styles.metric}>
            <Text style={styles.metricLabel}>{t('card.portionCost')}</Text>
            <Text style={styles.metricValue}>{format.money(recipe.totals.portionCost)}</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.metric}>
            <Text style={styles.metricLabel}>{t('card.foodCost')}</Text>
            <Text style={styles.metricValue}>{format.percent(recipe.totals.foodCostPercent)}</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.metric}>
            <Text style={styles.metricLabel}>{t('card.recommendedPrice')}</Text>
            <Text style={styles.metricValue}>{format.money(recipe.totals.recommendedPriceGross)}</Text>
          </View>
        </View>

        <StatusPill
          label={t(`status.${status}`)}
          status={status === 'incomplete' ? 'neutral' : status}
        />
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  savedBadge: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  savedText: { color: Brand.green, fontSize: 10, fontFamily: Fonts.bold },
  compactCard: { gap: 8 },
  compactTitle: { color: Brand.navyDeep, fontSize: 15, fontFamily: Fonts.extraBold },
  compactMeta: { color: Brand.muted, fontSize: 10, lineHeight: 15, fontFamily: Fonts.regular },
  compactValue: { color: Brand.navyDeep, fontFamily: Fonts.bold, ...TabularNumbers },
  compactMetrics: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  pressed: { opacity: 0.76, transform: [{ scale: 0.995 }] },
  card: { gap: 16 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  titleWrap: { flex: 1 },
  title: { color: Brand.navyDeep, fontSize: 18, fontFamily: Fonts.extraBold },
  meta: { color: Brand.muted, fontSize: 11, marginTop: 5, fontFamily: Fonts.regular, ...TabularNumbers },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: -6 },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#EDF1F4',
    borderRadius: Radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  badgeSub: { backgroundColor: Brand.goldSoft },
  badgeText: { color: Brand.navyDeep, fontSize: 10, fontFamily: Fonts.bold },
  metrics: {
    flexDirection: 'row',
    alignItems: 'stretch',
    backgroundColor: '#F4F7F8',
    borderRadius: Radius.medium,
    padding: 12,
  },
  metric: { flex: 1, gap: 5 },
  metricLabel: { color: Brand.muted, fontSize: 9, fontFamily: Fonts.bold, textTransform: 'uppercase' },
  metricValue: { color: Brand.navy, fontSize: 14, fontFamily: Fonts.extraBold, ...TabularNumbers },
  divider: { width: 1, backgroundColor: Brand.line, marginHorizontal: 8 },
});
