/**
 * MANAGER 24/7™ by PARADIM — proprietary software.
 * Copyright © 2026 PARADIM Operations SRL. All rights reserved.
 * Concept author and product director: Marius Paul Nemeșu.
 * See LICENSE-PROPRIETARY.md.
 */

import { Ionicons } from '@expo/vector-icons';
import { type Href, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { ChoiceRow, Select, type SelectOption } from '@/components/inputs';
import { FolderHub, FolderLink, FolderSection } from '@/components/folder-section';
import { RecipeCard } from '@/components/recipe-card';
import { SyncBanner } from '@/components/sync-banner';
import { AppButton, Body, BrandHeader, Card, EmptyStateGraphic, ListSkeleton, Screen, SectionHeader, StatusPill, Title } from '@/components/ui';
import { CATEGORY_LABEL_KEY, RECIPE_CATEGORIES, type RecipeCategory } from '@/constants/categories';
import { CONTACT_EMAIL } from '@/constants/paradim';
import { Brand, Fonts, Radius } from '@/constants/theme';
import { useAuth } from '@/contexts/auth-context';
import { useI18n } from '@/contexts/locale-context';
import { usePreferences } from '@/contexts/preferences-context';
import { useSubscription } from '@/contexts/subscription-context';
import { useWorkspace } from '@/contexts/workspace-context';
import { exportAllergenMenuPdf, exportCookbookExcel, exportCookbookPdf } from '@/lib/recipe-export';
import { recipeMatchesQuery } from '@/lib/production-plan';
import { loadCachedBulkBatches, syncBulkBatches } from '@/lib/production-documents-repository';
import { clearRecipeDraft, loadRecipeDrafts, type RecipeDraftEntry } from '@/lib/recipe-drafts';
import type { BulkBatch } from '@/types/operations';
import type { Recipe } from '@/types/recipe';
import { IngredientsCatalog } from '@/app/(app)/ingredients';

type Filter = RecipeCategory | 'all';
type Sort = 'recent' | 'name' | 'foodCost' | 'portionCost';
const PAGE_SIZE = 6;

const SORTERS: Record<Sort, (a: Recipe, b: Recipe) => number> = {
  recent: (a, b) => b.updatedAt.localeCompare(a.updatedAt),
  name: (a, b) => a.title.localeCompare(b.title, 'ro-RO'),
  foodCost: (a, b) => (b.totals.foodCostPercent ?? -1) - (a.totals.foodCostPercent ?? -1),
  portionCost: (a, b) => b.totals.portionCost - a.totals.portionCost,
};

export default function RecipesScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ section?: string; kind?: string; saved?: string }>();
  const auth = useAuth();
  const userId = auth.user?.id ?? 'demo';
  const { t, locale } = useI18n();
  const { format } = usePreferences();
  const subscription = useSubscription();
  const { isViewer } = subscription;
  const { recipes, catalog, isLoading, error, refresh } = useWorkspace();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [sort, setSort] = useState<Sort>('recent');
  const [isExporting, setIsExporting] = useState(false);
  const [page, setPage] = useState(1);
  const [listKind, setListKind] = useState<'recipes' | 'bulk'>(params.kind === 'bulk' ? 'bulk' : 'recipes');
  const [batches, setBatches] = useState<BulkBatch[]>([]);
  const [bulkError, setBulkError] = useState(false);
  const [drafts, setDrafts] = useState<RecipeDraftEntry[]>([]);

  useEffect(() => {
    setListKind(params.kind === 'bulk' ? 'bulk' : 'recipes');
    setPage(1);
  }, [params.kind, params.saved]);

  useFocusEffect(useCallback(() => {
    let cancelled = false;
    void loadRecipeDrafts(userId).then((stored) => {
      if (!cancelled) setDrafts(stored.sort((a, b) => b.savedAt.localeCompare(a.savedAt)));
    }).catch(() => undefined);
    void loadCachedBulkBatches(userId).then((cached) => {
      if (!cancelled) setBatches(cached);
      return syncBulkBatches(userId);
    }).then((saved) => {
      if (!cancelled) { setBatches(saved); setBulkError(false); }
    }).catch(() => { if (!cancelled) setBulkError(true); });
    return () => { cancelled = true; };
  }, [userId]));


  const exportAll = async (kind: 'pdf' | 'excel' | 'allergens') => {
    setIsExporting(true);
    try {
      const pricesDate = catalog.reduce<string | null>((latest, item) => (
        !latest || item.updatedAt > latest ? item.updatedAt : latest
      ), null);
      const context = {
        t,
        format,
        locale,
        userEmail: CONTACT_EMAIL,
        pricesDate,
        plan: subscription.plan,
      } as const;
      if (kind === 'pdf') await exportCookbookPdf(recipes, context);
      else if (kind === 'allergens') await exportAllergenMenuPdf(recipes, context);
      else await exportCookbookExcel(recipes, context);
    } catch (caught) {
      Alert.alert(
        t('export.failedTitle'),
        caught instanceof Error ? caught.message : t('common.tryAgain'),
      );
    } finally {
      setIsExporting(false);
    }
  };

  const sortOptions: SelectOption<Sort>[] = [
    { value: 'recent', label: t('recipes.sortRecent') },
    { value: 'name', label: t('recipes.sortNameAsc') },
    { value: 'foodCost', label: t('recipes.sortFoodCostDesc') },
    { value: 'portionCost', label: t('recipes.sortPortionCostDesc') },
  ];

  const filterOptions: SelectOption<Filter>[] = useMemo(() => [
    { value: 'all', label: t('recipes.filterAll') },
    ...RECIPE_CATEGORIES
      .filter((category) => recipes.some((recipe) => recipe.category === category))
      .map((category) => ({ value: category as Filter, label: t(CATEGORY_LABEL_KEY[category]) })),
  ], [recipes, t]);

  const filtered = useMemo(() => {
    return recipes
      .filter((recipe) => {
        if (filter !== 'all' && recipe.category !== filter) return false;
        const categoryLabel = recipe.category ? t(CATEGORY_LABEL_KEY[recipe.category]) : '';
        return recipeMatchesQuery(recipe, query, categoryLabel);
      })
      .sort(SORTERS[sort]);
  }, [filter, query, recipes, sort, t]);

  const savedBatches = useMemo(() => batches.filter((batch) => !batch.deletedAt), [batches]);
  const filteredBatches = useMemo(() => savedBatches.filter((batch) => recipeMatchesQuery(batch, query))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)), [savedBatches, query]);

  if (isLoading) {
    return <Screen scroll={false}><ListSkeleton rows={3} /></Screen>;
  }

  const resultCount = listKind === 'recipes' ? filtered.length : filteredBatches.length;
  const pages = Math.max(1, Math.ceil(resultCount / PAGE_SIZE));
  const currentPage = Math.min(page, pages);
  const offset = (currentPage - 1) * PAGE_SIZE;
  const visible = filtered.slice(offset, offset + PAGE_SIZE);
  const visibleBatches = filteredBatches.slice(offset, offset + PAGE_SIZE);

  return (
    <FolderHub
      layout="grid"
      initialFolder={params.section === 'ingredients' ? 'ingredients' : params.section === 'mine' ? 'mine' : undefined}
      navigationKey={params.saved}
      header={(
        <>
          <BrandHeader mini />
          <View style={styles.heading}>
            <Title>{t('tabs.recipes')}</Title>
            <Body>{locale === 'ro' ? 'Creează, găsește și păstrează preparatele tale.' : 'Create, find and keep your dishes.'}</Body>
          </View>
        </>
      )}
      notice={(
        <>
          <SyncBanner />
          {!!error && (
            <Card tone="gold">
              <SectionHeader title={t('recipes.syncErrorTitle')} />
              <Body>{error}</Body>
              <AppButton label={t('common.retry')} variant="secondary" onPress={() => void refresh()} />
            </Card>
          )}
        </>
      )}>
      {!isViewer && (
        <FolderSection id="recipes" icon="restaurant-outline" photo="recipes" accent="gold"
          title={t('tabs.recipes')}
          summary={locale === 'ro' ? 'Creează rețetă, bibliotecă și rețetă bulk' : 'Create a recipe, recipe library and bulk recipe'}>
          <AppButton label={t('recipes.create')} icon="add-circle-outline" fullWidth onPress={() => router.push('/recipe/new')} />
          <FolderLink title={t('recipes.templates')} icon="book-outline" accent="navy"
            summary={locale === 'ro' ? 'Modele pe care le adaptezi și le salvezi' : 'Templates to adapt and save'}
            onPress={() => router.push('/tools/templates' as Href)} />
          <FolderLink title={t('recipes.bulk')} icon="scale-outline" accent="teal"
            summary={locale === 'ro' ? 'Ingrediente, gramaj final și costul lotului' : 'Ingredients, final weight and batch cost'}
            onPress={() => router.push('/tools/bulk' as Href)} />
          <FolderLink title={t('dashboard.toolMenu')} icon="grid-outline" accent="amber"
            onPress={() => router.push('/tools/menu-engineering' as Href)} />
          <FolderLink title={t('dashboard.toolSimulator')} icon="options-outline" accent="green"
            onPress={() => router.push('/tools/simulator' as Href)} />
        </FolderSection>
      )}

      <FolderSection id="mine" icon="checkmark-done-circle-outline" photo="mine" accent="green"
        title={locale === 'ro' ? 'Rețetele mele' : 'My recipes'}
        summary={locale === 'ro' ? `${recipes.length} rețete · ${savedBatches.length} loturi bulk salvate` : `${recipes.length} recipes · ${savedBatches.length} saved bulk batches`}>
        <Body>{locale === 'ro' ? 'Preparatele salvate din editor sau din bibliotecă și loturile bulk finalizate.' : 'Dishes saved from the editor or library and completed bulk batches.'}</Body>
        {!isViewer && drafts.length > 0 && (
          <Card tone="gold">
            <SectionHeader title={locale === 'ro' ? 'Schițe de continuat' : 'Drafts to continue'} />
            <Body>{locale === 'ro' ? 'Păstrate automat pe acest dispozitiv. Finalizează salvarea pentru a le sincroniza.' : 'Automatically kept on this device. Save the recipe to sync it.'}</Body>
            {drafts.slice(0, PAGE_SIZE).map((entry) => (
              <View key={entry.slot} style={{ gap: 6 }}>
                <FolderLink title={entry.draft.title.trim() || (locale === 'ro' ? 'Rețetă fără titlu' : 'Untitled recipe')}
                  icon="create-outline" accent="amber" summary={format.date(entry.savedAt)}
                  onPress={() => {
                    const existing = entry.draft.id && recipes.find((item) => item.id === entry.draft.id);
                    router.push(existing
                      ? { pathname: '/recipe/[id]', params: { id: existing.id } }
                      : { pathname: '/recipe/new', params: { draftSlot: entry.slot } });
                  }} />
                <AppButton label={locale === 'ro' ? 'Șterge schița' : 'Delete draft'} variant="ghost" onPress={() => {
                  Alert.alert(locale === 'ro' ? 'Ștergi schița locală?' : 'Delete this local draft?', entry.draft.title, [
                    { text: t('common.cancel'), style: 'cancel' },
                    { text: locale === 'ro' ? 'Șterge' : 'Delete', style: 'destructive', onPress: () => {
                      void clearRecipeDraft(userId, entry.slot).then(() => setDrafts((current) => current.filter((item) => item.slot !== entry.slot)))
                        .catch(() => Alert.alert(locale === 'ro' ? 'Schița nu a fost ștearsă' : 'Draft was not deleted', t('common.tryAgain')));
                    } },
                  ]);
                }} />
              </View>
            ))}
            {drafts.length > PAGE_SIZE && <Body>{locale === 'ro' ? 'Continuă sau șterge o schiță pentru a vedea următoarele.' : 'Continue or delete a draft to see the next ones.'}</Body>}
          </Card>
        )}
        <ChoiceRow
          options={[
            { value: 'recipes' as const, label: `${t('tabs.recipes')} (${recipes.length})` },
            { value: 'bulk' as const, label: `Bulk (${savedBatches.length})` },
          ]}
          value={listKind}
          onChange={(value) => { setListKind(value); setPage(1); }}
        />
        <View style={styles.search}>
          <Ionicons name="search" size={20} color={Brand.muted} />
          <TextInput
            accessibilityLabel={t('recipes.searchLabel')}
            placeholder={t('recipes.searchPlaceholder')}
            placeholderTextColor="#98A3AD"
            value={query}
            onChangeText={(value) => { setQuery(value); setPage(1); }}
            autoCorrect={false}
            style={styles.searchInput}
          />
        </View>
        {listKind === 'recipes' && (
          <View style={styles.filters}>
            {filterOptions.length > 1 && (
              <View style={styles.filter}>
                <Select label={locale === 'ro' ? 'Categorie' : 'Category'} placeholder={t('recipes.filterAll')} options={filterOptions} value={filter} onChange={(value) => { setFilter(value ?? 'all'); setPage(1); }} />
              </View>
            )}
            {recipes.length > 1 && (
              <View style={styles.filter}>
                <Select label={locale === 'ro' ? 'Ordonare' : 'Sort by'} placeholder={t('recipes.sortRecent')} options={sortOptions} value={sort} onChange={(value) => { setSort(value ?? 'recent'); setPage(1); }} />
              </View>
            )}
          </View>
        )}
        {listKind === 'recipes' && visible.map((recipe) => (
          <RecipeCard compact showSaved key={recipe.id} recipe={recipe} onPress={() => router.push(`/recipe/${recipe.id}`)} />
        ))}
        {listKind === 'bulk' && visibleBatches.map((batch) => (
          <Pressable key={batch.id} accessibilityRole="button" accessibilityLabel={batch.title}
            onPress={() => router.push({ pathname: '/tools/bulk', params: { id: batch.id } })}
            style={({ pressed }) => pressed && styles.pressed}>
            <Card>
              <View style={styles.bulkHeading}>
                <Ionicons name="scale-outline" size={23} color={Brand.tealDeep} />
                <View style={styles.bulkCopy}>
                  <Text style={styles.bulkTitle}>{batch.title}</Text>
                  <Text style={styles.bulkMeta}>{format.date(batch.batchDate)} · {format.number(batch.portions)} {t('production.portions')} · {format.number(batch.finalWeightGrams)} g</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={Brand.navy} />
              </View>
              <StatusPill label={batch.syncState === 'synced' ? (locale === 'ro' ? 'Salvat · sincronizat' : 'Saved · synced') : (locale === 'ro' ? 'Salvat pe dispozitiv' : 'Saved on device')} status="healthy" />
              <Body>{t('card.portionCost')}: {format.money(batch.portionCost)}</Body>
            </Card>
          </Pressable>
        ))}
        {listKind === 'bulk' && bulkError && <Body>{locale === 'ro' ? 'Sunt afișate loturile păstrate pe dispozitiv. Sincronizarea va fi reluată la următoarea deschidere.' : 'Showing batches kept on the device. Sync will retry next time you open this screen.'}</Body>}
        {!resultCount && (
          <Card style={styles.empty}>
            <EmptyStateGraphic kind="recipe" />
            <SectionHeader title={query || (listKind === 'recipes' && filter !== 'all') ? t('recipes.emptySearchTitle') : (locale === 'ro' ? 'Nu ai preparate salvate aici' : 'No saved dishes here yet')} />
            <Body>{query ? t('recipes.emptySearchBody') : (locale === 'ro' ? 'Intră în Rețete, creează sau adaptează un preparat, apoi salvează-l.' : 'Open Recipes, create or adapt a dish, then save it.')}</Body>
          </Card>
        )}
        {pages > 1 && (
          <View style={styles.pagination}>
            <AppButton label={locale === 'ro' ? 'Înapoi' : 'Previous'} icon="chevron-back" variant="ghost" disabled={currentPage === 1} onPress={() => setPage(currentPage - 1)} />
            <Body>{currentPage} / {pages}</Body>
            <AppButton label={locale === 'ro' ? 'Înainte' : 'Next'} icon="chevron-forward" variant="ghost" disabled={currentPage === pages} onPress={() => setPage(currentPage + 1)} />
          </View>
        )}
      </FolderSection>

      <FolderSection id="ingredients" icon="leaf-outline" photo="ingredients" accent="teal"
        title={t('tabs.ingredients')} summary={t('ingredients.subtitle', { count: catalog.length })}>
        <IngredientsCatalog />
      </FolderSection>

      <FolderSection id="exports" icon="document-text-outline" photo="exports" accent="navy"
        title={locale === 'ro' ? 'Exporturi și alergeni' : 'Exports and allergens'}
        summary={locale === 'ro' ? 'PDF, Excel și meniul de alergeni' : 'PDF, Excel and the allergen menu'}>
        <Body>{t('recipes.exportAllHint')}</Body>
        {recipes.some((recipe) => !recipe.isSubRecipe) ? (
          <View style={styles.exportRow}>
            <AppButton label={t('recipes.exportAllPdf')} icon="document-text-outline" variant="secondary" fullWidth disabled={isExporting} onPress={() => void exportAll('pdf')} />
            <AppButton label={t('recipes.exportAllExcel')} icon="grid-outline" variant="secondary" fullWidth disabled={isExporting} onPress={() => void exportAll('excel')} />
            <AppButton label={locale === 'ro' ? 'PDF alergeni · 1169/2011' : 'Allergen PDF · 1169/2011'} icon="warning-outline" variant="secondary" fullWidth disabled={isExporting} onPress={() => void exportAll('allergens')} />
          </View>
        ) : <Body>{locale === 'ro' ? 'Salvează cel puțin un preparat pentru a genera documentele.' : 'Save at least one dish to generate these documents.'}</Body>}
      </FolderSection>
    </FolderHub>
  );
}

const styles = StyleSheet.create({
  heading: { gap: 3 },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  filter: { flex: 1, minWidth: 110 },
  pagination: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  search: { flexDirection: 'row', alignItems: 'center', backgroundColor: Brand.white, borderColor: Brand.line, borderWidth: 1, borderRadius: Radius.medium, paddingHorizontal: 14 },
  searchInput: { flex: 1, minHeight: 50, paddingHorizontal: 10, color: Brand.ink, fontSize: 14, fontFamily: Fonts.regular },
  exportRow: { gap: 10 },
  empty: { alignItems: 'flex-start', paddingVertical: 22 },
  bulkHeading: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  bulkCopy: { flex: 1, gap: 4 },
  bulkTitle: { color: Brand.navyDeep, fontSize: 15, fontFamily: Fonts.extraBold },
  bulkMeta: { color: Brand.muted, fontSize: 10, fontFamily: Fonts.regular },
  pressed: { opacity: 0.76 },
});
