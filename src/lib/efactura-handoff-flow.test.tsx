import { createElement, type ComponentType, type PropsWithChildren } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { translate, type TranslationKey } from '@/i18n/translations';
import { createFormatters } from '@/lib/format';

const fixture = vi.hoisted(() => ({ userId: 'qa-one', viewer: false, loading: false, params: {} as { handoff?: string }, routes: [] as unknown[],
  xml: `<Invoice><ID>QA-VIRTUAL-42</ID><IssueDate>2026-10-06</IssueDate><DocumentCurrencyCode>RON</DocumentCurrencyCode>
  <AccountingSupplierParty><Party><PartyTaxScheme><CompanyID>RO123</CompanyID></PartyTaxScheme><PartyLegalEntity><RegistrationName>Furnizor QA</RegistrationName></PartyLegalEntity></Party></AccountingSupplierParty>
  <AccountingCustomerParty><Party><PartyTaxScheme><CompanyID>RO456</CompanyID></PartyTaxScheme><PartyLegalEntity><RegistrationName>Client QA</RegistrationName></PartyLegalEntity></Party></AccountingCustomerParty>
  <InvoiceLine><ID>1</ID><InvoicedQuantity unitCode="KGM">5</InvoicedQuantity><LineExtensionAmount>50</LineExtensionAmount><Item><Name>Cartofi</Name><ClassifiedTaxCategory><Percent>11</Percent></ClassifiedTaxCategory></Item><Price><PriceAmount>10</PriceAmount></Price></InvoiceLine>
  <LegalMonetaryTotal><PayableAmount>55.50</PayableAmount></LegalMonetaryTotal></Invoice>`,
  catalog: [{ id: 'potatoes', name: 'Cartofi', purchasePrice: 8, priceUnit: 'kg', defaultLossPercent: 0, supplier: 'Furnizor QA', active: true, notes: null, allergens: [], updatedAt: '' }],
  read: vi.fn(), pick: vi.fn(), scan: vi.fn(), loadMappings: vi.fn(async () => []), remember: vi.fn(async () => undefined),
  apply: vi.fn(async () => 0), createItems: vi.fn(async () => 0), sales: vi.fn(async () => ({})),
}));
vi.mock('@/contexts/locale-context', () => ({ useI18n: () => ({ locale: 'en', t: (key: TranslationKey, params?: Record<string, string | number>) => translate('en', key, params) }) }));
vi.mock('@/contexts/auth-context', () => ({ useAuth: () => ({ user: { id: fixture.userId } }) }));
vi.mock('@/contexts/preferences-context', () => ({ usePreferences: () => ({ format: createFormatters('en') }) }));
vi.mock('@/contexts/subscription-context', () => ({ useSubscription: () => ({ isViewer: fixture.viewer }) }));
vi.mock('@/contexts/workspace-context', () => ({ useWorkspace: () => ({ catalog: fixture.loading ? [] : fixture.catalog, recipes: [], isLoading: fixture.loading, applyPriceUpdates: fixture.apply, importNewCatalogItems: fixture.createItems }) }));
vi.mock('expo-router', () => ({ useRouter: () => ({ push: (route: unknown) => fixture.routes.push(route), replace: vi.fn() }), useLocalSearchParams: () => fixture.params }));
vi.mock('expo-document-picker', () => ({ getDocumentAsync: fixture.pick }));
vi.mock('expo-image-picker', () => ({}));
vi.mock('react-native', () => ({ Platform: { OS: 'web', select: (values: { default: unknown }) => values.default }, Alert: { alert: vi.fn() }, Linking: { openURL: vi.fn() }, StyleSheet: { create: (styles: object) => styles }, View: 'View', Text: 'Text', Pressable: 'Pressable' }));
vi.mock('@expo/vector-icons', () => ({ Ionicons: 'Icon' }));
vi.mock('@/components/tool-header', () => ({ ToolHeader: 'ToolHeader' }));
vi.mock('@/components/inputs', () => ({ Select: 'Select' }));
vi.mock('@/components/ui', () => ({ ...Object.fromEntries(['AppButton', 'Body', 'Card', 'Field', 'SectionHeader', 'StatusPill'].map(name => [name, name])),
  Screen: ({ children, footer }: PropsWithChildren<{ footer?: React.ReactNode }>) => createElement('Screen', null, children, footer),
}));
vi.mock('@/lib/document-bytes', () => ({ readDocumentText: fixture.read }));
vi.mock('@/lib/invoice-scan', () => ({ scanInvoiceDocument: fixture.scan }));
vi.mock('@/lib/invoice-mappings', () => ({ loadInvoiceProductMappings: fixture.loadMappings, rememberInvoiceProductMappings: fixture.remember }));
vi.mock('@/lib/operations-storage', () => ({ loadSales: fixture.sales }));
vi.mock('@/lib/price-alert-history', () => ({ recordPriceAlert: vi.fn() }));
vi.mock('@/lib/price-alert-notifier', () => ({ notifyPriceAlert: vi.fn(), priceAlertMessage: () => null }));

import EFacturaScreen from '@/app/tools/efactura';
import InvoiceImportScreen from '@/app/tools/invoice-import';

let tree: ReactTestRenderer | undefined;
const find = (type: string) => tree!.root.findAll(node => node.type === type);
const button = (key: TranslationKey) => find('AppButton').find(node => node.props.label === translate('en', key))!;
const row = () => find('Pressable').find(node => node.props.accessibilityLabel === 'Cartofi');
const review = () => find('Pressable').find(node => node.props.accessibilityLabel === translate('en', 'invoice.reviewed'))!;
const apply = () => find('AppButton').find(node => node.props.icon === 'checkmark-circle-outline')!;
async function mount(component: ComponentType) { await act(async () => { tree?.unmount(); tree = create(createElement(component)); }); }
async function validateAndNavigate() {
  await mount(EFacturaScreen);
  await act(async () => button('operational.efactura.choose').props.onPress());
  expect(find('Text').some(node => node.children.join('') === 'QA-VIRTUAL-42')).toBe(true);
  await act(async () => button('operational.efactura.import').props.onPress());
  const route = fixture.routes.at(-1) as { params?: { handoff?: string } };
  fixture.params = route?.params ?? {};
}
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); vi.clearAllMocks();
  fixture.userId = 'qa-one'; fixture.viewer = false; fixture.loading = false; fixture.params = {}; fixture.routes = [];
  fixture.read.mockResolvedValue(fixture.xml);
  fixture.pick.mockResolvedValue({ canceled: false, assets: [{ uri: 'file:///invoice-virtual.xml', name: 'invoice-virtual.xml', size: fixture.xml.length, mimeType: 'application/xml' }] });
});
afterEach(async () => { await act(async () => tree?.unmount()); tree = undefined; vi.unstubAllGlobals(); });

it('hands validated local XML to the existing preview and requires explicit selection and review before applying prices', async () => {
  await validateAndNavigate();
  await mount(InvoiceImportScreen);
  expect(row()).toBeDefined();
  expect(row()!.props.accessibilityState.checked).toBe(false);
  expect(review().props.accessibilityState.checked).toBe(false);
  expect(apply().props.disabled).toBe(true);
  expect(find('Field').find(node => node.props.value === '10')).toBeDefined();
  expect(JSON.stringify(fixture.routes)).not.toMatch(/QA-VIRTUAL|Cartofi|Furnizor|invoice-virtual|<Invoice/);
  expect(fixture.routes.at(-1)).toEqual({ pathname: '/tools/invoice-import', params: { handoff: expect.any(String) } });
  expect(fixture.pick).toHaveBeenCalledOnce(); expect(fixture.read).toHaveBeenCalledOnce();
  expect(fixture.scan).not.toHaveBeenCalled(); expect(fixture.loadMappings).not.toHaveBeenCalled();
  await act(async () => apply().props.onPress());
  expect(fixture.apply).not.toHaveBeenCalled(); expect(fixture.remember).not.toHaveBeenCalled();
  await act(async () => row()!.props.onPress());
  expect(apply().props.disabled).toBe(true);
  await act(async () => review().props.onPress());
  expect(apply().props.disabled).toBe(false);
  expect(fixture.apply).not.toHaveBeenCalled(); expect(fixture.createItems).not.toHaveBeenCalled(); expect(fixture.sales).not.toHaveBeenCalled();
  await act(async () => apply().props.onPress());
  expect(fixture.apply).toHaveBeenCalledWith([expect.objectContaining({ id: 'potatoes', purchasePrice: 10, source: 'invoice:QA-VIRTUAL-42' })]);
  expect(fixture.remember).toHaveBeenCalledOnce();
  await mount(InvoiceImportScreen);
  expect(row()).toBeUndefined();
});

it('waits for the destination catalog before preparing the handed-off invoice', async () => {
  await validateAndNavigate(); fixture.loading = true;
  await mount(InvoiceImportScreen); expect(row()).toBeUndefined();
  fixture.loading = false;
  await act(async () => tree!.update(createElement(InvoiceImportScreen)));
  expect(row()).toBeDefined();
  expect(find('Select').some(node => node.props.value === 'potatoes')).toBe(true);
});

it.each(['another-account', 'viewer'])('does not import a handed-off invoice for %s', async mode => {
  await validateAndNavigate();
  if (mode === 'another-account') fixture.userId = 'qa-two'; else fixture.viewer = true;
  await mount(InvoiceImportScreen);
  expect(row()).toBeUndefined(); expect(fixture.apply).not.toHaveBeenCalled(); expect(fixture.scan).not.toHaveBeenCalled(); expect(fixture.loadMappings).not.toHaveBeenCalled();
});
