import { createElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ csv: '', sequence: 0, save: vi.fn() }));
vi.mock('react-native', () => ({ Alert: { alert: vi.fn() }, StyleSheet: { create: (value: unknown) => value }, Text: 'Text', View: 'View', Pressable: 'Pressable', Platform: { OS: 'web', select: (value: Record<string, unknown>) => value.web ?? value.default } }));
vi.mock('@expo/vector-icons', () => ({ Ionicons: 'Icon' }));
vi.mock('expo-document-picker', () => ({ getDocumentAsync: async () => ({ canceled: false, assets: [{ name: 'stock.csv', uri: 'fixture.csv' }] }) }));
vi.mock('expo-image-picker', () => ({ requestCameraPermissionsAsync: vi.fn(), launchCameraAsync: vi.fn() }));
vi.mock('expo-router', () => ({ useRouter: () => ({ setParams: vi.fn() }), useLocalSearchParams: () => ({}) }));
vi.mock('@/contexts/auth-context', () => ({ useAuth: () => ({ user: { id: 'owner' } }) }));
vi.mock('@/contexts/locale-context', () => ({ useI18n: () => ({ locale: 'en', t: (key: string, params?: Record<string, unknown>) => params ? key + ':' + JSON.stringify(params) : key }) }));
vi.mock('@/contexts/preferences-context', () => ({ usePreferences: () => ({ format: { money: (value: number) => value.toFixed(2), date: (value: string) => value } }) }));
vi.mock('@/contexts/subscription-context', () => ({ useSubscription: () => ({ isViewer: false }) }));
vi.mock('@/contexts/workspace-context', () => ({ useWorkspace: () => ({ catalog: [] }) }));
vi.mock('@/components/tool-header', () => ({ ToolHeader: 'ToolHeader' }));
vi.mock('@/components/haccp-date-input', () => ({ HaccpDateInput: 'DateInput' }));
vi.mock('@/components/inputs', () => ({ Select: 'Select' }));
vi.mock('@/components/ui', () => ({
  ...Object.fromEntries(['AppButton', 'Body', 'Card', 'Field', 'IconButton', 'SectionHeader'].map(name => [name, name])),
  Screen: ({ children, footer }: { children: React.ReactNode; footer: React.ReactNode }) => createElement('Screen', null, children, footer),
}));
vi.mock('@/lib/document-bytes', () => ({ readDocumentText: async () => state.csv, readDocumentBytes: vi.fn() }));
vi.mock('@/lib/consumption-scan', () => ({ scanConsumptionDocument: vi.fn() }));
vi.mock('@/lib/production-documents-repository', () => ({
  createProductionDocumentId: () => 'id-' + ++state.sequence,
  syncConsumptionVouchers: async () => [],
  saveConsumptionVoucher: state.save,
}));
import ConsumptionVouchersScreen from '@/app/tools/consumption-vouchers';

let tree: ReactTestRenderer | undefined;
const nodes = (type: string) => tree!.root.findAll(node => node.type === type);
const button = (label: string) => nodes('AppButton').find(node => node.props.label === label)!;
const press = async (label: string) => act(async () => button(label).props.onPress());
const text = () => nodes('Text').concat(nodes('Body')).map(node => node.children.filter(child => typeof child === 'string' || typeof child === 'number').join('')).join('\n');
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  state.sequence = 0;
  state.save.mockReset();
  state.csv = 'Ingredient;Cantitate;UM;Pret\nQA Lapte Bistro;2;kg;9,25\nQA Negative Rice;-1;kg;8\nQA Unknown Ingredient;3;;\n';
});
afterEach(async () => { await act(async () => tree?.unmount()); tree = undefined; vi.unstubAllGlobals(); });
const mount = async () => act(async () => { tree = create(createElement(ConsumptionVouchersScreen)); });

describe('stock issue import review', () => {
  it('shows rejected source rows with their names, row numbers and correction reasons', async () => {
    await mount();
    await press('voucher.import');
    expect(text()).toContain('voucher.previewBody:{"accepted":1,"total":3,"unresolved":2}');
    expect(text()).toContain('Row 3: QA Negative Rice');
    expect(text()).toContain('Quantity must be a number greater than zero');
    expect(text()).toContain('Row 4: QA Unknown Ingredient');
    expect(text()).toContain('Unit is missing');
    expect(text()).toContain('Price is missing');
    expect(button('voucher.confirmImport').props.disabled).toBe(false);
  });

  it('keeps the current issue intact when a mixed import preview is cancelled', async () => {
    await mount();
    await press('voucher.addManual');
    const ingredient = nodes('Field').find(node => node.props.label === 'voucher.ingredient')!;
    await act(async () => ingredient.props.onChangeText('Existing draft ingredient'));
    const reference = nodes('Field').find(node => node.props.label === 'voucher.reference')!;
    await act(async () => reference.props.onChangeText('Existing reference'));
    await press('voucher.import');
    await press('common.cancel');
    expect(nodes('Field').filter(node => node.props.label === 'voucher.ingredient').map(node => node.props.value)).toEqual(['Existing draft ingredient']);
    expect(nodes('Field').find(node => node.props.label === 'voucher.reference')!.props.value).toBe('Existing reference');
    expect(nodes('AppButton').some(node => node.props.label === 'voucher.confirmImport')).toBe(false);
    expect(state.save).not.toHaveBeenCalled();
  });

  it('shows an entirely invalid file as rejected rows and disables confirmation', async () => {
    state.csv = 'Ingredient;Cantitate;UM;Pret\nQA Negative Rice;-1;kg;8';
    await mount();
    await press('voucher.import');
    expect(text()).toContain('voucher.previewBody:{"accepted":0,"total":1,"unresolved":1}');
    expect(text()).toContain('Row 2: QA Negative Rice');
    expect(button('voucher.confirmImport').props.disabled).toBe(true);
  });
});
