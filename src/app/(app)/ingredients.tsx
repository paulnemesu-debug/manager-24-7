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

import { AppButton, Body, Card, EmptyStateGraphic, ListSkeleton, Screen, SectionHeader, StatusPill, Title } from '@/components/ui';
import { SyncBanner } from '@/components/sync-banner';
import { ALLERGEN_LABELS } from '@/constants/allergens';
import { Brand, Fonts, Radius, TabularNumbers } from '@/constants/theme';
import { useI18n } from '@/contexts/locale-context';
import { usePreferences } from '@/contexts/preferences-context';
import { useSubscription } from '@/contexts/subscription-context';
import { useWorkspace } from '@/contexts/workspace-context';

export function IngredientsCatalog() {
  const router = useRouter();
  const { t, locale } = useI18n();
  const { format } = usePreferences();
  const { isViewer } = useSubscription();
  const { catalog, recipes, isLoading } = useWorkspace();
  const [query, setQuery] = useState('');

  const usage = useMemo(() => {
    const counts = new Map<string, number>();
    for (const recipe of recipes) {
      const seen = new Set<string>();
      for (const ingredient of recipe.ingredients) {
        if (!ingredient.catalogId || seen.has(ingredient.catalogId)) continue;
        seen.add(ingredient.catalogId);
        counts.set(ingredient.catalogId, (counts.get(ingredient.catalogId) ?? 0) + 1);
      }
    }
    return counts;
  }, [recipes]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('ro-RO');
    if (!needle) return catalog;
    return catalog.filter((entry) => (
      entry.name.toLocaleLowerCase('ro-RO').includes(needle)
      || (entry.supplier ?? '').toLocaleLowerCase('ro-RO').includes(needle)
    ));
  }, [catalog, query]);

  if (isLoading) {
    return <ListSkeleton rows={4} />;
  }

  return (
    <>
      <SyncBanner />
      <View style={styles.heading}>
        <View style={styles.headingCopy}>
          <Title>{t('ingredients.title')}</Title>
          <Body>{t('ingredients.subtitle', { count: catalog.length })}</Body>
        </View>
        {!isViewer && (
          <AppButton label={t('ingredients.new')} icon="add" onPress={() => router.push('/ingredient/new')} />
        )}
      </View>

      <View style={styles.search}>
        <Ionicons name="search" size={20} color={Brand.muted} />
        <TextInput
          accessibilityLabel={t('ingredients.searchLabel')}
          placeholder={t('ingredients.searchPlaceholder')}
          placeholderTextColor="#98A3AD"
          value={query}
          onChangeText={setQuery}
          style={styles.searchInput}
        />
      </View>

      {!isViewer && (
        <View style={styles.importActions}>
          <AppButton
            label={t('ingredients.scanInvoiceCta')}
            icon="camera-outline"
            fullWidth
            onPress={() => router.push('/tools/invoice-import')}
          />
          <AppButton
            label={t('ingredients.importCta')}
            icon="cloud-upload-outline"
            variant="secondary"
            fullWidth
            onPress={() => router.push('/ingredient/import')}
          />
        </View>
      )}

      {filtered.length ? filtered.map((entry) => {
        const used = usage.get(entry.id) ?? 0;
        const usageLabel = used === 0
          ? t('ingredients.unused')
          : used === 1 ? t('ingredients.usedInOne') : t('ingredients.usedIn', { count: used });

        return (
          <Pressable
            key={entry.id}
            accessibilityRole="button"
            accessibilityLabel={entry.name}
            onPress={() => router.push(`/ingredient/${entry.id}`)}
            style={({ pressed }) => pressed && styles.pressed}>
            <Card style={styles.row}>
              <View style={styles.rowHeader}>
                <View style={styles.rowCopy}>
                  <Text style={styles.rowTitle} numberOfLines={1}>{entry.name}</Text>
                  <Text style={styles.rowMeta}>
                    {[entry.supplier, usageLabel].filter(Boolean).join(' · ')}
                  </Text>
                </View>
                <View style={styles.priceWrap}>
                  <Text style={styles.price}>{format.money(entry.purchasePrice)}</Text>
                  <Text style={styles.priceUnit}>/ {entry.priceUnit}</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={Brand.gold} />
              </View>

              {(!entry.active || entry.allergens.length > 0) && (
                <View style={styles.badges}>
                  {!entry.active && <StatusPill label={t('ingredients.inactive')} status="neutral" />}
                  {entry.allergens.map((allergen) => (
                    <View key={allergen} style={styles.allergen}>
                      <Text style={styles.allergenText}>{ALLERGEN_LABELS[locale][allergen]}</Text>
                    </View>
                  ))}
                </View>
              )}
            </Card>
          </Pressable>
        );
      }) : (
        <Card style={styles.empty}>
          <EmptyStateGraphic kind="ingredient" />
          <SectionHeader title={query ? t('ingredients.emptySearchTitle') : t('ingredients.emptyTitle')} />
          <Body>{query ? t('ingredients.emptySearchBody') : t('ingredients.emptyBody')}</Body>
          {!query && !isViewer && (
            <AppButton label={t('ingredients.new')} icon="add" onPress={() => router.push('/ingredient/new')} />
          )}
        </Card>
      )}

      <Card tone="gold">
        <SectionHeader eyebrow={t('ingredients.explainerEyebrow')} title={t('ingredients.explainerTitle')} />
        <Body>{t('ingredients.explainerBody')}</Body>
      </Card>
    </>
  );
}

export default function IngredientsScreen() {
  return <Screen><IngredientsCatalog /></Screen>;
}

const styles = StyleSheet.create({
  heading: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 14 },
  headingCopy: { flex: 1, minWidth: 200 },
  search: { flexDirection: 'row', alignItems: 'center', backgroundColor: Brand.white, borderColor: Brand.line, borderWidth: 1, borderRadius: Radius.medium, paddingHorizontal: 14 },
  searchInput: { flex: 1, minHeight: 50, paddingHorizontal: 10, color: Brand.ink, fontSize: 14, fontFamily: Fonts.regular },
  pressed: { opacity: 0.76 },
  row: { gap: 10 },
  rowHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  rowCopy: { flex: 1 },
  rowTitle: { color: Brand.navyDeep, fontSize: 15, fontFamily: Fonts.bold },
  rowMeta: { color: Brand.muted, fontSize: 11, marginTop: 4, fontFamily: Fonts.regular },
  priceWrap: { alignItems: 'flex-end' },
  price: { color: Brand.navy, fontSize: 15, fontFamily: Fonts.extraBold, ...TabularNumbers },
  priceUnit: { color: Brand.muted, fontSize: 10, marginTop: 2, fontFamily: Fonts.regular, ...TabularNumbers },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  allergen: { backgroundColor: '#EDF1F4', borderRadius: Radius.pill, paddingHorizontal: 10, paddingVertical: 5 },
  allergenText: { color: Brand.navySoft, fontSize: 10, fontFamily: Fonts.extraBold },
  empty: { alignItems: 'flex-start', paddingVertical: 28 },
  importActions: { gap: 8 },
});
