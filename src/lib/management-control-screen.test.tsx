import { createElement, type ComponentType, type ReactNode } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { ManagementSnapshot } from './management-repository';

const state = vi.hoisted(() => ({ load: vi.fn(), save: vi.fn(), nextId: 0 }));

vi.mock('react-native', () => ({
  View: 'View', Text: 'Text', Alert: { alert: vi.fn() }, StyleSheet: { create: (value: unknown) => value },
  Platform: { select: (value: { default: unknown }) => value.default },
}));
vi.mock('@expo/vector-icons', () => ({ Ionicons: 'Icon' }));
vi.mock('expo-document-picker', () => ({ getDocumentAsync: vi.fn() }));
vi.mock('@/lib/document-bytes', () => ({ readDocumentText: vi.fn() }));
vi.mock('@/components/ui', () => ({
  AppButton: 'AppButton', Body: 'Body', Card: 'Card', Field: 'Field', SectionHeader: 'SectionHeader', StatusPill: 'StatusPill',
  Screen: ({ children, footer }: { children: ReactNode; footer: ReactNode }) => createElement('Screen', null, children, footer),
}));
vi.mock('@/components/inputs', () => ({ ChoiceRow: 'ChoiceRow' }));
vi.mock('@/components/tool-header', () => ({ ToolHeader: 'ToolHeader' }));
vi.mock('@/contexts/auth-context', () => ({ useAuth: () => ({ user: { id: 'qa-owner' } }) }));
vi.mock('@/contexts/locale-context', () => ({ useI18n: () => ({
  locale: 'en', t: (key: string, params?: { value?: string }) => params?.value === undefined ? key : `${key} ${params.value}`,
}) }));
vi.mock('@/contexts/preferences-context', () => ({ usePreferences: () => ({ format: { date: String, money: String, number: String, percent: String } }) }));
vi.mock('@/contexts/workspace-context', () => ({ useWorkspace: () => ({
  catalog: [{ id: 'ingredient', name: 'QA Milk', purchasePrice: 12, priceUnit: 'kg', active: true }],
  recipes: [{ id: 'recipe', title: 'QA Soup', isSubRecipe: false, ingredients: [], totals: { portionCost: 7 } }],
}) }));
vi.mock('@/lib/locations-repository', () => ({ listLocations: async () => [{ id: 'a', name: 'Bistro A' }, { id: 'b', name: 'Bistro B' }] }));
vi.mock('@/lib/management-repository', () => ({
  ManagementDayPendingError: class ManagementDayPendingError extends Error {},
  createManagementId: () => `new-${++state.nextId}`,
  loadManagementSnapshots: state.load,
  loadManagementDailySnapshots: state.load,
  saveManagementSnapshot: state.save,
}));
vi.mock('@/lib/telemetry', () => ({ trackEvent: vi.fn() }));

import ManagementControl from '@/app/tools/management-control';

const prefix = 'operational.management.';
const day = '2026-11-04';
const snapshot: ManagementSnapshot = {
  id: 'persisted-day', date: day, locationId: 'a', kind: 'daily', syncState: 'synced', syncFormat: 3, serverVersion: 1,
  updatedAt: '2026-11-04T12:00:00Z', laborIds: ['person'],
  inventory: [{ catalogId: 'ingredient', name: 'QA Milk', openingQuantity: 5, purchasesQuantity: 2, closingQuantity: 3, unitCost: 9.25 }],
  sales: [{ recipeId: 'recipe', name: 'QA Soup', quantity: 25, revenue: 375, theoreticalUnitCost: 3 }],
  labor: [{ employeeName: 'QA Cook', role: 'Cook', hours: 8, hourlyCost: 30 }],
};

let tree: ReactTestRenderer | undefined;
const host = (name: string) => name as unknown as ComponentType<{ children?: ReactNode }>;
const control = (type: string, label: string) => tree!.root.findAllByType(host(type)).find(node => node.props.label === prefix + label)!;
const field = (label: string) => control('Field', label);
const edit = async (label: string, value: string) => { await act(async () => field(label).props.onChangeText(value)); };
const select = async (location: string) => { await act(async () => control('ChoiceRow', 'location').props.onChange(location)); };
const save = async () => {
  const button = control('AppButton', 'save');
  if (!button.props.disabled && !button.props.loading) await act(async () => button.props.onPress());
};
async function mount() { await act(async () => { tree = create(createElement(ManagementControl)); }); }

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  state.nextId = 0;
  state.load.mockReset().mockResolvedValue([]);
  state.save.mockReset().mockImplementation(async (_owner: string, input: ManagementSnapshot) => ({
    ...input, kind: 'daily', syncFormat: 3, serverVersion: 1, syncState: 'synced', updatedAt: '2026-11-04T12:00:00Z',
  }));
});
afterEach(async () => { await act(async () => tree?.unmount()); tree = undefined; vi.unstubAllGlobals(); });

it('reopens saved inventory, sales and labor for the selected day and location', async () => {
  state.load.mockResolvedValue([snapshot]);
  await mount();
  await edit('date', day);
  await select('a');
  const fields = ['opening', 'receipts', 'closing', 'portions', 'revenue', 'employee', 'role', 'hours', 'hourlyCost'];
  expect(fields.map(label => field(label).props.value)).toEqual(['5', '2', '3', '25', '375', 'QA Cook', 'Cook', '8', '30']);
  await save();
  expect(state.save).toHaveBeenCalledWith('qa-owner', expect.objectContaining({ id: snapshot.id, date: day, locationId: 'a' }));
});

it('shows retained inventory, sales and labor using the values saved with the report', async () => {
  const historical = {
    ...snapshot,
    inventory: [...snapshot.inventory, { catalogId: 'removed-ingredient', name: 'Removed milk', openingQuantity: 3, purchasesQuantity: 1, closingQuantity: 2, unitCost: 4.5 }],
    sales: [...snapshot.sales, { recipeId: 'removed-recipe', name: 'Removed soup', quantity: 5, revenue: 50, theoreticalUnitCost: 2.5 }],
    labor: [...snapshot.labor, { employeeName: 'QA Second Cook', role: 'Prep', hours: 2, hourlyCost: 20 }],
    laborIds: ['person', 'second-person'],
  };
  state.load.mockResolvedValue([historical]);
  await mount();
  await edit('date', day);
  await select('a');
  const text = tree!.root.findAllByType(host('Text')).map(node => node.children.join('')).join('\n');
  expect(text).toContain('Removed milk');
  expect(text).toContain('Saved unit cost 4.5');
  expect(text).toContain('Removed soup');
  expect(text).toContain('Saved cost per portion 2.5');
  expect(text).toContain('QA Second Cook');
  expect(text).toContain('2 h');
  expect(text).toContain('Saved unit cost 9.25');
  expect(text).toContain('Saved cost per portion 3');
  expect(text).toContain('operational.management.payroll 280');
  expect(text).toContain('76.7');
  await save();
  expect(state.save).toHaveBeenCalledWith('qa-owner', expect.objectContaining({
    id: snapshot.id, inventory: historical.inventory, sales: historical.sales,
    labor: historical.labor, laborIds: historical.laborIds,
  }));
});

it('keeps unsaved values separate by date and location', async () => {
  await mount();
  await edit('date', day);
  await select('a');
  await edit('opening', '5');
  await select('b');
  expect(field('opening').props.value).toBe('');
  await edit('opening', '8');
  await edit('date', '2026-11-05');
  expect(field('opening').props.value).toBe('');
  await edit('date', day);
  expect(field('opening').props.value).toBe('8');
  await select('a');
  expect(field('opening').props.value).toBe('5');
});

it('uses the first daily record ID on later saves in the same day and location', async () => {
  await mount();
  await edit('date', day);
  await select('a');
  await edit('opening', '5');
  await save();
  await edit('opening', '6');
  await save();
  expect(state.save.mock.calls.map(([, input]) => [input.id, input.inventory[0].openingQuantity])).toEqual([['new-1', 5], ['new-1', 6]]);
});

it('retries the same ID when an acknowledgement cannot be cached', async () => {
  state.save.mockRejectedValueOnce(new Error('Cache write failed'));
  await mount();
  await edit('date', day);
  await select('a');
  await edit('opening', '5');
  await save();
  await save();
  expect(state.save.mock.calls.map(([, input]) => input.id)).toEqual(['new-1', 'new-1']);
});

it('opens a legacy daily snapshot without writing until exact recovery is chosen', async () => {
  state.load.mockResolvedValue([{ ...snapshot, syncFormat: 2, serverVersion: undefined }]);
  await mount();
  await edit('date', day);
  await select('a');
  expect(field('opening').props.value).toBe('5');
  expect(field('opening').props.editable).toBe(false);
  await save();
  expect(state.save).not.toHaveBeenCalled();
  const recovery = tree!.root.findAllByType(host('AppButton')).find(node => node.props.label === 'Verify and recover report')!;
  await act(async () => recovery.props.onPress());
  expect(state.save).toHaveBeenCalledWith('qa-owner', expect.objectContaining({
    id: snapshot.id, date: day, locationId: 'a', laborIds: ['person'], promote: true,
    inventory: snapshot.inventory, sales: snapshot.sales, labor: snapshot.labor,
  }));
});

it.each([
  ['date', '2026-02-30'],
  ['opening', '-5'],
  ['opening', '1..2'],
  ['hours', '24.01'],
  ['hourlyCost', '30abc'],
])('blocks save while invalid %s input %s remains visible', async (label, input) => {
  await mount();
  await edit('date', day);
  await edit('employee', 'QA Cook');
  await edit(label, input);
  await save();
  expect(state.save).not.toHaveBeenCalled();
  expect(field(label).props.value).toBe(input);
});
