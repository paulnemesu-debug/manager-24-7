import { createElement, type ComponentType, type ReactNode } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  mode: 'orders', locale: 'en', savedPolicy: false,
  policies: vi.fn(), orders: vi.fn(), counts: vi.fn(), share: vi.fn(),
}));
vi.mock('react-native', () => ({
  View: 'View', Text: 'Text', Pressable: 'Pressable', Alert: { alert: vi.fn() },
  StyleSheet: { create: (value: unknown) => value }, Platform: { select: (value: { default: unknown }) => value.default },
}));
vi.mock('@expo/vector-icons', () => ({ Ionicons: 'Icon' }));
vi.mock('expo-router', () => ({ useLocalSearchParams: () => ({ mode: state.mode }), useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/components/ui', () => Object.fromEntries(
  ['AppButton','Body','Card','Field','Screen','SectionHeader','StatusPill'].map(name => [name, name]),
));
vi.mock('@/components/inputs', () => ({ ChoiceRow: 'ChoiceRow', Select: 'Select' }));
vi.mock('@/components/tool-header', () => ({ ToolHeader: 'ToolHeader' }));
vi.mock('@/components/haccp-date-input', () => ({ HaccpDateInput: 'HaccpDateInput' }));
vi.mock('@/contexts/auth-context', () => ({ useAuth: () => ({ user: { id: 'owner' } }) }));
vi.mock('@/contexts/locale-context', () => ({ useI18n: () => ({ locale: state.locale }) }));
vi.mock('@/contexts/preferences-context', () => ({ usePreferences: () => ({ format: { number: String, money: String, date: String } }) }));
vi.mock('@/contexts/workspace-context', () => {
  const catalog = [
    { id: 'milk', name: 'QA Milk', priceUnit: 'kg', purchasePrice: 8, supplier: 'QA', active: true },
    { id: 'flour', name: 'QA Flour', priceUnit: 'kg', purchasePrice: 4, supplier: 'QA', active: true },
  ];
  return { useWorkspace: () => ({ catalog }) };
});
vi.mock('@/hooks/use-focused-sync-retry', () => ({ useFocusedSyncRetry: () => undefined }));
vi.mock('@/lib/locations-repository', () => ({ listLocations: async () => [] }));
vi.mock('@/lib/share-links', () => ({ shareOnWhatsApp: state.share }));
vi.mock('@/lib/management-repository', () => ({
  loadManagementSnapshots: async () => [], createManagementId: () => 'count', saveInventoryCount: state.counts,
}));
vi.mock('@/lib/operations-control-repository', () => ({
  loadOperationsControlData: async () => ({
    policies: state.savedPolicy ? [{ id: 'saved-policy', catalogId: 'milk', locationId: null, minimumQuantity: 5, targetQuantity: 10, storageZone: '', updatedAt: '', syncState: 'synced' }] : [],
    orders: [], waste: [], schedules: [],
  }),
  saveStockPolicy: state.policies, saveSupplierOrder: state.orders,
  saveWasteEntry: vi.fn(), saveInventorySchedule: vi.fn(),
}));

import OperationsControl from '@/app/tools/operations-control';

let tree: ReactTestRenderer | undefined;
const host = (name: string) => name as unknown as ComponentType<{ children?: ReactNode }>;
const fields = (label: string) => tree!.root.findAllByType(host('Field')).filter(node => node.props.label === label);
const edit = async (label: string, value: string, index = 0) => {
  await act(async () => fields(label)[index].props.onChangeText(value));
};
const click = async (label: string) => {
  const button = tree!.root.findAllByType(host('AppButton')).find(node => node.props.label === label);
  if (button) await act(async () => button.props.onPress());
};
const mount = async () => { await act(async () => { tree = create(createElement(OperationsControl)); }); };
const noWrites = () => {
  expect(state.policies).not.toHaveBeenCalled();
  expect(state.orders).not.toHaveBeenCalled();
  expect(state.counts).not.toHaveBeenCalled();
};

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  state.locale = 'en';
  state.mode = 'orders';
  state.savedPolicy = false;
  state.policies.mockReset().mockImplementation(async (_user, row) => ({ ...row, id: 'saved-policy', syncState: 'pending' }));
  state.orders.mockReset().mockImplementation(async (_user, row) => ({ ...row, id: 'order', syncState: 'pending' }));
  state.counts.mockReset().mockImplementation(async (_user, row) => ({ ...row, updatedAt: '', kind: 'inventory', syncState: 'pending' }));
  state.share.mockReset().mockResolvedValue(undefined);
});
afterEach(async () => { await act(async () => tree?.unmount()); tree = undefined; vi.unstubAllGlobals(); });

it.each([
  ['Minimum', '-5'], ['Target', '-10'], ['Minimum', 'abc'], ['Target', '1..2'], ['Minimum', '1e3'], ['Target', '12x'],
])('keeps invalid %s %s visible and prevents every threshold write', async (label, value) => {
  await mount();
  await edit('Minimum', '2');
  await edit('Target', '10');
  await edit(label, value, 1);
  await click('Save stock levels');
  noWrites();
  expect(fields(label)[1].props.value).toBe(value);
  expect(fields(label)[1].props.hint).toBeTruthy();
});

it('rejects an explicit target below its minimum without promoting the target', async () => {
  await mount();
  await edit('Minimum', '5');
  await edit('Target', '4');
  await click('Save stock levels');
  noWrites();
  expect(fields('Target')[0].props.value).toBe('4');
  expect(fields('Target')[0].props.hint).toBeTruthy();
});

it.each(['-3.5', 'abc', '1..2', '1e3'])('prevents creation and sharing with invalid on-hand quantity %s', async raw => {
  await mount();
  await edit('Minimum', '5');
  await edit('Target', '10');
  await edit('On hand', raw);
  await click('Create orders');
  await click('Share on WhatsApp');
  noWrites();
  expect(state.share).not.toHaveBeenCalled();
  expect(fields('On hand')[0].props.value).toBe(raw);
  expect(fields('On hand')[0].props.hint).toBeTruthy();
});

it.each(['-2.5', 'abc', '1..2', '1e3'])('rejects an invalid stocktake %s before writing any rows', async raw => {
  state.mode = 'inventory';
  await mount();
  await edit('Actual kg', '3');
  await edit('Actual kg', raw, 1);
  await click('Save stocktake');
  noWrites();
  expect(fields('Actual kg')[1].props.value).toBe(raw);
  expect(fields('Actual kg')[1].props.hint).toBeTruthy();
});

it('uses comma decimals in stock levels and restock orders', async () => {
  await mount();
  await edit('Minimum', '5,5');
  await edit('Target', '10,5');
  await edit('On hand', '3,5');
  await click('Save stock levels');
  expect(state.policies).toHaveBeenCalledWith('owner', expect.objectContaining({ minimumQuantity: 5.5, targetQuantity: 10.5 }));
  await click('Create orders');
  expect(state.orders).toHaveBeenCalledWith('owner', expect.objectContaining({
    lines: [expect.objectContaining({ orderQuantity: 7 })],
  }));
});

it('treats empty new rows as unconfigured and clears existing levels to explicit zeros', async () => {
  state.savedPolicy = true;
  await mount();
  await edit('Minimum', '');
  await edit('Target', '');
  await click('Save stock levels');
  expect(state.policies).toHaveBeenCalledExactlyOnceWith('owner', expect.objectContaining({
    id: 'saved-policy', minimumQuantity: 0, targetQuantity: 0,
  }));
});

it('defaults an omitted target to the minimum and an omitted minimum to zero', async () => {
  await mount();
  await edit('Minimum', '5,5');
  await edit('Target', '9', 1);
  await click('Save stock levels');
  expect(state.policies.mock.calls.map(([, row]) => [row.minimumQuantity, row.targetQuantity])).toEqual([[5.5, 5.5], [0, 9]]);
});

it('keeps stocktake drafts after a save failure and accepts explicit zero and comma decimals', async () => {
  state.mode = 'inventory';
  state.counts.mockRejectedValueOnce(new Error('Device storage full'));
  await mount();
  await edit('Actual kg', '0');
  await edit('Actual kg', '2,5', 1);
  await click('Save stocktake');
  expect(fields('Actual kg').map(field => field.props.value)).toEqual(['0', '2,5']);
  await click('Save stocktake');
  expect(state.counts.mock.calls[1][1].inventory.map((row: { closingQuantity: number }) => row.closingQuantity)).toEqual([0, 2.5]);
});

it.each(['levels', 'orders'])('preserves stock fields after %s save fails', async operation => {
  if (operation === 'levels') state.policies.mockRejectedValueOnce(new Error('Device storage full'));
  else state.orders.mockRejectedValueOnce(new Error('Device storage full'));
  await mount();
  await edit('Minimum', '5,5');
  await edit('Target', '10,5');
  await edit('On hand', '3,5');
  await click(operation === 'levels' ? 'Save stock levels' : 'Create orders');
  expect(fields('Minimum')[0].props.value).toBe('5,5');
  expect(fields('Target')[0].props.value).toBe('10,5');
  expect(fields('On hand')[0].props.value).toBe('3,5');
});
