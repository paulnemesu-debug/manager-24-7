import { createElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import ImportPricesScreen from '@/app/ingredient/import';
import type { CatalogIngredient } from '@/types/recipe';

const state = vi.hoisted(() => ({
  csv: '',
  catalog: [] as CatalogIngredient[],
  apply: vi.fn(),
}));
vi.mock('expo-router', () => ({ useRouter: () => ({ replace: vi.fn(), back: vi.fn() }) }));
vi.mock('expo-document-picker', () => ({
  getDocumentAsync: async () => ({ canceled: false, assets: [{ name: 'prices.csv', uri: 'file:///prices.csv' }] }),
}));
vi.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }));
vi.mock('react-native', () => ({
  Alert: { alert: vi.fn() }, StyleSheet: { create: (styles: object) => styles },
  Text: 'Text', View: 'View', Pressable: 'Pressable',
  Platform: { OS: 'android', select: (values: { android?: unknown; default?: unknown }) => values.android ?? values.default },
}));
vi.mock('@/components/ui', () => ({
  AppButton: 'AppButton', Body: 'Body', Card: 'Card', IconButton: 'IconButton',
  Screen: 'Screen', SectionHeader: 'SectionHeader', Title: 'Title',
}));
vi.mock('@/contexts/auth-context', () => ({ useAuth: () => ({ user: { id: 'owner' } }) }));
vi.mock('@/contexts/locale-context', () => ({ useI18n: () => ({ t: String, locale: 'en' }) }));
vi.mock('@/contexts/preferences-context', () => ({ usePreferences: () => ({ format: { money: String, number: String, percent: String } }) }));
vi.mock('@/contexts/workspace-context', () => ({ useWorkspace: () => ({ catalog: state.catalog, recipes: [], applyPriceUpdates: state.apply }) }));
vi.mock('@/lib/document-bytes', () => ({ readDocumentText: async () => state.csv, readDocumentBytes: vi.fn() }));
vi.mock('@/lib/operations-storage', () => ({ loadSales: async () => ({}) }));
vi.mock('@/lib/price-alert-notifier', () => ({ notifyPriceAlert: vi.fn(), priceAlertMessage: vi.fn() }));
vi.mock('@/lib/price-alert-history', () => ({ recordPriceAlert: vi.fn() }));
vi.mock('@/lib/price-alerts', () => ({ calculatePriceAlert: () => null }));

let tree: ReactTestRenderer | undefined;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  state.apply.mockReset().mockResolvedValue(0);
  state.catalog = [{
    id: 'ingredient', name: 'QA Milk', supplier: 'Existing supplier', purchasePrice: 7,
    priceUnit: 'l', packagePrice: null, packageQuantity: null, defaultLossPercent: 0,
    notes: null, allergens: [], active: true, updatedAt: '2026-11-04T00:00:00Z',
  }];
});
afterEach(async () => {
  await act(async () => tree?.unmount());
  tree = undefined;
  vi.unstubAllGlobals();
});

it.each([
  ['Name,Price\nQA Milk,8.75\n', undefined],
  ['Name,Price,Supplier\nQA Milk,8.75,Explicit vendor\n', 'Explicit vendor'],
])('uses only the supplier recorded in the CSV for a matched ingredient', async (csv, supplier) => {
  state.csv = csv;
  await act(async () => { tree = create(createElement(ImportPricesScreen)); });
  const button = (label: string) => tree!.root.find(node => node.type === ('AppButton' as string) && node.props.label === label);
  await act(async () => { button('import.pick').props.onPress(); });
  await act(async () => { button('import.apply').props.onPress(); });
  expect(state.apply).toHaveBeenCalledWith([expect.objectContaining({
    id: 'ingredient', purchasePrice: 8.75, supplier, source: 'supplier_import',
  })]);
});
