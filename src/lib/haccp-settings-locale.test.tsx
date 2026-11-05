import { createElement, useEffect } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ locale: 'en', profile: { defaultLocationId: null, defaultLocationName: 'Locația mea', responsibleName: 'Ștefan', shiftStartTime: '08:00' },
  equipment: { id: 'fridge', name: 'Frigider Ștefan', kind: 'cold', criticalMin: 0, criticalMax: 4, requiredReadings: 3, readingTimes: ['06:00', '12:00', '18:00'], active: true, sortOrder: 1, locationId: null },
}));
vi.mock('@/contexts/locale-context', () => ({ useI18n: () => ({ locale: state.locale }) }));
vi.mock('@/contexts/auth-context', () => ({ useAuth: () => ({ user: null }) }));
vi.mock('expo-router', () => ({ useRouter: () => ({ push: vi.fn() }), useFocusEffect: (callback: () => void | (() => void)) => useEffect(callback, [callback]) }));
vi.mock('react-native', () => ({ Platform: { select: (values: { default: unknown }) => values.default }, Alert: { alert: vi.fn() }, StyleSheet: { create: (styles: object) => styles }, View: 'View', Text: 'Text' }));
vi.mock('@expo/vector-icons', () => ({ Ionicons: 'Icon' }));
vi.mock('@/components/tool-header', () => ({ ToolHeader: 'ToolHeader' }));
vi.mock('@/components/haccp-time-input', () => ({ HaccpTimeInput: 'HaccpTimeInput' }));
vi.mock('@/components/inputs', () => ({ ChoiceRow: 'ChoiceRow', Select: 'Select' }));
vi.mock('@/components/ui', () => Object.fromEntries(['AppButton', 'Body', 'Card', 'Field', 'IconButton', 'Screen', 'SectionHeader', 'StatusPill'].map(name => [name, name])));
vi.mock('@/lib/locations-repository', () => ({ listLocations: async () => [] }));
vi.mock('@/lib/haccp-routine-repository', () => ({ defaultHaccpProfile: () => state.profile,
  loadHaccpProfileForEntry: async () => state.profile, readHaccpProfileSnapshot: async () => state.profile,
  readHaccpEquipmentRegistrySnapshot: async () => [state.equipment],
  listHaccpEquipment: async () => [state.equipment], saveHaccpProfile: vi.fn(), saveHaccpEquipment: vi.fn(), deactivateHaccpEquipment: vi.fn(),
}));

import HaccpSettingsScreen from '@/app/tools/haccp-settings';

let tree: ReactTestRenderer | undefined;
const find = (type: string) => tree!.root.findAll(node => node.type === type);
const eyebrows = () => find('SectionHeader').map(node => node.props.eyebrow);
beforeEach(() => { vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); state.locale = 'en'; });
afterEach(async () => { await act(async () => tree?.unmount()); tree = undefined; vi.unstubAllGlobals(); });

it('updates HACCP setup section labels with locale, including edit mode, without translating saved names', async () => {
  await act(async () => { tree = create(createElement(HaccpSettingsScreen)); });
  expect(eyebrows()).toEqual(['AUTOMATIC HEADER', 'LOCATION', 'REGISTER', 'NEW EQUIPMENT']);
  await act(async () => find('IconButton').find(node => node.props.label === 'Edit')!.props.onPress());
  expect(eyebrows()).toContain('EDITING');
  expect(find('SectionHeader').at(-1)?.props.title).toBe('Frigider Ștefan');
  state.locale = 'ro';
  await act(async () => tree!.update(createElement(HaccpSettingsScreen)));
  expect(eyebrows()).toEqual(['ANTET AUTOMAT', 'LOCAȚIE', 'NOMENCLATOR', 'EDITARE']);
  expect(find('SectionHeader').at(-1)?.props.title).toBe('Frigider Ștefan');
  expect(state.equipment.name).toBe('Frigider Ștefan');
});

it('H05 cancel equipment edit resets both limits to the new fridge defaults', async () => {
  const previous = { ...state.equipment };
  Object.assign(state.equipment, { kind: 'frozen', criticalMin: -24, criticalMax: -18 });
  try {
    await act(async () => { tree = create(createElement(HaccpSettingsScreen)); });
    await act(async () => find('IconButton').find(node => node.props.label === 'Edit')!.props.onPress());
    await act(async () => find('AppButton').find(node => node.props.label === 'Cancel editing')!.props.onPress());
    expect(find('ChoiceRow').find(node => node.props.label === 'Type')!.props.value).toBe('cold');
    expect(find('Field').find(node => node.props.label === 'Min °C')!.props.value).toBe('0');
    expect(find('Field').find(node => node.props.label === 'Max °C')!.props.value).toBe('4');
  } finally { Object.assign(state.equipment, previous); }
});

it.each(['abc', '2kg', 'Infinity', '1.2.3'])('H06 rejects nonnumeric equipment minimum %s without saving', async raw => {
  const { saveHaccpEquipment } = await import('@/lib/haccp-routine-repository');
  vi.mocked(saveHaccpEquipment).mockClear();
  await act(async () => { tree = create(createElement(HaccpSettingsScreen)); });
  await act(async () => find('Field').find(node => node.props.label === 'Name')!.props.onChangeText('QA fridge'));
  await act(async () => find('Field').find(node => node.props.label === 'Min °C')!.props.onChangeText(raw));
  await act(async () => find('AppButton').find(node => node.props.label === 'Save equipment')!.props.onPress());
  expect(saveHaccpEquipment).not.toHaveBeenCalled();
});
