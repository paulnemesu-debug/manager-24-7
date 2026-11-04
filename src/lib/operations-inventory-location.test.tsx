import { createElement, type ComponentType, type ReactNode } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { ManagementSnapshot } from './management-repository';

const state = vi.hoisted(() => ({
  load: vi.fn(),
  mode: 'orders',
  catalog: [{ id: 'cartofi', name: 'Cartofi', priceUnit: 'kg', purchasePrice: 4.75, supplier: 'Furnizor' }],
  save: vi.fn(),
}));

vi.mock('react-native', () => ({
  View: 'View', Text: 'Text', Pressable: 'Pressable', Alert: { alert: vi.fn() }, StyleSheet: { create: (value: unknown) => value },
  Platform: { select: (value: { default: unknown }) => value.default },
}));
vi.mock('@expo/vector-icons', () => ({ Ionicons: 'Icon' }));
vi.mock('expo-router', () => ({ useLocalSearchParams: () => ({ mode: state.mode }), useRouter: () => ({}) }));
vi.mock('@/components/ui', () => ({
  AppButton: 'AppButton', Body: 'Body', Card: 'Card', Field: 'Field', Screen: 'Screen', SectionHeader: 'SectionHeader', StatusPill: 'StatusPill',
}));
vi.mock('@/components/inputs', () => ({ ChoiceRow: 'ChoiceRow', Select: 'Select' }));
vi.mock('@/components/tool-header', () => ({ ToolHeader: 'ToolHeader' }));
vi.mock('@/components/haccp-date-input', () => ({ HaccpDateInput: 'HaccpDateInput' }));
vi.mock('@/contexts/auth-context', () => ({ useAuth: () => ({ user: { id: 'qa-owner' } }) }));
vi.mock('@/contexts/locale-context', () => ({ useI18n: () => ({ locale: 'ro' }) }));
vi.mock('@/contexts/preferences-context', () => ({ usePreferences: () => ({ format: { date: String, money: String, number: String } }) }));
vi.mock('@/contexts/workspace-context', () => ({ useWorkspace: () => ({ catalog: state.catalog }) }));
vi.mock('@/hooks/use-focused-sync-retry', () => ({ useFocusedSyncRetry: () => undefined }));
vi.mock('@/lib/locations-repository', () => ({ listLocations: async () => [{ id: 'a', name: 'Bistro A' }, { id: 'b', name: 'Bistro B' }] }));
vi.mock('@/lib/management-repository', () => ({
  createManagementId: () => 'new-count',
  loadManagementSnapshots: state.load,
  saveInventoryCount: state.save,
}));
vi.mock('@/lib/operations-control-repository', () => ({
  loadOperationsControlData: async () => ({ policies: [], orders: [], waste: [], schedules: [] }),
}));
vi.mock('@/lib/share-links', () => ({ shareOnWhatsApp: vi.fn() }));

import OperationsControl from '@/app/tools/operations-control';

let screen: ReactTestRenderer;
const host = (name: string) => name as unknown as ComponentType<{ children?: ReactNode }>;
const control = (type: string, label: string) => screen.root.findAllByType(host(type)).find(node => node.props.label === label)!;
const snapshot = (locationId: string | null, closingQuantity: number): ManagementSnapshot => ({
  id: locationId ?? 'general', date: '2026-11-04', locationId, updatedAt: '2026-11-04T12:00:00Z',
  inventory: [{ catalogId: 'cartofi', name: 'Cartofi', openingQuantity: 0, purchasesQuantity: 0, closingQuantity, unitCost: 4.75 }],
  sales: [], labor: [], syncState: 'synced', kind: 'inventory',
});
const counts = [snapshot('b', 9), snapshot('a', 2), snapshot(null, 1)];
const select = async (id: string) => { await act(async () => control('Select', 'Locație').props.onChange(id)); };
const edit = async (label: string, value: string) => { await act(async () => control('Field', label).props.onChangeText(value)); };
async function mount() { await act(async () => { screen = create(createElement(OperationsControl)); }); }

beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  state.mode = 'orders';
  state.load.mockReset().mockResolvedValue(counts);
  state.save.mockReset();
});
afterEach(async () => { if (screen) await act(async () => screen.unmount()); });

it('selects counts for General and two independent locations and keeps local stock drafts separate', async () => {
  await mount();
  expect(control('Field', 'În stoc').props.value).toBe('1');
  await select('a');
  expect(control('Field', 'În stoc').props.value).toBe('2');
  await edit('În stoc', '5,5');
  await select('b');
  expect(control('Field', 'În stoc').props.value).toBe('9');
  await select('a');
  expect(control('Field', 'În stoc').props.value).toBe('5,5');
});

it('ignores an earlier location refresh after switching to another location', async () => {
  let resolveA!: (value: ManagementSnapshot[]) => void;
  let resolveB!: (value: ManagementSnapshot[]) => void;
  state.load.mockResolvedValueOnce(counts)
    .mockImplementationOnce(() => new Promise(resolve => { resolveA = resolve; }))
    .mockImplementationOnce(() => new Promise(resolve => { resolveB = resolve; }));
  await mount();
  await select('a');
  await select('b');
  expect(control('Field', 'În stoc').props.value).toBe('9');
  expect(state.load.mock.calls).toEqual([
    ['qa-owner', { locationId: null }], ['qa-owner', { locationId: 'a' }], ['qa-owner', { locationId: 'b' }],
  ]);
  await act(async () => resolveB([snapshot('b', 12), snapshot('a', 2)]));
  await act(async () => resolveA([snapshot('a', 3), snapshot('b', 99)]));
  expect(control('Field', 'În stoc').props.value).toBe('12');
});

it('does not move unsaved physical counts to another location', async () => {
  state.mode = 'inventory';
  await mount();
  await select('a');
  await edit('Real kg', '2,5');
  await select('b');
  expect(control('Field', 'Real kg').props.value).toBe('');
  await edit('Real kg', '7');
  await select('a');
  expect(control('Field', 'Real kg').props.value).toBe('2,5');
});
