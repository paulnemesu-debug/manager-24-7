import { createElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getHaccpForm, type HaccpFieldDefinition } from '@/constants/haccp-forms';
import { translate, type TranslationKey } from '@/i18n/translations';
import type { HaccpDocument, HaccpValues } from '@/types/haccp';

const state = vi.hoisted(() => ({ code: 'FO-H-06-03', documents: [] as HaccpDocument[], save: vi.fn(), alert: vi.fn() }));
vi.mock('@/contexts/locale-context', () => ({ useI18n: () => ({ locale: 'en', t: (key: TranslationKey, params?: Record<string, string | number>) => translate('en', key, params) }) }));
vi.mock('@/contexts/auth-context', () => ({ useAuth: () => ({ user: null }) }));
vi.mock('expo-router', () => ({ useRouter: () => ({ replace: vi.fn() }), useLocalSearchParams: () => ({ code: state.code }) }));
vi.mock('react-native', () => ({ Platform: { select: (values: { default: unknown }) => values.default }, Alert: { alert: state.alert }, StyleSheet: { create: (styles: object) => styles }, View: 'View', Text: 'Text', Pressable: 'Pressable' }));
vi.mock('@expo/vector-icons', () => ({ Ionicons: 'Icon' }));
vi.mock('expo-haptics', () => ({ selectionAsync: async () => undefined, notificationAsync: async () => undefined, NotificationFeedbackType: { Success: 'Success' } }));
vi.mock('@/components/tool-header', () => ({ ToolHeader: 'ToolHeader' }));
vi.mock('@/components/haccp-field', () => ({ HaccpField: 'HaccpField' }));
vi.mock('@/components/haccp-month-grid', () => ({ HaccpMonthGrid: 'HaccpMonthGrid' }));
vi.mock('@/components/ui', async () => {
  const { createElement } = await import('react');
  return { ...Object.fromEntries(['AppButton', 'Body', 'Card', 'IconButton', 'SectionHeader', 'StatusPill'].map(name => [name, name])), Screen: (props: { children: React.ReactNode; footer?: React.ReactNode }) => createElement('Screen', {}, props.children, props.footer) };
});
vi.mock('@/hooks/use-haccp-documents', () => ({ useHaccpDocuments: () => ({ documents: state.documents, isLoading: false, save: state.save, remove: vi.fn() }) }));
vi.mock('@/lib/haccp-export', () => ({ exportHaccpDocumentPdf: vi.fn() }));
vi.mock('@/lib/haccp-repository', () => ({ createHaccpDocumentId: () => 'new-document', createHaccpRowId: () => 'new-row' }));
vi.mock('@/lib/haccp-reminders', () => ({ syncHaccpReminders: vi.fn() }));
vi.mock('@/lib/haccp-routine-repository', () => ({ defaultHaccpProfile: () => ({ defaultLocationName: 'QA', defaultLocationId: null, responsibleName: 'Operator' }), loadHaccpProfile: async () => ({ defaultLocationName: 'QA', defaultLocationId: null, responsibleName: 'Operator' }) }));

import HaccpFormScreen from '@/app/tools/haccp/[code]';
let tree: ReactTestRenderer | undefined;
const nodes = (type: string) => tree!.root.findAll(node => node.type === type);
const field = (key: string) => nodes('HaccpField').find(node => node.props.field.key === key)!;
const set = async (key: string, value: string) => act(async () => field(key).props.onChange(value));
const press = async (label: string) => act(async () => nodes('AppButton').find(node => node.props.label === label)!.props.onPress());
const rows = () => nodes('IconButton').filter(node => node.props.label === 'Edit record');
const valueFor = (f: HaccpFieldDefinition) => f.type === 'choice' ? (f.options?.find(o => o.value === 'conform' || o.value === 'yes') ?? f.options?.[0])!.value : f.type === 'number' ? (f.key === 'year' ? '2026' : f.key === 'month' ? '2' : f.key === 'day' ? '19' : '2') : f.type === 'date' ? '2026-02-19' : f.type === 'time' ? '10:30' : f.type === 'temperature' ? '4' : 'QA';
const values = (fields: readonly HaccpFieldDefinition[]): HaccpValues => Object.fromEntries(fields.map(f => [f.key, valueFor(f)]));
const mount = async (code: string) => { state.code = code; await act(async () => { tree = create(createElement(HaccpFormScreen)); }); };
const start = async (code: string) => { await mount(code); await press('Complete a new form'); for (const node of nodes('HaccpField')) await act(async () => node.props.onChange(valueFor(node.props.field))); };
const document = (code: string, rowValues: HaccpValues[]): HaccpDocument => ({ id: 'existing', formCode: code, headerValues: { ...values(getHaccpForm(code)!.documentFields), _location_name: 'QA' }, rows: rowValues.map((v, i) => ({ id: `row-${i}`, values: v, createdAt: '2026-02-19T10:00:00Z', updatedAt: '2026-02-19T10:00:00Z' })), createdAt: '2026-02-19T10:00:00Z', updatedAt: '2026-02-19T10:00:00Z', syncState: 'local' });
const openExisting = async () => { await act(async () => nodes('Pressable')[0]!.props.onPress()); };
beforeEach(() => { vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); state.documents = []; state.alert.mockClear(); state.save.mockReset().mockImplementation(async (doc: HaccpDocument) => ({ document: doc, synced: false })); });
afterEach(async () => { await act(async () => tree?.unmount()); tree = undefined; vi.unstubAllGlobals(); });

describe('HACCP defect regressions', () => {
  it('H01 records a rapid-cooling nonconformity after entering a corrective action', async () => {
    await start('FO-H-16-01');
    expect(field('corrective_action')).toBeDefined();
    await set('corrective_action', ''); await set('conform_1', 'nonconform'); await press('Add row');
    expect(rows()).toHaveLength(0);
    await set('corrective_action', 'Quarantined the batch and notified supervisor'); await press('Add row');
    expect(rows()).toHaveLength(1);
  });
  it('H02 preserves the selected historical day and measured time when marking conform', async () => {
    await start('FO-H-04-01'); await set('day', '1'); await set('monitoring_time', '07:15'); await press('Everything conforms');
    expect(field('day').props.value).toBe('1'); expect(field('monitoring_time').props.value).toBe('07:15');
  });
  it('H03 rejects changing an existing matrix day to another occupied day without losing either row', async () => {
    const original = values(getHaccpForm('FO-H-06-03')!.rowFields);
    state.documents = [document('FO-H-06-03', [{ ...original, day: '1' }, { ...original, day: '2' }])];
    await mount('FO-H-06-03'); await openExisting(); await act(async () => rows()[0]!.props.onPress()); await set('day', '2'); await press('Update row');
    await press('Save form');
    expect(state.save.mock.calls[0]?.[0].rows.map((row: { values: HaccpValues }) => row.values.day)).toEqual(['1', '2']);
    expect(state.alert.mock.calls.some(call => /already|duplicate/i.test(call.join(' ')))).toBe(true);
  });
  it.each(['abc', '2kg', 'Infinity', '1.2.3'])('H04 rejects nonnumeric quantity %s before adding a row', async raw => {
    await start('FO-H-07-01'); await set('quantity', raw); await press('Add row'); expect(rows()).toHaveLength(0);
  });
  it('accepts a localized decimal quantity without changing its value', async () => {
    await start('FO-H-07-01'); await set('quantity', '2,5'); await press('Add row'); await press('Save form');
    expect(state.save.mock.calls[0]?.[0].rows[0].values.quantity).toBe('2,5');
  });
  it.each([['13', '19'], ['0', '19'], ['2', '31'], ['2', '29'], ['4', '31'], ['2', '1.5']])('H08 rejects month %s day %s in 2026', async (month, day) => {
    await start('FO-H-17-01'); await set('month', month); await set('day', day); await press('Add row'); expect(rows()).toHaveLength(0);
  });
  it('accepts February 29 in a leap year', async () => {
    await start('FO-H-17-01'); await set('year', '2028'); await set('month', '2'); await set('day', '29'); await press('Add row'); expect(rows()).toHaveLength(1);
  });
  it('blocks save of an invalid legacy monthly document without mutating its stored values', async () => {
    const original = document('FO-H-17-01', [{ ...values(getHaccpForm('FO-H-17-01')!.rowFields), day: '31' }]);
    state.documents = [original]; await mount('FO-H-17-01'); await openExisting(); await press('Save form');
    expect(state.save).not.toHaveBeenCalled(); expect(original.rows[0]!.values.day).toBe('31'); expect(state.alert).toHaveBeenCalled();
  });
});

it('rejects export of an invalid legacy month from the saved list', async () => {
  const { exportHaccpDocumentPdf } = await import('@/lib/haccp-export');
  vi.mocked(exportHaccpDocumentPdf).mockClear();
  const old = document('FO-H-17-01', [{ ...values(getHaccpForm('FO-H-17-01')!.rowFields), day: '19' }]);
  old.headerValues.month = '13'; state.documents = [old]; await mount('FO-H-17-01');
  await act(async () => nodes('IconButton').find(node => node.props.label === 'Export PDF')!.props.onPress());
  expect(exportHaccpDocumentPdf).not.toHaveBeenCalled(); expect(old.headerValues.month).toBe('13');
});

it('blocks saving legacy duplicate matrix days without deleting either record', async () => {
  const original = values(getHaccpForm('FO-H-06-03')!.rowFields);
  const old = document('FO-H-06-03', [{ ...original, day: '2' }, { ...original, day: '2' }]);
  state.documents = [old]; await mount('FO-H-06-03'); await openExisting(); await press('Save form');
  expect(state.save).not.toHaveBeenCalled(); expect(old.rows).toHaveLength(2);
});
