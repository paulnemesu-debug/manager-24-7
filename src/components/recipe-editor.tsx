/**
 * MANAGER 24/7™ by PARADIM — proprietary software.
 * Copyright © 2026 PARADIM Operations SRL. All rights reserved.
 * Concept author and product director: Marius Paul Nemeșu.
 * See LICENSE-PROPRIETARY.md.
 */

import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { prepareRecipePhoto } from '@/lib/recipe-photo';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  LayoutAnimation,
  Platform,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  UIManager,
  View,
  useWindowDimensions,
} from 'react-native';

import { IngredientRow } from '@/components/ingredient-row';
import { RecipeCover } from '@/components/recipe-cover';
import { RecipeNutritionSummary } from '@/components/recipe-nutrition-summary';
import { ChipGroup, ChoiceRow, Select, type SelectOption } from '@/components/inputs';
import {
  AppButton,
  Body,
  Card,
  Field,
  IconButton,
  Screen,
  SectionHeader,
  StatusPill,
  Title,
} from '@/components/ui';
import { ALLERGEN_LABELS, ALLERGENS, type Allergen } from '@/constants/allergens';
import { CATEGORY_LABEL_KEY, RECIPE_CATEGORIES, type RecipeCategory } from '@/constants/categories';
import {
  ROMANIA_VAT_EFFECTIVE_FROM,
  ROMANIA_VAT_LAST_VERIFIED,
  ROMANIA_VAT_OPTIONS,
} from '@/constants/romania-vat';
import { CONTACT_EMAIL, FOOD_COST_TARGETS } from '@/constants/paradim';
import { Brand, Fonts, Radius, TabularNumbers } from '@/constants/theme';
import { useAuth } from '@/contexts/auth-context';
import { useI18n } from '@/contexts/locale-context';
import { usePreferences } from '@/contexts/preferences-context';
import { useSubscription } from '@/contexts/subscription-context';
import { useWorkspace } from '@/contexts/workspace-context';
import type { TranslationKey } from '@/i18n/translations';
import {
  calculateRecipeTotals,
  createEmptyIngredient,
  createEmptyRecipe,
  createSubRecipeIngredient,
  getFoodCostStatus,
  resolveRecipeAllergens,
} from '@/lib/calculations';
import { clearRecipeDraft, loadRecipeDrafts, saveRecipeDraft } from '@/lib/recipe-drafts';
import { isOfflineId, workspaceErrorMessage } from '@/lib/offline-workspace';
import { exportRecipeExcel, exportRecipePdf } from '@/lib/recipe-export';
import { pricesUpdatedAt, recipesUsingSubRecipe } from '@/lib/recipe-graph';
import { listRecipeVersions, RecipeSaveIncompleteError, type RecipeVersion } from '@/lib/recipes-repository';
import {
  aggregateRecipeAdditives,
  calculateRecipeNutrition,
  enrichIngredientNutrition,
  enrichRecipeNutrition,
  DECLARED_NUTRIENT_KEYS,
  normalizeIngredientNutrition,
  normalizeRecipeCompliance,
  type NutrientKey,
  type RecipeNutritionResult,
} from '@/lib/nutrition';
import type { IngredientDraft, PriceUnit, Recipe, RecipeDraft } from '@/types/recipe';

const priceUnits: readonly PriceUnit[] = ['kg', 'l', 'buc'];
const EDITOR_TABS = ['ingredients', 'cost', 'nutrition', 'compliance'] as const;
type EditorTab = (typeof EDITOR_TABS)[number];

if (Platform.OS === 'android') {
  UIManager.setLayoutAnimationEnabledExperimental?.(true);
}

const NUTRIENT_LABEL_KEYS: Record<NutrientKey, TranslationKey> = {
  energyKj: 'nutrition.energyKj',
  energyKcal: 'nutrition.energyKcal',
  fat: 'nutrition.fat',
  saturates: 'nutrition.saturates',
  carbohydrates: 'nutrition.carbohydrates',
  sugars: 'nutrition.sugars',
  fibre: 'nutrition.fibre',
  protein: 'nutrition.protein',
  salt: 'nutrition.salt',
};

const NUTRIENT_UNITS: Record<NutrientKey, string> = {
  energyKj: 'kJ',
  energyKcal: 'kcal',
  fat: 'g',
  saturates: 'g',
  carbohydrates: 'g',
  sugars: 'g',
  fibre: 'g',
  protein: 'g',
  salt: 'g',
};

function toNumber(value: string) {
  return Number(value.replace(',', '.').replace(/[^0-9.-]/g, '')) || 0;
}

function draftFromRecipe(recipe?: Recipe, defaultVatPercent = 11): RecipeDraft {
  if (!recipe) return createEmptyRecipe(defaultVatPercent);
  return {
    id: recipe.id,
    expectedUpdatedAt: isOfflineId(recipe.id) ? undefined : recipe.serverUpdatedAt ?? recipe.updatedAt,
    title: recipe.title,
    category: recipe.category,
    servings: recipe.servings,
    // Câmpurile rămân în model pentru compatibilitate cu înregistrările vechi,
    // dar scăzământul se introduce exclusiv pe fiecare ingredient.
    cookingMethod: 'none',
    cookingLossPercent: 0,
    salePriceGross: recipe.salePriceGross,
    vatPercent: recipe.vatPercent,
    targetFoodCost: recipe.targetFoodCost,
    isSubRecipe: recipe.isSubRecipe,
    yieldQuantity: recipe.yieldQuantity,
    yieldUnit: recipe.yieldUnit,
    ingredients: recipe.ingredients.map((ingredient) => ({
      ...ingredient,
      allergensConfirmed: ingredient.allergensConfirmed ?? false,
      additives: ingredient.additives ?? [],
      nutrition: normalizeIngredientNutrition(ingredient.nutrition),
    })),
    manualAllergens: recipe.manualAllergens,
    compliance: normalizeRecipeCompliance(recipe.compliance),
    photoPath: recipe.photoPath ?? null,
    photoUri: recipe.photoUrl ?? null,
  };
}

export function RecipeEditor({
  recipe,
  initialDraft,
  draftSlot,
}: {
  recipe?: Recipe;
  initialDraft?: RecipeDraft;
  draftSlot?: string;
}) {
  const router = useRouter();
  const auth = useAuth();
  const draftUserId = auth.user?.id ?? 'demo';
  const storageSlot = draftSlot ?? recipe?.id ?? (initialDraft?.compliance?.templateId ? 'template:' + initialDraft.compliance.templateId : 'new');
  const { t, locale } = useI18n();
  const { format, defaultVatPercent } = usePreferences();
  const { saveRecipe, removeRecipe, catalog, recipes, subRecipes, refresh } = useWorkspace();
  const subscription = useSubscription();
  const { width } = useWindowDimensions();
  const compactEditor = width < 680;
  const [draft, setDraft] = useState<RecipeDraft>(() => enrichRecipeNutrition(initialDraft ?? draftFromRecipe(recipe, defaultVatPercent)));
  const [isSaving, setIsSaving] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [activeTab, setActiveTab] = useState<EditorTab>('ingredients');
  const [photoBusy, setPhotoBusy] = useState<'camera' | 'library' | null>(null);
  const [versions, setVersions] = useState<RecipeVersion[]>([]);
  const [draftReady, setDraftReady] = useState(false);
  const [draftNotice, setDraftNotice] = useState<string | null>(null);
  const draftClosed = useRef(false);
  const draftSeed = useRef<RecipeDraft | null>(null);
  const draftBaseline = useRef<string | null>(null);
  useEffect(() => { draftSeed.current = enrichRecipeNutrition(initialDraft ?? draftFromRecipe(recipe, defaultVatPercent)); }, [initialDraft, recipe, defaultVatPercent]);

  useEffect(() => {
    let active = true;
    draftClosed.current = false;
    setDraftReady(false);
    void loadRecipeDrafts(draftUserId).then((entries) => {
      if (!active) return;
      const stored = entries.find((item) => item.slot === storageSlot);
      draftBaseline.current = JSON.stringify(draftSeed.current);
      setDraft(enrichRecipeNutrition(stored?.draft ?? draftSeed.current ?? createEmptyRecipe()));
      setDraftNotice(stored ? 'recovered' : null);
    }).catch(() => { if (active) setDraftNotice('error'); }).finally(() => { if (active) setDraftReady(true); });
    return () => { active = false; };
  }, [draftUserId, storageSlot]);

  useEffect(() => {
    if (!draftReady || draftClosed.current || subscription.isViewer) return;
    let active = true;
    if (recipe && JSON.stringify(draft) === draftBaseline.current) {
      void clearRecipeDraft(draftUserId, storageSlot).then(() => { if (active) setDraftNotice(null); })
        .catch(() => { if (active) setDraftNotice('error'); });
      return () => { active = false; };
    }
    void saveRecipeDraft(draftUserId, storageSlot, draft).then((savedAt) => {
      if (active && savedAt) setDraftNotice((current) => current === 'recovered' ? current : 'saved');
    }).catch(() => { if (active) setDraftNotice('error'); });
    return () => { active = false; };
  }, [draft, draftReady, draftUserId, storageSlot, subscription.isViewer, recipe]);


  useEffect(() => {
    if (!recipe) return;
    let cancelled = false;
    void listRecipeVersions(recipe.id)
      .then((items) => { if (!cancelled) setVersions(items); })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [recipe]);

  const totals = useMemo(() => calculateRecipeTotals(draft), [draft]);
  const hasDraftConflict = Boolean(recipe && !isOfflineId(recipe.id) && draft.expectedUpdatedAt
    && draft.expectedUpdatedAt !== (recipe.serverUpdatedAt ?? recipe.updatedAt));
  const status = getFoodCostStatus(totals.foodCostPercent, draft.targetFoodCost);
  const allergens = useMemo(
    () => resolveRecipeAllergens(draft.ingredients, draft.manualAllergens),
    [draft.ingredients, draft.manualAllergens],
  );
  const nutrition = useMemo(() => calculateRecipeNutrition(draft), [draft]);
  const compliance = useMemo(() => normalizeRecipeCompliance(draft.compliance), [draft.compliance]);
  const additives = useMemo(() => aggregateRecipeAdditives(draft), [draft]);

  /** Semipreparatele care nu ar crea o buclă dacă sunt adăugate în rețeta curentă. */
  const availableSubRecipes = useMemo(() => {
    if (!recipe) return subRecipes;
    const ancestors = new Set(recipesUsingSubRecipe(recipes, recipe.id).map((item) => item.id));
    return subRecipes.filter((item) => item.id !== recipe.id && !ancestors.has(item.id));
  }, [recipe, recipes, subRecipes]);

  const categoryOptions: SelectOption<RecipeCategory>[] = RECIPE_CATEGORIES.map((category) => ({
    value: category,
    label: t(CATEGORY_LABEL_KEY[category]),
  }));
  const targetOptions: SelectOption<string>[] = FOOD_COST_TARGETS.map((target) => ({
    value: String(target),
    label: `${target}%`,
  }));
  const yieldUnitOptions: SelectOption<PriceUnit>[] = priceUnits.map((unit) => ({
    value: unit,
    label: unit,
  }));
  const allergenOptions: SelectOption<Allergen>[] = ALLERGENS.map((allergen) => ({
    value: allergen,
    label: ALLERGEN_LABELS[locale][allergen],
  }));
  const subRecipeOptions: SelectOption<string>[] = availableSubRecipes.map((item) => ({
    value: item.id,
    label: item.title,
    description: t('editor.subRecipeUnitCost', {
      price: format.money(item.totals.totalCost / Math.max(0.001, item.yieldQuantity)),
      unit: item.yieldUnit,
    }),
  }));
  const catalogOptions: SelectOption<string>[] = catalog
    .filter((entry) => entry.active)
    .map((entry) => ({
      value: entry.id,
      label: entry.name,
      description: `${format.money(entry.purchasePrice)} / ${entry.priceUnit}`,
    }));

  const setField = <K extends keyof RecipeDraft>(field: K, value: RecipeDraft[K]) => {
    if (isSaving) return;
    setDraft((current) => ({ ...current, [field]: value }));
  };

  const setCompliance = <K extends keyof typeof compliance>(field: K, value: (typeof compliance)[K]) => {
    if (isSaving) return;
    setDraft((current) => ({
      ...current,
      compliance: { ...normalizeRecipeCompliance(current.compliance), [field]: value },
    }));
  };

  const updateIngredient = (id: string, change: Partial<IngredientDraft>) => {
    if (isSaving) return;
    setDraft((current) => ({
      ...current,
      ingredients: current.ingredients.map((ingredient) => (
        ingredient.id === id ? enrichIngredientNutrition({ ...ingredient, ...change }) : ingredient
      )),
    }));
  };

  const addIngredient = (ingredient: IngredientDraft) => {
    if (isSaving) return;
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
    setDraft((current) => ({ ...current, ingredients: [...current.ingredients, enrichIngredientNutrition(ingredient)] }));
  };

  const addFromCatalog = (catalogId: string | null) => {
    const entry = catalog.find((item) => item.id === catalogId);
    if (!entry) return;
    const base = createEmptyIngredient(draft.ingredients.length);
    addIngredient({
      ...base,
      catalogId: entry.id,
      name: entry.name,
      purchasePrice: entry.purchasePrice,
      priceUnit: entry.priceUnit,
      unit: entry.priceUnit === 'kg' ? 'g' : entry.priceUnit === 'l' ? 'ml' : 'buc',
      lossPercent: entry.defaultLossPercent,
      allergens: entry.allergens,
      allergensConfirmed: entry.allergensConfirmed,
      additives: entry.additives,
      nutrition: entry.nutrition,
    });
  };

  const addSubRecipe = (subRecipeId: string | null) => {
    const source = availableSubRecipes.find((item) => item.id === subRecipeId);
    if (!source) return;
    addIngredient(createSubRecipeIngredient(source, draft.ingredients.length));
  };

  const removeIngredient = (id: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
    setDraft((current) => ({
      ...current,
      ingredients: current.ingredients.filter((ingredient) => ingredient.id !== id),
    }));
  };

  const applyPickedPhoto = async (picked: ImagePicker.ImagePickerResult) => {
    const photoUri = await prepareRecipePhoto(picked, draftUserId);
    if (!photoUri) return;
    setDraft((current) => ({ ...current, photoUri, photoAction: 'replace' }));
    await Haptics.selectionAsync().catch(() => undefined);
  };

  const takePhoto = async () => {
    if (isSaving || photoBusy) return;
    setPhotoBusy('camera');
    try {
      const permission = Platform.OS === 'web' ? { granted: true } : await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(t('editor.cameraPermissionTitle'), t('editor.cameraPermissionBody'));
        return;
      }
      const picked = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [16, 9],
        quality: 0.9,
      });
      await applyPickedPhoto(picked);
    } catch {
      Alert.alert(t('editor.photoFailedTitle'), t('editor.photoCameraFailedBody'));
    } finally {
      setPhotoBusy(null);
    }
  };

  const pickPhoto = async () => {
    if (isSaving || photoBusy) return;
    setPhotoBusy('library');
    try {
      const permission = Platform.OS === 'web' ? { granted: true } : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(t('editor.photoPermissionTitle'), t('editor.photoPermissionBody'));
        return;
      }
      const picked = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [16, 9],
        quality: 0.9,
      });
      await applyPickedPhoto(picked);
    } catch {
      Alert.alert(t('editor.photoFailedTitle'), t('editor.photoFailedBody'));
    } finally {
      setPhotoBusy(null);
    }
  };

  const submit = async () => {
    if (isSaving || photoBusy) return;
    if (!draft.title.trim()) {
      setActiveTab('ingredients');
      Alert.alert(t('editor.missingTitleTitle'), t('editor.missingTitleBody'));
      return;
    }
    if (!draft.ingredients.some((ingredient) => ingredient.name.trim())) {
      setActiveTab('ingredients');
      Alert.alert(t('editor.missingIngredientsTitle'), t('editor.missingIngredientsBody'));
      return;
    }
    const invalidGramIngredient = draft.ingredients.find((ingredient) => (
      ingredient.name.trim() && (!Number.isFinite(ingredient.quantity) || ingredient.quantity <= 0)
    ));
    if (invalidGramIngredient) {
      setActiveTab('ingredients');
      Alert.alert('Gramaj invalid', `Completează un gramaj mai mare decât zero pentru „${invalidGramIngredient.name}”.`);
      return;
    }
    if (draft.compliance?.finalWeightGrams !== null && draft.compliance?.finalWeightGrams !== undefined
      && (!Number.isFinite(draft.compliance.finalWeightGrams) || draft.compliance.finalWeightGrams <= 0)) {
      setActiveTab('nutrition');
      Alert.alert('Greutate finală invalidă', 'Greutatea finală trebuie să fie mai mare decât zero.');
      return;
    }

    setIsSaving(true);
    try {
      const saved = await saveRecipe(draft);
      draftClosed.current = true;
      await clearRecipeDraft(draftUserId, storageSlot).catch(() => undefined);
      await Haptics.notificationAsync(
        status === 'critical'
          ? Haptics.NotificationFeedbackType.Warning
          : Haptics.NotificationFeedbackType.Success,
      ).catch(() => undefined);
      router.replace({ pathname: '/(app)/recipes', params: { section: 'mine', saved: saved.id } });
    } catch (caught) {
      if (caught instanceof RecipeSaveIncompleteError) setDraft(caught.retryDraft);
      if (/RECIPE_CONFLICT/.test(workspaceErrorMessage(caught))) void refresh();
      Alert.alert(
        t('editor.saveFailed'),
        /RECIPE_CONFLICT/.test(workspaceErrorMessage(caught))
          ? (locale === 'ro' ? 'Rețeta a fost modificată pe alt dispozitiv. Schița ta este păstrată. Revino în Rețetele mele, actualizează datele și compară modificările înainte de salvare.' : 'This recipe changed on another device. Your draft is kept. Return to My recipes, refresh and compare changes before saving.')
          : workspaceErrorMessage(caught, t('common.tryAgain')),
      );
    } finally {
      setIsSaving(false);
    }
  };

  const duplicate = async () => {
    setIsSaving(true);
    try {
      const copy = await saveRecipe({
        ...draft,
        id: undefined,
        title: t('editor.duplicateTitle', { title: draft.title.trim() || t('editor.headingNew') }),
      });
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
      router.replace(`/recipe/${copy.id}`);
    } catch (caught) {
      Alert.alert(
        t('editor.duplicateFailed'),
        workspaceErrorMessage(caught, t('common.tryAgain')),
      );
    } finally {
      setIsSaving(false);
    }
  };

  const confirmDelete = () => {
    if (!recipe) return;
    Alert.alert(t('editor.deleteConfirmTitle'), t('editor.deleteConfirmBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
          onPress: () => {
            void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => undefined);
            void removeRecipe(recipe.id)
            .then(() => router.replace('/(app)/recipes'))
            .catch((caught) => Alert.alert(
              t('editor.deleteFailed'),
              workspaceErrorMessage(caught, t('common.tryAgain')),
            ));
        },
      },
    ]);
  };

  const exportSheet = async (kind: 'pdf' | 'excel') => {
    if (!recipe) return;
    setIsExporting(true);
    try {
      const context = {
        t,
        format,
        locale,
        userEmail: CONTACT_EMAIL,
        pricesDate: pricesUpdatedAt(recipe, recipes, catalog) ?? recipe.updatedAt,
        plan: subscription.plan,
      };
      if (kind === 'pdf') await exportRecipePdf(recipe, context);
      else await exportRecipeExcel(recipe, context);
    } catch (caught) {
      Alert.alert(
        t('export.failedTitle'),
        workspaceErrorMessage(caught, t('common.tryAgain')),
      );
    } finally {
      setIsExporting(false);
    }
  };

  const statusLabel = status === 'healthy' ? t('editor.statusHealthy')
    : status === 'watch' ? t('editor.statusWatch')
      : status === 'critical' ? t('editor.statusCritical')
        : t('editor.statusIncomplete');

  const statusColor = status === 'critical' ? Brand.red
    : status === 'watch' ? Brand.amber
      : status === 'healthy' ? Brand.green
        : Brand.muted;

  const tabLabels: Record<EditorTab, string> = {
    ingredients: t('editor.tabIngredients'),
    cost: t('editor.tabCost'),
    nutrition: t('editor.tabNutrition'),
    compliance: t('editor.tabCompliance'),
  };

  const restoreVersion = (version: RecipeVersion) => {
    Alert.alert(
      t('editor.restoreVersionTitle'),
      t('editor.restoreVersionBody', { version: version.versionNumber }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('editor.restoreVersionAction'),
          onPress: () => {
            setDraft(enrichRecipeNutrition(version.draft));
            setActiveTab('cost');
            void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
          },
        },
      ],
    );
  };

  if (!draftReady) return <Screen><Title>{locale === 'ro' ? 'Se pregătește rețeta…' : 'Preparing recipe…'}</Title></Screen>;
  return (
    <Screen
      footer={(
        <View style={styles.stickyRow}>
          <View style={styles.stickyMetric}>
            <View style={styles.stickyMetricHeading}>
              <View style={[styles.stickyDot, { backgroundColor: statusColor }]} />
              <Text style={styles.stickyLabel}>{t('editor.metricFoodCost')}</Text>
            </View>
            <Text style={[styles.stickyValue, { color: statusColor }]} numberOfLines={1} adjustsFontSizeToFit>
              {format.percent(totals.foodCostPercent)}
            </Text>
          </View>
          <View style={styles.stickyDivider} />
          <View style={styles.stickyMetric}>
            <Text style={styles.stickyLabel}>{t('editor.recommendedLabel')}</Text>
            <Text style={styles.stickyValue} numberOfLines={1} adjustsFontSizeToFit>
              {format.money(totals.recommendedPriceGross)}
            </Text>
          </View>
          <AppButton
            label={compactEditor ? t('common.save') : recipe ? t('editor.saveEdit') : t('editor.saveNew')}
            icon="checkmark"
            loading={isSaving}
            disabled={subscription.isViewer || !draftReady || Boolean(photoBusy) || hasDraftConflict}
            onPress={() => void submit()}
          />
        </View>
      )}>
      <View style={styles.topBar}>
        <IconButton icon="arrow-back" label={t('common.back')} onPress={() => router.back()} />
        <Text style={styles.topTitle}>
          {recipe ? t('editor.titleEdit') : t('editor.titleNew')}
        </Text>
        {recipe && !subscription.isViewer ? (
          <IconButton icon="copy-outline" label={t('editor.duplicate')} onPress={() => void duplicate()} />
        ) : (
          <View style={styles.topSpacer} />
        )}
      </View>

      {hasDraftConflict && recipe && !subscription.isViewer && (
        <Card tone="gold">
          <SectionHeader title={locale === 'ro' ? 'Rețeta din cloud s-a schimbat' : 'The cloud recipe has changed'} />
          <Body>{locale === 'ro'
            ? `Schița ta: ${format.money(totals.portionCost)} / porție. Cloud: ${format.money(recipe.totals.portionCost)} / porție, actualizat ${format.date(recipe.updatedAt)}. Verifică ingredientele și prețurile din ambele versiuni.`
            : `Your draft: ${format.money(totals.portionCost)} / portion. Cloud: ${format.money(recipe.totals.portionCost)} / portion, updated ${format.date(recipe.updatedAt)}. Check ingredients and prices in both versions.`}</Body>
          <AppButton label={locale === 'ro' ? 'Vezi ingredientele din cloud' : 'View cloud ingredients'} variant="ghost" onPress={() => {
            Alert.alert(recipe.title, `${locale === 'ro' ? 'Preț de vânzare' : 'Selling price'}: ${format.money(recipe.salePriceGross)}\n\n${recipe.ingredients.map((item) => `${item.name}: ${format.number(item.quantity)} ${item.unit} · ${format.money(item.purchasePrice)}/${item.priceUnit} · ${format.percent(item.lossPercent)}`).join('\n')}`);
          }} />
          <AppButton label={locale === 'ro' ? 'Am comparat · păstrez schița' : 'Compared · keep my draft'} variant="secondary" onPress={() => {
            Alert.alert(locale === 'ro' ? 'Păstrezi modificările tale?' : 'Keep your changes?', locale === 'ro' ? 'La salvare, schița va înlocui versiunea comparată din cloud. O modificare ulterioară pe alt dispozitiv va fi verificată din nou.' : 'Saving will replace the cloud version you compared. Further changes from another device will be checked again.', [
              { text: t('common.cancel'), style: 'cancel' },
              { text: locale === 'ro' ? 'Păstrează' : 'Keep', onPress: () => setDraft((current) => ({ ...current, expectedUpdatedAt: recipe.serverUpdatedAt ?? recipe.updatedAt })) },
            ]);
          }} />
          <AppButton label={locale === 'ro' ? 'Descarcă versiunea din cloud în editor' : 'Load cloud version into editor'} variant="ghost" onPress={() => {
            Alert.alert(locale === 'ro' ? 'Înlocuiești schița locală?' : 'Replace local draft?', locale === 'ro' ? 'Modificările nesalvate vor fi înlocuite cu versiunea afișată din cloud.' : 'Unsaved changes will be replaced by the displayed cloud version.', [
              { text: t('common.cancel'), style: 'cancel' },
              { text: locale === 'ro' ? 'Înlocuiește' : 'Replace', onPress: () => setDraft(draftFromRecipe(recipe, defaultVatPercent)) },
            ]);
          }} />
        </Card>
      )}
      {draftNotice && !subscription.isViewer && (
        <Card tone={draftNotice === 'error' ? 'gold' : 'soft'}>
          <Body>{locale === 'ro'
            ? draftNotice === 'error' ? 'Schița nu poate fi păstrată pe dispozitiv. Salvează rețeta înainte să închizi.' : draftNotice === 'recovered' ? 'Schiță recuperată. Modificările se păstrează automat pe acest dispozitiv până salvezi rețeta.' : 'Schiță salvată automat pe dispozitiv. Salvează rețeta pentru a o adăuga în Rețetele mele.'
            : draftNotice === 'error' ? 'Cannot keep this draft on the device. Save the recipe before closing.' : draftNotice === 'recovered' ? 'Draft recovered. Changes are kept on this device until you save the recipe.' : 'Draft saved on this device. Save the recipe to add it to My recipes.'}</Body>
        </Card>
      )}

      {subscription.isViewer && (
        <Card tone="gold">
          <Body>{t('editor.viewerBanner')}</Body>
        </Card>
      )}

      {!compactEditor && <View>
        <Title>{recipe ? recipe.title : t('editor.headingNew')}</Title>
        <Body>{t('editor.intro')}</Body>
      </View>}

      {compactEditor && (
        <View style={styles.stepNav} accessibilityRole="tablist">
          {EDITOR_TABS.map((tab) => (
            <Pressable
              key={tab}
              accessibilityRole="tab"
              accessibilityState={{ selected: activeTab === tab }}
              accessibilityLabel={tabLabels[tab]}
              onPress={() => setActiveTab(tab)}
              style={({ pressed }) => [
                styles.step,
                activeTab === tab && styles.stepActive,
                pressed && styles.methodOptionPressed,
              ]}>
              <Text
                numberOfLines={1}
                adjustsFontSizeToFit
                style={[styles.stepText, activeTab === tab && styles.stepTextActive]}>
                {tabLabels[tab]}
              </Text>
            </Pressable>
          ))}
        </View>
      )}

      {compactEditor && activeTab !== 'nutrition' && nutrition.ingredientCount > 0 && (
        <RecipeNutritionSummary recipe={draft} onReview={() => setActiveTab('nutrition')} />
      )}

      {(!compactEditor || activeTab === 'ingredients') && <Card>
        <SectionHeader eyebrow="01" title={t('editor.section1')} />
        <Field
          label={t('editor.fieldTitle')}
          placeholder={t('editor.fieldTitlePlaceholder')}
          value={draft.title}
          onChangeText={(value) => setField('title', value)}
        />
        <RecipeCover
          uri={draft.photoUri}
          category={draft.category}
          foodCost={format.percent(totals.foodCostPercent)}
        />
        <View style={styles.photoActions}>
          <AppButton
            label={t('editor.photoTake')}
            icon="camera-outline"
            variant="secondary"
            loading={photoBusy === 'camera'}
            disabled={photoBusy !== null || isSaving}
            onPress={() => void takePhoto()}
          />
          <AppButton
            label={t('editor.photoPick')}
            icon="images-outline"
            variant="secondary"
            loading={photoBusy === 'library'}
            disabled={photoBusy !== null || isSaving}
            onPress={() => void pickPhoto()}
          />
          {!!draft.photoUri && (
            <AppButton
              label={t('editor.photoRemove')}
              icon="trash-outline"
              variant="ghost"
              disabled={isSaving || photoBusy !== null}
              onPress={() => setDraft((current) => ({ ...current, photoUri: null, photoAction: 'remove' }))}
            />
          )}
        </View>
        <Select
          label={t('editor.fieldCategory')}
          hint={t('editor.fieldCategoryHint')}
          placeholder={t('category.none')}
          value={draft.category}
          options={categoryOptions}
          allowClear
          onChange={(value) => setField('category', value)}
        />
        <View style={styles.fieldRow}>
          <Field
            style={styles.rowField}
            label={t('editor.fieldServings')}
            keyboardType="decimal-pad"
            value={String(draft.servings)}
            onChangeText={(value) => setField('servings', Math.max(1, toNumber(value)))}
          />
        </View>
      </Card>}

      {(!compactEditor || activeTab === 'ingredients') && <Card>
        <SectionHeader
          eyebrow="02"
          title={t('editor.section3')}
          action={(
            <IconButton
              icon="add"
              label={t('editor.addIngredient')}
              onPress={() => addIngredient(createEmptyIngredient(draft.ingredients.length))}
            />
          )}
        />
        <Body>{t('editor.section3Body')}</Body>

        {catalogOptions.length > 0 && (
          <Select
            label={t('editor.catalogPick')}
            placeholder={t('editor.catalogPlaceholder')}
            value={null}
            options={catalogOptions}
            onChange={addFromCatalog}
          />
        )}

        {draft.ingredients.map((ingredient, index) => (
          <IngredientRow
            key={ingredient.id}
            ingredient={ingredient}
            index={index}
            catalog={catalog}
            canRemove={draft.ingredients.length > 1}
            onChange={(change) => updateIngredient(ingredient.id, change)}
            onRemove={() => removeIngredient(ingredient.id)}
          />
        ))}

        <AppButton
          label={t('editor.addIngredient')}
          icon="add"
          variant="secondary"
          fullWidth
          onPress={() => addIngredient(createEmptyIngredient(draft.ingredients.length))}
        />

        {subRecipeOptions.length > 0 ? (
          <Select
            label={t('editor.subRecipePick')}
            placeholder={t('editor.subRecipePlaceholder')}
            value={null}
            options={subRecipeOptions}
            onChange={addSubRecipe}
          />
        ) : (
          <Body>{t('editor.subRecipeEmpty')}</Body>
        )}
      </Card>}

      {(!compactEditor || activeTab === 'cost') && <Card>
        <SectionHeader eyebrow="02" title={t('editor.tabCost')} />
        <View style={styles.fieldRow}>
          <Field
            style={styles.rowField}
            label={t('editor.fieldSalePrice')}
            hint={t('editor.recommendedInline', {
              price: format.money(totals.recommendedPriceGross),
            })}
            keyboardType="decimal-pad"
            value={String(draft.salePriceGross)}
            onChangeText={(value) => setField('salePriceGross', toNumber(value))}
          />
        </View>
        <AppButton
          label={t('editor.useRecommended')}
          icon="pricetag-outline"
          variant="secondary"
          onPress={() => setField('salePriceGross', totals.recommendedPriceGross)}
        />
        <ChoiceRow
          label={t('editor.fieldTarget')}
          options={targetOptions}
          value={String(draft.targetFoodCost)}
          onChange={(value) => setField('targetFoodCost', Number(value))}
        />
        {!FOOD_COST_TARGETS.includes(draft.targetFoodCost as (typeof FOOD_COST_TARGETS)[number]) && (
          <Field
            label={t('editor.targetCustom')}
            keyboardType="decimal-pad"
            value={String(draft.targetFoodCost)}
            onChangeText={(value) => setField('targetFoodCost', toNumber(value))}
          />
        )}
        <VatRatePicker value={draft.vatPercent} onChange={(value) => setField('vatPercent', value)} />
        <SectionHeader eyebrow="03" title={t('editor.sectionYield')} />
        <View style={styles.switchRow}>
          <View style={styles.switchCopy}>
            <Text style={styles.switchLabel}>{t('editor.isSubRecipe')}</Text>
            <Text style={styles.switchHint}>{t('editor.isSubRecipeHint')}</Text>
          </View>
          <Switch
            value={draft.isSubRecipe}
            onValueChange={(value) => setField('isSubRecipe', value)}
            trackColor={{ true: Brand.gold, false: Brand.line }}
          />
        </View>
        {draft.isSubRecipe && (
          <View style={styles.fieldRow}>
            <Field
              style={styles.rowField}
              label={t('editor.yieldQuantity')}
              hint={t('editor.yieldHint')}
              keyboardType="decimal-pad"
              value={String(draft.yieldQuantity)}
              onChangeText={(value) => setField('yieldQuantity', Math.max(0.001, toNumber(value)))}
            />
            <View style={styles.rowField}>
              <ChoiceRow
                label={t('editor.yieldUnit')}
                options={yieldUnitOptions}
                value={draft.yieldUnit}
                onChange={(value) => setField('yieldUnit', value)}
              />
            </View>
          </View>
        )}
      </Card>}

      {(!compactEditor || activeTab === 'compliance') && <Card>
        <SectionHeader eyebrow="04" title={t('editor.sectionAllergens')} />
        <Body>{t('editor.allergensAuto')}</Body>
        <View style={styles.allergenSummary}>
          {allergens.length ? allergens.map((allergen) => (
            <View key={allergen} style={styles.allergenPill}>
              <Text style={styles.allergenText}>{ALLERGEN_LABELS[locale][allergen]}</Text>
            </View>
          )) : <Body>{t('editor.allergensNone')}</Body>}
        </View>
        <Body>{t('editor.allergensManualHint')}</Body>
        <ChipGroup
          label={t('editor.allergensManual')}
          options={allergenOptions}
          selected={draft.manualAllergens}
          onToggle={(allergen) => setDraft((current) => ({
            ...current,
            manualAllergens: current.manualAllergens.includes(allergen)
              ? current.manualAllergens.filter((item) => item !== allergen)
              : [...current.manualAllergens, allergen],
          }))}
        />
      </Card>}

      {(!compactEditor || activeTab === 'nutrition') && <Card>
        <SectionHeader
          eyebrow="05"
          title={t('nutrition.sectionRecipe')}
          action={(
            <StatusPill
              label={nutrition.complete ? t('nutrition.complete') : t('nutrition.needsReview')}
              status={nutrition.complete ? 'healthy' : 'watch'}
            />
          )}
        />
        <Body>{t('nutrition.recipeHint')}</Body>
        <StatusPill
          label={t('nutrition.dataReadiness', { score: nutrition.precisionScore })}
          status={nutrition.precisionScore >= 85 ? 'healthy' : nutrition.precisionScore >= 60 ? 'watch' : 'critical'}
        />
        {!!compliance.sourceReference && (
          <View style={styles.sourceBox}>
            <Ionicons name="document-text-outline" size={17} color={Brand.navy} />
            <Text style={styles.sourceText}>{compliance.sourceReference}</Text>
          </View>
        )}
        <View style={styles.fieldRow}>
          <Field
            style={styles.rowField}
            label={t('nutrition.finalWeight')}
            hint={t('nutrition.finalWeightHint')}
            keyboardType="decimal-pad"
            value={compliance.finalWeightGrams === null ? '' : String(compliance.finalWeightGrams)}
            onChangeText={(value) => setCompliance('finalWeightGrams', toNumber(value) || null)}
          />
          <View style={[styles.rowField, styles.measuredCard]}>
            <View style={styles.switchCopy}>
              <Text style={styles.switchLabel}>{t('nutrition.weightMeasured')}</Text>
              <Text style={styles.switchHint}>{t('nutrition.weightMeasuredHint')}</Text>
            </View>
            <Switch
              value={compliance.finalWeightMeasured}
              onValueChange={(value) => setCompliance('finalWeightMeasured', value)}
              trackColor={{ true: Brand.green, false: Brand.line }}
            />
          </View>
        </View>
        {!nutrition.finalWeightMeasured && (
          <View style={styles.warningBox}>
            <Ionicons name="warning-outline" size={18} color={Brand.amber} />
            <Text style={styles.warningText}>{t('nutrition.weightEstimateWarning')}</Text>
          </View>
        )}

        <NutritionSummary result={nutrition} />
        {!!nutrition.missingIngredients.length && <Body>{t('nutrition.missingIngredients', { names: nutrition.missingIngredients.join(', ') })}</Body>}
        {!!nutrition.incompatibleIngredients.length && <Body>{t('nutrition.incompatibleIngredients', { names: nutrition.incompatibleIngredients.join(', ') })}</Body>}
        {!!nutrition.approximateKeys.length && <Body>{t('nutrition.approximationNote')}</Body>}

        {nutrition.missingRequired.length > 0 && (
          <View style={styles.warningBox}>
            <Ionicons name="alert-circle-outline" size={18} color={Brand.amber} />
            <Text style={styles.warningText}>
              {t('nutrition.missingFields', {
                fields: nutrition.missingRequired.map((key) => t(NUTRIENT_LABEL_KEYS[key])).join(', '),
              })}
            </Text>
          </View>
        )}
        {nutrition.unconfirmedIngredientCount > 0 && (
          <Body>{t('nutrition.unconfirmedIngredients', { count: nutrition.unconfirmedIngredientCount })}</Body>
        )}

        <View style={styles.switchRow}>
          <View style={styles.switchCopy}>
            <Text style={styles.switchLabel}>{t('nutrition.defrosted')}</Text>
            <Text style={styles.switchHint}>{t('nutrition.defrostedHint')}</Text>
          </View>
          <Switch
            value={compliance.isDefrosted}
            onValueChange={(value) => setCompliance('isDefrosted', value)}
            trackColor={{ true: Brand.gold, false: Brand.line }}
          />
        </View>
        <Field
          label={t('nutrition.notes')}
          multiline
          value={compliance.nutritionNotes ?? ''}
          onChangeText={(value) => setCompliance('nutritionNotes', value.trim() ? value : null)}
        />
        <View style={styles.additivesBox}>
          <Text style={styles.additivesLabel}>{t('nutrition.recipeAdditives')}</Text>
          <Text style={styles.additivesValue}>
            {additives.length ? additives.join(', ') : t('common.none')}
          </Text>
        </View>
        <Body>{t('nutrition.legalNotice')}</Body>
      </Card>}

      {(!compactEditor || activeTab === 'cost') && <Card tone="navy">
        <SectionHeader eyebrow={t('editor.resultEyebrow')} title={t('editor.resultTitle')} light />
        <View style={styles.resultGrid}>
          <BigNumber
            label={t('editor.metricPortionCost')}
            value={format.money(totals.portionCost)}
          />
          <BigNumber
            label={t('editor.metricFoodCost')}
            value={format.percent(totals.foodCostPercent)}
            tone={status === 'critical' ? 'critical' : status === 'watch' ? 'watch' : 'good'}
          />
          <BigNumber
            label={t('editor.metricMargin')}
            value={format.money(totals.contributionMargin)}
          />
          <BigNumber
            label={t('editor.recommendedLabel')}
            value={format.money(totals.recommendedPriceGross)}
            hint={t('editor.recommendedHint', { target: format.percent(draft.targetFoodCost) })}
            highlight
          />
        </View>
        <Text style={styles.resultTotals}>
          {t('editor.resultTotals', {
            total: format.money(totals.totalCost),
            servings: format.number(totals.effectiveServings),
          })}
        </Text>
        <StatusPill label={statusLabel} status={status === 'incomplete' ? 'neutral' : status} />
      </Card>}

      {(!compactEditor || activeTab === 'compliance') && <Card>
        <SectionHeader eyebrow="06" title={t('export.section')} />
        <Body>{recipe ? t('export.hint') : t('export.saveFirst')}</Body>
        {!!recipe && (
          <>
            <AppButton
              label={t('export.pdf')}
              icon="document-text-outline"
              variant="secondary"
              fullWidth
              loading={isExporting}
              onPress={() => void exportSheet('pdf')}
            />
            <AppButton
              label={t('export.excel')}
              icon="grid-outline"
              variant="secondary"
              fullWidth
              loading={isExporting}
              onPress={() => void exportSheet('excel')}
            />
          </>
        )}
      </Card>}

      {!!recipe && versions.length > 0 && (!compactEditor || activeTab === 'compliance') && (
        <Card>
          <SectionHeader eyebrow={t('editor.historyEyebrow')} title={t('editor.historyTitle')} />
          <Body>{t('editor.historyBody')}</Body>
          {versions.slice(0, 5).map((version) => (
            <View key={version.id} style={styles.versionRow}>
              <View style={styles.versionCopy}>
                <Text style={styles.versionTitle}>
                  {t('editor.versionLabel', { version: version.versionNumber })}
                </Text>
                <Text style={styles.versionDate}>{format.date(version.createdAt)}</Text>
              </View>
              <AppButton
                label={t('editor.restoreVersionAction')}
                icon="time-outline"
                variant="secondary"
                onPress={() => restoreVersion(version)}
              />
            </View>
          ))}
        </Card>
      )}

      {compactEditor && (
        <View style={styles.stepActions}>
          <Pressable
            accessibilityRole="button"
            disabled={activeTab === EDITOR_TABS[0]}
            onPress={() => setActiveTab((tab) => EDITOR_TABS[Math.max(0, EDITOR_TABS.indexOf(tab) - 1)])}
            style={({ pressed }) => [
              styles.stepAction,
              activeTab === EDITOR_TABS[0] && styles.stepActionDisabled,
              pressed && activeTab !== EDITOR_TABS[0] && styles.methodOptionPressed,
            ]}>
            <Ionicons name="chevron-back" size={17} color={Brand.navy} />
            <Text style={styles.stepActionText}>{t('common.previous')}</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            disabled={activeTab === EDITOR_TABS[EDITOR_TABS.length - 1]}
            onPress={() => setActiveTab((tab) => EDITOR_TABS[Math.min(EDITOR_TABS.length - 1, EDITOR_TABS.indexOf(tab) + 1)])}
            style={({ pressed }) => [
              styles.stepAction,
              styles.stepActionPrimary,
              activeTab === EDITOR_TABS[EDITOR_TABS.length - 1] && styles.stepActionDisabled,
              pressed && activeTab !== EDITOR_TABS[EDITOR_TABS.length - 1] && styles.methodOptionPressed,
            ]}>
            <Text style={styles.stepActionText}>{t('common.next')}</Text>
            <Ionicons name="chevron-forward" size={17} color={Brand.navy} />
          </Pressable>
        </View>
      )}

      {!!recipe && !subscription.isViewer && (
        <AppButton
          label={t('editor.deleteRecipe')}
          icon="trash-outline"
          variant="danger"
          fullWidth
          onPress={confirmDelete}
        />
      )}
    </Screen>
  );
}

/** O cifră mare din ecranul de rezultat. Patru dintre ele spun tot ce contează. */
function BigNumber({
  label,
  value,
  hint,
  tone = 'neutral',
  highlight = false,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: 'neutral' | 'good' | 'watch' | 'critical';
  highlight?: boolean;
}) {
  const { width } = useWindowDimensions();
  const compact = width < 680;
  const valueColor = highlight ? Brand.navyDeep
    : tone === 'critical' ? '#FF9A9A'
      : tone === 'watch' ? '#F5C97A'
        : tone === 'good' ? '#8BE0B4'
          : Brand.white;

  return (
    <View style={[styles.bigNumber, compact && styles.bigNumberCompact, highlight && styles.bigNumberHighlight]}>
      <Text style={[styles.bigNumberLabel, highlight && styles.bigNumberLabelHighlight]}>
        {label}
      </Text>
      <Text style={[styles.bigNumberValue, compact && styles.bigNumberValueCompact, { color: valueColor }]} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      {!!hint && (
        <Text style={[styles.bigNumberHint, highlight && styles.bigNumberHintHighlight]}>{hint}</Text>
      )}
    </View>
  );
}

function NutritionSummary({ result }: { result: RecipeNutritionResult }) {
  const { t } = useI18n();
  const { format } = usePreferences();

  const value = (key: NutrientKey, amount: number | null) => {
    if (amount === null) return '—';
    const decimals = key === 'energyKj' || key === 'energyKcal' ? 0 : 2;
    return `${result.approximateKeys.includes(key) ? '≈ ' : ''}${format.number(amount, decimals)} ${NUTRIENT_UNITS[key]}`;
  };

  return (
    <View style={styles.nutritionTable}>
      <View style={[styles.nutritionRow, styles.nutritionHeader]}>
        <Text style={[styles.nutritionCell, styles.nutritionName]}>{t('nutrition.value')}</Text>
        <Text style={styles.nutritionCell}>{t('nutrition.per100g')}</Text>
        <Text style={styles.nutritionCell}>{t('nutrition.perPortion')}</Text>
      </View>
      {DECLARED_NUTRIENT_KEYS.map((key) => (
        <View key={key} style={styles.nutritionRow}>
          <Text style={[styles.nutritionCell, styles.nutritionName]}>{t(NUTRIENT_LABEL_KEYS[key])}</Text>
          <Text style={styles.nutritionCell}>{value(key, result.per100g[key])}</Text>
          <Text style={styles.nutritionCell}>{value(key, result.perPortion[key])}</Text>
        </View>
      ))}
    </View>
  );
}

function VatRatePicker({
  value,
  onChange,
}: {
  value: number;
  onChange: (value: number) => void;
}) {
  const { t } = useI18n();
  const { format } = usePreferences();
  const { width } = useWindowDimensions();
  const compact = width < 680;
  return (
    <View style={styles.vatSection}>
      <View style={styles.vatHeading}>
        <Text style={styles.inlineLabel}>{t('vat.heading')}</Text>
        <Text style={styles.vatVerified}>
          {t('vat.verified', { date: format.date(ROMANIA_VAT_LAST_VERIFIED) })}
        </Text>
      </View>
      <View style={[styles.vatOptions, compact && styles.vatOptionsCompact]}>
        {ROMANIA_VAT_OPTIONS.map((option) => {
          const active = value === option.value;
          return (
            <Pressable
              key={option.value}
              accessibilityRole="radio"
              accessibilityState={{ checked: active }}
              onPress={() => onChange(option.value)}
              style={({ pressed }) => [
                styles.vatOption,
                compact && styles.vatOptionCompact,
                active && styles.vatOptionActive,
                pressed && styles.methodOptionPressed,
              ]}>
              <View style={[styles.vatRadio, active && styles.vatRadioActive]}>
                {active && <View style={styles.vatRadioDot} />}
              </View>
              <View style={styles.vatCopy}>
                <Text style={[styles.vatLabel, active && styles.vatLabelActive]}>
                  {t(option.labelKey)}
                </Text>
                {!compact && <Text style={styles.vatDescription}>{t(option.descriptionKey)}</Text>}
              </View>
            </Pressable>
          );
        })}
      </View>
      <Text style={styles.vatLegal}>
        {t('vat.legal', { date: format.date(ROMANIA_VAT_EFFECTIVE_FROM) })}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  topBar: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  topTitle: { flex: 1, textAlign: 'center', color: Brand.navy, fontSize: 15, fontFamily: Fonts.bold },
  topSpacer: { width: 42 },
  stepNav: {
    flexDirection: 'row',
    gap: 4,
    backgroundColor: '#E9EEF1',
    borderRadius: Radius.medium,
    padding: 4,
  },
  step: {
    flex: 1,
    minHeight: 38,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepActive: { backgroundColor: Brand.navy },
  stepText: { color: Brand.muted, fontSize: 10, fontFamily: Fonts.bold, textAlign: 'center' },
  stepTextActive: { color: Brand.white },
  stepActions: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
  stepAction: {
    minHeight: 40,
    minWidth: 112,
    paddingHorizontal: 13,
    borderWidth: 1,
    borderColor: Brand.line,
    borderRadius: 13,
    backgroundColor: Brand.white,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  stepActionPrimary: { backgroundColor: Brand.gold, borderColor: Brand.gold },
  stepActionDisabled: { opacity: 0.35 },
  stepActionText: { color: Brand.navy, fontSize: 12, fontFamily: Fonts.bold },
  fieldRow: { flexDirection: 'row', gap: 12 },
  rowField: { flex: 1 },
  photoActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  methodOptionPressed: { opacity: 0.72 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  switchCopy: { flex: 1 },
  switchLabel: { color: Brand.navyDeep, fontSize: 14, fontFamily: Fonts.bold },
  switchHint: { color: Brand.muted, fontSize: 11, lineHeight: 16, marginTop: 3, fontFamily: Fonts.regular },
  sourceBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Brand.tealSoft,
    borderRadius: Radius.medium,
    padding: 10,
  },
  sourceText: { flex: 1, color: Brand.navy, fontSize: 11, fontFamily: Fonts.bold },
  measuredCard: {
    minHeight: 78,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: Brand.line,
    borderRadius: Radius.medium,
    padding: 10,
  },
  warningBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: Brand.amberSoft,
    borderRadius: Radius.medium,
    padding: 10,
  },
  warningText: { flex: 1, color: Brand.navyDeep, fontSize: 11, lineHeight: 16, fontFamily: Fonts.semiBold },
  nutritionTable: { borderWidth: 1, borderColor: Brand.line, borderRadius: Radius.medium, overflow: 'hidden' },
  nutritionRow: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: Brand.line },
  nutritionHeader: { borderTopWidth: 0, backgroundColor: '#EFF4F4' },
  nutritionCell: {
    flex: 1,
    paddingHorizontal: 7,
    paddingVertical: 8,
    color: Brand.navySoft,
    fontSize: 10,
    fontFamily: Fonts.semiBold,
    textAlign: 'right',
    ...TabularNumbers,
  },
  nutritionName: { flex: 1.15, color: Brand.navyDeep, textAlign: 'left', fontFamily: Fonts.bold },
  additivesBox: { gap: 4, backgroundColor: '#F0F4F6', borderRadius: Radius.medium, padding: 10 },
  additivesLabel: { color: Brand.muted, fontSize: 10, fontFamily: Fonts.bold, textTransform: 'uppercase' },
  additivesValue: { color: Brand.navyDeep, fontSize: 12, lineHeight: 17, fontFamily: Fonts.bold },
  allergenSummary: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  allergenPill: {
    backgroundColor: Brand.goldSoft,
    borderRadius: Radius.pill,
    paddingHorizontal: 11,
    paddingVertical: 6,
  },
  allergenText: { color: Brand.navyDeep, fontSize: 11, fontFamily: Fonts.extraBold },
  vatSection: { gap: 9 },
  vatHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  vatVerified: { color: Brand.muted, fontSize: 9, fontFamily: Fonts.regular, ...TabularNumbers },
  vatOptions: { gap: 8 },
  vatOptionsCompact: { flexDirection: 'row', gap: 6 },
  vatOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    borderWidth: 1,
    borderColor: Brand.line,
    borderRadius: Radius.medium,
    backgroundColor: '#FAFBFB',
    padding: 12,
  },
  vatOptionCompact: { flex: 1, paddingHorizontal: 9, paddingVertical: 8, gap: 7 },
  vatOptionActive: { borderColor: Brand.gold, backgroundColor: Brand.goldSoft },
  vatRadio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: Brand.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  vatRadioActive: { borderColor: Brand.gold },
  vatRadioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: Brand.gold },
  vatCopy: { flex: 1 },
  vatLabel: { color: Brand.navySoft, fontSize: 13, fontFamily: Fonts.bold, ...TabularNumbers },
  vatLabelActive: { color: Brand.navyDeep },
  vatDescription: { color: Brand.muted, fontSize: 10, lineHeight: 15, marginTop: 2, fontFamily: Fonts.regular },
  vatLegal: { color: Brand.muted, fontSize: 9, lineHeight: 14, fontFamily: Fonts.regular },
  inlineLabel: {
    color: Brand.navySoft,
    fontSize: 11,
    fontFamily: Fonts.bold,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  resultGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  resultTotals: { color: '#9FB2C0', fontSize: 11, lineHeight: 16, fontFamily: Fonts.regular, ...TabularNumbers },
  bigNumber: {
    flexGrow: 1,
    flexBasis: '45%',
    minWidth: 150,
    backgroundColor: '#0B2E4E',
    borderRadius: Radius.large,
    paddingHorizontal: 16,
    paddingVertical: 15,
    gap: 5,
  },
  bigNumberCompact: { minWidth: 130, borderRadius: 15, paddingHorizontal: 11, paddingVertical: 9, gap: 3 },
  bigNumberHighlight: { backgroundColor: Brand.goldSoft },
  bigNumberLabel: {
    color: '#9FB2C0',
    fontSize: 10,
    fontFamily: Fonts.bold,
    letterSpacing: 0.7,
    textTransform: 'uppercase',
  },
  bigNumberLabelHighlight: { color: Brand.navySoft },
  bigNumberValue: { fontSize: 26, fontFamily: Fonts.extraBold, letterSpacing: -0.6, ...TabularNumbers },
  bigNumberValueCompact: { fontSize: 20 },
  bigNumberHint: { color: '#7E93A5', fontSize: 10, lineHeight: 14, fontFamily: Fonts.regular },
  bigNumberHintHighlight: { color: Brand.muted },
  stickyRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stickyMetric: { flex: 1, minWidth: 0 },
  stickyMetricHeading: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  stickyDot: { width: 8, height: 8, borderRadius: 4 },
  stickyLabel: {
    color: Brand.muted,
    fontSize: 9,
    fontFamily: Fonts.bold,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  stickyValue: { fontSize: 17, fontFamily: Fonts.extraBold, marginTop: 2, ...TabularNumbers },
  stickyDivider: { width: 1, height: 30, backgroundColor: Brand.line },
  versionRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderTopWidth: 1, borderTopColor: Brand.line, paddingTop: 10 },
  versionCopy: { flex: 1 },
  versionTitle: { color: Brand.navyDeep, fontSize: 13, fontFamily: Fonts.bold, ...TabularNumbers },
  versionDate: { color: Brand.muted, fontSize: 10, marginTop: 2, fontFamily: Fonts.regular, ...TabularNumbers },
});
