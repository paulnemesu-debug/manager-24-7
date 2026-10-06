import { createElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ locale: 'en', profile: { defaultLocationId: null, defaultLocationName: 'Locația mea', responsibleName: 'Ștefan', shiftStartTime: '08:00' },
  equipment: { id: 'fridge', name: 'Frigider Ștefan', kind: 'cold', criticalMin: 0, criticalMax: 4, requiredReadings: 3, readingTimes: ['06:00', '12:00', '18:00'], active: true, sortOrder: 1, locationId: null },
}));
vi.mock('@/contexts/locale-context', () => ({ useI18n: () => ({ locale: state.locale }) }));
vi.mock('@/contexts/auth-context', () => ({ useAuth: () => ({ user: null }) }));
vi.mock('expo-router', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('react-native', () => ({ Platform: { select: (values: { default: unknown }) => values.default }, Alert: { alert: vi.fn() }, StyleSheet: { create: (styles: object) => styles }, View: 'View', Text: 'Text' }));
vi.mock('@expo/vector-icons', () => ({ Ionicons: 'Icon' }));
vi.mock('@/components/tool-header', () => ({ ToolHeader: 'ToolHeader' }));
vi.mock('@/components/haccp-time-input', () => ({ HaccpTimeInput: 'HaccpTimeInput' }));
vi.mock('@/components/inputs', () => ({ ChoiceRow: 'ChoiceRow', Select: 'Select' }));
vi.mock('@/components/ui', () => Object.fromEntries(['AppButton', 'Body', 'Card', 'Field', 'IconButton', 'Screen', 'SectionHeader', 'StatusPill'].map(name => [name, name])));
vi.mock('@/lib/locations-repository', () => ({ listLocations: async () => [] }));
vi.mock('@/lib/haccp-routine-repository', () => ({ defaultHaccpProfile: () => state.profile, loadHaccpProfile: async () => state.profile,
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
