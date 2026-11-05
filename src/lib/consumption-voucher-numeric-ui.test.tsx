import { createElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ConsumptionVoucherDraft } from '@/types/operations';

const state = vi.hoisted(() => ({ save: vi.fn(), sequence: 0 }));
vi.mock('react-native', () => ({ Alert: { alert: vi.fn() }, StyleSheet: { create: (v: unknown) => v }, Text: 'Text', View: 'View', Pressable: 'Pressable', Platform: { OS: 'web', select: (v: Record<string, unknown>) => v.web ?? v.default } }));
vi.mock('@expo/vector-icons', () => ({ Ionicons: 'Icon' }));
vi.mock('expo-document-picker', () => ({ getDocumentAsync: vi.fn() }));
vi.mock('expo-image-picker', () => ({ requestCameraPermissionsAsync: vi.fn(), launchCameraAsync: vi.fn() }));
vi.mock('expo-router', () => ({ useRouter: () => ({ setParams: vi.fn() }), useLocalSearchParams: () => ({}) }));
vi.mock('@/contexts/auth-context', () => ({ useAuth: () => ({ user: { id: 'owner' } }) }));
vi.mock('@/contexts/locale-context', () => ({ useI18n: () => ({ locale: 'en', t: (key: string) => key }) }));
vi.mock('@/contexts/preferences-context', () => ({ usePreferences: () => ({ format: { money: (v: number) => v.toFixed(2), date: (v: string) => v } }) }));
vi.mock('@/contexts/subscription-context', () => ({ useSubscription: () => ({ isViewer: false }) }));
vi.mock('@/contexts/workspace-context', () => ({ useWorkspace: () => ({ catalog: [] }) }));
vi.mock('@/components/tool-header', () => ({ ToolHeader: 'ToolHeader' }));
vi.mock('@/components/haccp-date-input', () => ({ HaccpDateInput: 'DateInput' }));
vi.mock('@/components/inputs', () => ({ Select: 'Select' }));
vi.mock('@/components/ui', () => ({
  ...Object.fromEntries(['AppButton', 'Body', 'Card', 'Field', 'IconButton', 'SectionHeader'].map(n => [n, n])),
  Screen: ({ children, footer }: { children: React.ReactNode; footer: React.ReactNode }) => createElement('Screen', null, children, footer),
}));
vi.mock('@/lib/document-bytes', () => ({ readDocumentBytes: vi.fn(), readDocumentText: vi.fn() }));
vi.mock('@/lib/consumption-scan', () => ({ scanConsumptionDocument: vi.fn() }));
vi.mock('@/lib/production-documents-repository', () => ({
  createProductionDocumentId: () => `id-${++state.sequence}`,
  syncConsumptionVouchers: async () => [],
  saveConsumptionVoucher: state.save,
}));
import ConsumptionVouchersScreen from '@/app/tools/consumption-vouchers';
let tree: ReactTestRenderer | undefined;
const nodes = (type: string) => tree!.root.findAll(n => n.type === type);
const field = (label: string) => nodes('Field').find(n => n.props.label === `voucher.${label}`)!;
const type = async (label: string, value: string) => act(async () => field(label).props.onChangeText(value));
const press = async (label: string) => act(async () => nodes('AppButton').find(n => n.props.label === `voucher.${label}`)!.props.onPress());
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  state.sequence = 0;
  state.save.mockReset().mockImplementation(async (_owner: string, draft: ConsumptionVoucherDraft) => ({ ...draft, totalCost: 5, syncState: 'synced', createdAt: '2026-11-05T00:00:00Z', updatedAt: '2026-11-05T00:00:00Z', deletedAt: null }));
});
afterEach(async () => { await act(async () => tree?.unmount()); tree = undefined; vi.unstubAllGlobals(); });
async function mount() {
  await act(async () => { tree = create(createElement(ConsumptionVouchersScreen)); });
  await press('addManual');
  await type('ingredient', 'QA Rice');
  await type('quantity', '2');
  await type('unitPrice', '4');
}
describe('stock issue numeric editing', () => {
  it.each(['-2', '1.2.3', '1kg', 'Infinity', '12.', '', '0'])('preserves invalid quantity %s and prevents saving it', async raw => {
    await mount();
    await type('quantity', raw);
    expect(field('quantity').props.value).toBe(raw);
    await press('save');
    expect(state.save).not.toHaveBeenCalled();
  });
  it.each(['-4', '1.2.3', '4RON', 'Infinity', '12.', ''])('blocks invalid purchase price %s', async raw => {
    await mount();
    await type('unitPrice', raw);
    await press('save');
    expect(state.save).not.toHaveBeenCalled();
    expect(field('unitPrice').props.value).toBe(raw);
  });
  it('allows a decimal comma to be typed and saves exactly the entered quantities and prices', async () => {
    await mount();
    for (const raw of ['', '1', '1,', '1,25']) {
      await type('quantity', raw);
      expect(field('quantity').props.value).toBe(raw);
    }
    await type('unitPrice', '3,20');
    await press('save');
    expect(state.save).toHaveBeenCalledWith('owner', expect.objectContaining({ lines: [expect.objectContaining({ quantity: 1.25, purchasePrice: 3.2, cost: 4 })] }));
  });
  it('does not silently discard a partially entered second ingredient', async () => {
    await mount();
    await press('addManual');
    await press('save');
    expect(state.save).not.toHaveBeenCalled();
    expect(nodes('Field').filter(n => n.props.label === 'voucher.ingredient')).toHaveLength(2);
  });
  it('accepts an explicitly entered zero price and clears invalid edits when starting a new issue', async () => {
    await mount();
    await type('unitPrice', '0');
    await press('save');
    expect(state.save).toHaveBeenCalledWith('owner', expect.objectContaining({ lines: [expect.objectContaining({ purchasePrice: 0 })] }));
    await type('quantity', '-2');
    await press('new');
    await press('addManual');
    expect(field('quantity').props.value).toBe('');
  });
});
