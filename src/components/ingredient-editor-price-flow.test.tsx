import { createElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { CatalogIngredient } from '@/types/recipe';
import { IngredientEditor } from './ingredient-editor';

const state = vi.hoisted(() => ({ save: vi.fn(), replace: vi.fn() }));
vi.mock('expo-router', () => ({ useRouter: () => ({ replace: state.replace, back: vi.fn() }) }));
vi.mock('react-native', () => ({
  Alert: { alert: vi.fn() }, StyleSheet: { create: (styles: object) => styles },
  Text: 'Text', View: 'View', Switch: 'Switch',
  Platform: { OS: 'android', select: (values: { android?: unknown; default?: unknown }) => values.android ?? values.default },
}));
vi.mock('@/components/ui', () => ({
  AppButton: 'AppButton', Body: 'Body', Card: 'Card', Field: 'Field', IconButton: 'IconButton',
  Screen: 'Screen', SectionHeader: 'SectionHeader', Title: 'Title',
}));
vi.mock('@/components/inputs', () => ({ ChipGroup: 'ChipGroup', ChoiceRow: 'ChoiceRow' }));
vi.mock('@/components/nutrition-fields', () => ({ NutritionFields: 'NutritionFields' }));
vi.mock('@/components/price-sparkline', () => ({ PriceSparkline: 'PriceSparkline' }));
vi.mock('@/contexts/locale-context', () => ({ useI18n: () => ({ t: String, locale: 'en' }) }));
vi.mock('@/contexts/preferences-context', () => ({ usePreferences: () => ({ format: { money: String, number: String, date: String } }) }));
vi.mock('@/contexts/subscription-context', () => ({ useSubscription: () => ({ isViewer: false }) }));
vi.mock('@/contexts/workspace-context', () => ({ useWorkspace: () => ({ saveCatalogIngredient: state.save, recipes: [] }) }));
vi.mock('@/lib/catalog-repository', () => ({ listPriceHistory: async () => [] }));

const entry: CatalogIngredient = {
  id: '22222222-2222-4222-8222-222222222222', name: 'QA milk', supplier: 'QA supplier',
  purchasePrice: 5, priceUnit: 'l', packagePrice: 30, packageQuantity: 6,
  offers: [], defaultLossPercent: 0, notes: null, allergens: [], active: true, updatedAt: '2026-11-04T00:00:00Z',
};
let tree: ReactTestRenderer | undefined;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  state.save.mockReset().mockResolvedValue(entry);
  state.replace.mockClear();
});
afterEach(async () => {
  await act(async () => tree?.unmount());
  tree = undefined;
  vi.unstubAllGlobals();
});

it('submits the edited pack price and per-litre price with the same active supplier offer', async () => {
  await act(async () => { tree = create(createElement(IngredientEditor, { entry })); });
  const pack = tree!.root.find(node => node.type === ('Field' as string) && node.props.label === 'ingredientEditor.packagePrice');
  expect(pack.props.value).toBe('30');
  await act(async () => { pack.props.onChangeText('36'); });
  const save = tree!.root.find(node => node.type === ('AppButton' as string) && node.props.label === 'ingredientEditor.save');
  await act(async () => { await save.props.onPress(); });
  expect(state.save).toHaveBeenCalledWith(expect.objectContaining({
    id: entry.id, packagePrice: 36, purchasePrice: 6, packageQuantity: 6,
    offers: [expect.objectContaining({ supplierName: 'QA supplier', packagePrice: 36, unitPrice: 6, isActive: true })],
  }));
  expect(state.replace).toHaveBeenCalledWith('/(app)/ingredients');
});

it('keeps standalone unit and price edits when an existing supplier offer is active', async () => {
  const directEntry: CatalogIngredient = {
    ...entry, packagePrice: null, packageQuantity: null,
    offers: [{
      id: '33333333-3333-4333-8333-333333333333', supplierName: 'QA supplier',
      unitPrice: 5, priceUnit: 'l', packagePrice: null, packageQuantity: null, source: null,
      sourceDate: null, isActive: true, updatedAt: entry.updatedAt,
    }],
  };
  await act(async () => { tree = create(createElement(IngredientEditor, { entry: directEntry })); });
  const unit = tree!.root.find(node => node.type === ('ChoiceRow' as string) && node.props.label === 'ingredientEditor.fieldPriceUnit');
  await act(async () => { unit.props.onChange('kg'); });
  const advanced = tree!.root.find(node => node.type === ('AppButton' as string) && node.props.label === 'ingredientEditor.showAdvanced');
  await act(async () => { advanced.props.onPress(); });
  const price = tree!.root.find(node => node.type === ('Field' as string) && node.props.label === 'ingredientEditor.fieldPrice');
  await act(async () => { price.props.onChangeText('8,25'); });
  const save = tree!.root.find(node => node.type === ('AppButton' as string) && node.props.label === 'ingredientEditor.save');
  await act(async () => { await save.props.onPress(); });
  expect(state.save).toHaveBeenCalledWith(expect.objectContaining({
    id: entry.id, purchasePrice: 8.25, priceUnit: 'kg',
    offers: [expect.objectContaining({ id: directEntry.offers?.[0].id, unitPrice: 8.25, priceUnit: 'kg', isActive: true })],
  }));
});

it('does not turn the ingredient into a free product when only the pack price is cleared', async () => {
  await act(async () => { tree = create(createElement(IngredientEditor, { entry })); });
  const pack = tree!.root.find(node => node.type === ('Field' as string) && node.props.label === 'ingredientEditor.packagePrice');
  await act(async () => { pack.props.onChangeText(''); });
  expect(pack.props.value).toBe('');
  const save = tree!.root.find(node => node.type === ('AppButton' as string) && node.props.label === 'ingredientEditor.save');
  await act(async () => { await save.props.onPress(); });
  expect(state.save).toHaveBeenCalledWith(expect.objectContaining({
    packagePrice: null, packageQuantity: 6, purchasePrice: 5,
    offers: [expect.objectContaining({ packagePrice: null, packageQuantity: 6, unitPrice: 5 })],
  }));
});

it('keeps the imported price when saving only a note on a legacy divergent row', async () => {
  const legacy: CatalogIngredient = {
    ...entry, purchasePrice: 9.5, supplier: 'Invoice supplier', priceSource: 'invoice:QA', priceSourceDate: '2026-11-04',
    offers: [{
      id: '33333333-3333-4333-8333-333333333333', supplierName: 'QA supplier',
      unitPrice: 5, priceUnit: 'l', packagePrice: 30, packageQuantity: 6,
      source: null, sourceDate: null, isActive: true, updatedAt: entry.updatedAt,
    }],
  };
  await act(async () => { tree = create(createElement(IngredientEditor, { entry: legacy })); });
  const advanced = tree!.root.find(node => node.type === ('AppButton' as string) && node.props.label === 'ingredientEditor.showAdvanced');
  await act(async () => { advanced.props.onPress(); });
  const notes = tree!.root.find(node => node.type === ('Field' as string) && node.props.label === 'ingredientEditor.fieldNotes');
  await act(async () => { notes.props.onChangeText('QA note'); });
  const save = tree!.root.find(node => node.type === ('AppButton' as string) && node.props.label === 'ingredientEditor.save');
  await act(async () => { await save.props.onPress(); });
  expect(state.save).toHaveBeenCalledWith(expect.objectContaining({
    id: entry.id, purchasePrice: 9.5, supplier: 'Invoice supplier', packagePrice: null,
    packageQuantity: null, notes: 'QA note', priceSource: 'invoice:QA',
    offers: [
      expect.objectContaining({ supplierName: 'QA supplier', isActive: false, packagePrice: 30 }),
      expect.objectContaining({ supplierName: 'Invoice supplier', isActive: true, unitPrice: 9.5, packagePrice: null }),
    ],
  }));
});
