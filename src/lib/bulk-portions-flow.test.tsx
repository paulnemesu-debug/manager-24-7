import { createElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { translate, type TranslationKey } from '@/i18n/translations';
import type { Recipe } from '@/types/recipe';

const state = vi.hoisted(() => ({
  params: {} as { id?: string },
  storage: new Map<string, string>(),
  recipes: [] as Recipe[],
  alert: vi.fn(),
  replace: vi.fn(),
}));

vi.mock('react-native', () => ({
  Platform: { OS: 'android', select: (values: { default: unknown }) => values.default },
  StyleSheet: { create: (styles: object) => styles },
  Alert: { alert: state.alert },
  View: 'View', Text: 'Text', TextInput: 'TextInput', Pressable: 'Pressable',
  ScrollView: 'ScrollView', KeyboardAvoidingView: 'KeyboardAvoidingView', ActivityIndicator: 'ActivityIndicator',
  useWindowDimensions: () => ({ width: 360, height: 800, fontScale: 1 }),
}));
vi.mock('react-native-safe-area-context', () => ({ SafeAreaView: 'SafeAreaView' }));
vi.mock('@expo/vector-icons', () => ({ Ionicons: 'Icon' }));
vi.mock('expo-image', () => ({ Image: 'Image' }));
vi.mock('expo-document-picker', () => ({}));
vi.mock('expo-image-picker', () => ({}));
vi.mock('expo-router', () => ({ useRouter: () => ({ replace: state.replace }), useLocalSearchParams: () => state.params }));
vi.mock('@/components/language-selector', () => ({ LanguageSelector: 'LanguageSelector' }));
vi.mock('@/components/tool-header', () => ({ ToolHeader: 'ToolHeader' }));
vi.mock('@/components/haccp-date-input', () => ({ HaccpDateInput: 'HaccpDateInput' }));
vi.mock('@/components/inputs', () => ({ Select: 'Select' }));
vi.mock('@/contexts/auth-context', () => ({ useAuth: () => ({ user: null }) }));
vi.mock('@/contexts/locale-context', () => ({ useI18n: () => ({ locale: 'ro', t: (key: TranslationKey) => translate('ro', key) }) }));
vi.mock('@/contexts/preferences-context', () => ({ usePreferences: () => ({
  defaultVatPercent: 11,
  format: { money: (value: number | null) => value === null ? '—' : value.toFixed(2), number: String, percent: String, date: String },
}) }));
vi.mock('@/contexts/subscription-context', () => ({ useSubscription: () => ({ isViewer: false }) }));
vi.mock('@/contexts/workspace-context', () => ({ useWorkspace: () => ({ recipes: state.recipes, catalog: [] }) }));
vi.mock('@/lib/document-bytes', () => ({}));
vi.mock('@/lib/consumption-import', () => ({}));
vi.mock('@/lib/consumption-scan', () => ({}));
vi.mock('@/lib/scan-errors', () => ({}));
vi.mock('@/lib/supabase', () => ({ isDemoMode: true, isSupabaseConfigured: false, supabase: null }));
vi.mock('@react-native-async-storage/async-storage', () => ({ default: {
  getItem: async (key: string) => state.storage.get(key) ?? null,
  setItem: async (key: string, value: string) => { state.storage.set(key, value); },
} }));

// Exercise the real screen, Field, calculation and local repository paths.
import BulkScreen from '@/app/tools/bulk';
import { demoRecipes } from '@/lib/demo-data';
import { loadCachedBulkBatches } from '@/lib/production-documents-repository';

let tree: ReactTestRenderer | undefined;
const label = (key: TranslationKey) => translate('ro', key);
const field = (key: TranslationKey) => tree!.root.find(node => node.type === ('TextInput' as string) && node.props.accessibilityLabel === label(key));
const change = async (key: TranslationKey, value: string) => { await act(async () => field(key).props.onChangeText(value)); };
const press = async (key: TranslationKey) => {
  await act(async () => tree!.root.find(node => node.type === ('Pressable' as string) && node.findAll(child => child.type === ('Text' as string) && child.children.join('') === label(key)).length > 0).props.onPress());
};
const metric = (key: TranslationKey) => {
  const text = tree!.root.find(node => node.type === ('Text' as string) && node.children.join('') === label(key));
  return text.parent!.findAll(node => node.type === ('Text' as string)).at(-1)!.children.join('');
};
const mount = async () => { await act(async () => { tree = create(createElement(BulkScreen)); }); };
const selectRecipe = async () => {
  await act(async () => tree!.root.find(node => node.type === ('Select' as string) && node.props.label === label('bulk.recipe')).props.onChange('soup'));
};

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  state.params = {};
  state.storage.clear();
  state.alert.mockClear();
  state.replace.mockClear();
  state.recipes = [{
    ...demoRecipes.find(recipe => !recipe.isSubRecipe)!,
    id: 'soup', title: 'Ciorbă rădăuțeană', servings: 100, salePriceGross: 25, vatPercent: 11,
    compliance: { finalWeightGrams: 400, finalWeightMeasured: true, isDefrosted: false, nutritionNotes: '', templateId: null, sourceReference: null },
    ingredients: [{
      id: 'chicken', kind: 'product', catalogId: null, subRecipeId: null, name: 'Pui',
      quantity: 1, unit: 'kg', purchasePrice: 10, priceUnit: 'kg', lossPercent: 0, allergens: [],
    }],
  }];
});
afterEach(async () => { await act(async () => tree?.unmount()); tree = undefined; vi.unstubAllGlobals(); });

describe('bulk portions input and saved batches', () => {
  it('allows backspacing the default portion count to an empty field before retyping', async () => {
    await mount();
    expect(field('bulk.portions').props.value).toBe('1');
    await change('bulk.portions', '');
    expect(field('bulk.portions').props.value).toBe('');
    await change('bulk.portions', '2');
    expect(field('bulk.portions').props.value).toBe('2');
  });

  it.each([
    [1, '10.00', '400 g'], [2, '5.00', '200 g'], [10, '1.00', '40 g'],
    [50, '0.20', '8 g'], [99, '0.10', '4.04 g'], [100, '0.10', '4 g'],
  ])('edits 100 to %s portions, calculates and saves/reopens the exact value', async (portions, portionCost, weight) => {
    await mount();
    await selectRecipe();
    expect(field('bulk.portions').props.value).toBe('100');
    for (const remaining of ['10', '1', '']) {
      await change('bulk.portions', remaining);
      expect(field('bulk.portions').props.value).toBe(remaining);
    }
    for (const digit of String(portions)) {
      await change('bulk.portions', field('bulk.portions').props.value + digit);
    }
    expect(field('bulk.portions').props.value).toBe(String(portions));
    expect(metric('bulk.portionCost')).toBe(portionCost);
    expect(metric('bulk.servingWeight')).toBe(weight);
    await press('bulk.save');
    const [saved] = await loadCachedBulkBatches('demo');
    expect(saved).toMatchObject({ portions, totalCost: 10, portionCost: Number(portionCost) });
    await act(async () => tree!.unmount());
    state.params = { id: saved.id };
    await mount();
    expect(field('bulk.portions').props.value).toBe(String(portions));
    expect(metric('bulk.portionCost')).toBe(portionCost);
    expect(metric('bulk.servingWeight')).toBe(weight);
  });

  it('retains a comma while typing fractional portions and saves the numeric value', async () => {
    await mount();
    await selectRecipe();
    for (const value of ['', '1', '1,', '1,5']) {
      await change('bulk.portions', value);
      expect(field('bulk.portions').props.value).toBe(value);
    }
    expect(metric('bulk.portionCost')).toBe('6.67');
    expect(metric('bulk.servingWeight')).toBe('266.667 g');
    await press('bulk.save');
    expect((await loadCachedBulkBatches('demo'))[0].portions).toBe(1.5);
  });

  it.each(['', '0', '-1', '-2', '0.5', 'Infinity', 'abc'])('does not save invalid portion input %j', async (input) => {
    await mount();
    await selectRecipe();
    await change('bulk.portions', input);
    expect(metric('bulk.portionCost')).toBe('—');
    expect(metric('bulk.servingWeight')).toBe('—');
    expect(metric('bulk.foodCost')).toBe('—');
    await press('bulk.save');
    expect(await loadCachedBulkBatches('demo')).toEqual([]);
    expect(state.alert).toHaveBeenCalledWith(label('bulk.incompleteTitle'), label('bulk.invalidPortionsBody'));
    expect(state.replace).not.toHaveBeenCalled();
  });

  it('resets portion text when selecting a recipe and starting a new batch', async () => {
    await mount();
    await change('bulk.portions', '2');
    await selectRecipe();
    expect(field('bulk.portions').props.value).toBe('100');
    await change('bulk.portions', '50');
    await press('bulk.new');
    expect(field('bulk.portions').props.value).toBe('1');
  });
});
