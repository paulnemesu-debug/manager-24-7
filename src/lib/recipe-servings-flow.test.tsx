import { createElement, Fragment, type ReactNode } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { translate, type TranslationKey } from '@/i18n/translations';
import type { RecipeDraft } from '@/types/recipe';

const state = vi.hoisted(() => ({
  alert: vi.fn(),
  saveRecipe: vi.fn(),
}));

vi.mock('react-native', () => ({
  Alert: { alert: state.alert },
  LayoutAnimation: { configureNext: vi.fn(), Presets: { easeInEaseOut: {} } },
  Platform: { OS: 'android', select: (values: { android?: unknown; default?: unknown }) => values.android ?? values.default },
  Pressable: 'Pressable',
  StyleSheet: { create: (styles: object) => styles },
  Switch: 'Switch',
  Text: 'Text',
  UIManager: { setLayoutAnimationEnabledExperimental: vi.fn() },
  View: 'View',
  useWindowDimensions: () => ({ width: 360, height: 800, fontScale: 1 }),
}));
vi.mock('@expo/vector-icons', () => ({ Ionicons: 'Icon' }));
vi.mock('expo-haptics', () => ({
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning' },
  impactAsync: vi.fn(), notificationAsync: vi.fn(), selectionAsync: vi.fn(),
}));
vi.mock('expo-image-picker', () => ({}));
vi.mock('expo-router', () => ({ useRouter: () => ({ back: vi.fn(), replace: vi.fn() }) }));
vi.mock('@/lib/recipe-photo', () => ({ prepareRecipePhoto: vi.fn() }));
vi.mock('@/lib/recipe-export', () => ({ exportRecipeExcel: vi.fn(), exportRecipePdf: vi.fn() }));
vi.mock('@/components/ingredient-row', () => ({ IngredientRow: 'IngredientRow' }));
vi.mock('@/components/recipe-cover', () => ({ RecipeCover: 'RecipeCover' }));
vi.mock('@/components/recipe-nutrition-summary', () => ({ RecipeNutritionSummary: 'RecipeNutritionSummary' }));
vi.mock('@/components/inputs', () => ({ ChipGroup: 'ChipGroup', ChoiceRow: 'ChoiceRow', Select: 'Select' }));
vi.mock('@/components/ui', () => ({
  AppButton: 'AppButton', Body: 'Body', Card: 'Card', Field: 'Field', IconButton: 'IconButton',
  Screen: ({ children, footer }: { children: ReactNode; footer?: ReactNode }) => createElement(Fragment, null, children, footer),
  SectionHeader: 'SectionHeader', StatusPill: 'StatusPill', Title: 'Title',
}));
vi.mock('@/contexts/auth-context', () => ({ useAuth: () => ({ user: null }) }));
vi.mock('@/contexts/locale-context', () => ({
  useI18n: () => ({ locale: 'ro', t: (key: TranslationKey, params?: Record<string, string | number>) => translate('ro', key, params) }),
}));
vi.mock('@/contexts/preferences-context', () => ({ usePreferences: () => ({
  defaultVatPercent: 11,
  format: { money: String, number: String, percent: String, date: String },
}) }));
vi.mock('@/contexts/subscription-context', () => ({ useSubscription: () => ({ isViewer: false, plan: 'free' }) }));
vi.mock('@/contexts/workspace-context', () => ({ useWorkspace: () => ({
  saveRecipe: state.saveRecipe, removeRecipe: vi.fn(), refresh: vi.fn(), catalog: [], recipes: [], subRecipes: [],
}) }));
vi.mock('@/lib/recipe-drafts', () => ({
  clearRecipeDraft: vi.fn(async () => undefined),
  loadRecipeDrafts: vi.fn(async () => []),
  saveRecipeDraft: vi.fn(async () => null),
}));
vi.mock('@/lib/recipes-repository', () => ({
  RecipeSaveIncompleteError: class RecipeSaveIncompleteError extends Error {
    retryDraft: RecipeDraft;
    constructor(retryDraft: RecipeDraft) { super('incomplete'); this.retryDraft = retryDraft; }
  },
  listRecipeVersions: vi.fn(async () => []),
}));

import { RecipeEditor } from '@/components/recipe-editor';
import { createEmptyIngredient, createEmptyRecipe } from '@/lib/calculations';

let tree: ReactTestRenderer | undefined;
const label = (key: TranslationKey) => translate('ro', key);
const servingsField = () => tree!.root.find(
  (node) => node.type === ('Field' as string) && node.props.label === label('editor.fieldServings'),
);
const saveButton = () => tree!.root.find(
  (node) => node.type === ('AppButton' as string) && node.props.label === label('common.save'),
);
const save = async () => {
  await act(async () => {
    saveButton().props.onPress();
    await Promise.resolve();
  });
};

function validDraft(): RecipeDraft {
  return {
    ...createEmptyRecipe(),
    title: 'Ciorbă test',
    ingredients: [{ ...createEmptyIngredient(0), name: 'Salată verde', quantity: 1, purchasePrice: 10 }],
  };
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  state.alert.mockClear();
  state.saveRecipe.mockReset();
  state.saveRecipe.mockResolvedValue({ id: 'saved-recipe' });
});

afterEach(async () => {
  await act(async () => tree?.unmount());
  tree = undefined;
  vi.unstubAllGlobals();
});

describe('recipe planned portions input', () => {
  it('allows clearing the default value and typing 10 without restoring or prefixing 1', async () => {
    await act(async () => { tree = create(createElement(RecipeEditor, { initialDraft: validDraft() })); });
    expect(servingsField().props.value).toBe('10');

    await act(async () => servingsField().props.onChangeText(''));
    expect(servingsField().props.value).toBe('');

    for (const digit of '10') {
      await act(async () => servingsField().props.onChangeText(servingsField().props.value + digit));
    }
    expect(servingsField().props.value).toBe('10');
  });

  it('only saves a completed decimal-comma value and keeps its exact numeric meaning', async () => {
    await act(async () => { tree = create(createElement(RecipeEditor, { initialDraft: validDraft() })); });
    for (const value of ['', '1', '1,']) {
      await act(async () => servingsField().props.onChangeText(value));
      expect(servingsField().props.value).toBe(value);
    }

    await save();
    expect(state.saveRecipe).not.toHaveBeenCalled();
    expect(state.alert).toHaveBeenCalledTimes(1);

    await act(async () => servingsField().props.onChangeText('1,5'));
    expect(servingsField().props.value).toBe('1,5');
    await save();
    expect(state.saveRecipe).toHaveBeenCalledWith(expect.objectContaining({ servings: 1.5 }));
  });

  it.each(['', '0', '-1', '0.5', 'Infinity', 'abc', '1..5', '1,2,3'])(
    'does not save an invalid planned-portions value %j',
    async (value) => {
      await act(async () => { tree = create(createElement(RecipeEditor, { initialDraft: validDraft() })); });
      await act(async () => servingsField().props.onChangeText(value));
      await save();
      expect(state.saveRecipe).not.toHaveBeenCalled();
      expect(state.alert).toHaveBeenCalledTimes(1);
    },
  );
});
