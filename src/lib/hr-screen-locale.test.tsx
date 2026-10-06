import { createElement, useEffect } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { HrData } from '@/types/hr';
import { localIsoDate } from '@/lib/local-date-time';

const fixture = vi.hoisted(() => ({ locale: 'en', mode: 'schedule', data: { employees: [], shifts: [] } as HrData }));
vi.mock('@/contexts/locale-context', () => ({ useI18n: () => ({ locale: fixture.locale }) }));
vi.mock('@/contexts/auth-context', () => ({ useAuth: () => ({ user: null }) }));
vi.mock('@/hooks/use-focused-sync-retry', () => ({ useFocusedSyncRetry: () => undefined }));
vi.mock('@/lib/hr-export', () => ({ exportHrExcel: vi.fn(), exportHrPdf: vi.fn() }));
vi.mock('@/lib/hr-repository', () => ({ loadHrData: async () => fixture.data, removeHrEmployee: vi.fn(), removeHrShift: vi.fn(), saveHrEmployee: vi.fn(), saveHrShift: vi.fn() }));
vi.mock('@/lib/locations-repository', () => ({ listLocations: async () => [] }));
vi.mock('expo-router', () => ({ useRouter: () => ({ push: vi.fn(), setParams: vi.fn() }), useLocalSearchParams: () => ({ mode: fixture.mode }), useFocusEffect: (callback: () => void) => useEffect(callback, [callback]) }));
vi.mock('react-native', () => ({ Platform: { OS: 'web', select: (values: { default: unknown }) => values.default }, Alert: { alert: vi.fn() }, StyleSheet: { create: (styles: object) => styles }, View: 'View', Text: 'Text', Pressable: 'Pressable' }));
vi.mock('@expo/vector-icons', () => ({ Ionicons: 'Icon' }));
vi.mock('@/components/haccp-date-input', () => ({ HaccpDateInput: 'DateInput' }));
vi.mock('@/components/haccp-time-input', () => ({ HaccpTimeInput: 'TimeInput' }));
vi.mock('@/components/inputs', () => ({ ChoiceRow: 'ChoiceRow', Select: 'Select' }));
vi.mock('@/components/tool-header', () => ({ ToolHeader: 'ToolHeader' }));
vi.mock('@/components/ui', () => Object.fromEntries(['AppButton','Body','Card','Field','ListSkeleton','Screen','SectionHeader','StatusPill'].map(name => [name, name])));

import HrScreen from '@/app/tools/hr';

let tree: ReactTestRenderer | undefined;
const find = (type: string) => tree!.root.findAll(node => node.type === type);
const text = () => find('Text').map(node => node.children.join('')).join(' ');
async function render() { await act(async () => { tree = create(createElement(HrScreen)); }); }

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  fixture.locale = 'en'; fixture.mode = 'schedule';
  const stamp = new Date().toISOString();
  fixture.data = {
    employees: [{ id: 'person', name: 'Ștefan', role: '', locationId: null, locationName: '', grossSalary: 1250.5, netSalary: 850.25, active: true, createdAt: stamp, updatedAt: stamp }],
    shifts: [{ id: 'shift', employeeId: 'person', workDate: `${localIsoDate().slice(0, 7)}-01`, plannedStart: '08:00', plannedEnd: '16:30', actualStart: '08:00', actualEnd: '16:30', status: 'present', notes: '', updatedAt: stamp }],
  };
});
afterEach(async () => { await act(async () => tree?.unmount()); tree = undefined; vi.unstubAllGlobals(); });

describe('HR screen locale formatting', () => {
  it.each([['en', '8.5', 'hours', 'MO'], ['ro', '8,5', 'ore', 'LU']])('uses %s decimals consistently in calendar and totals', async (locale, value, hours, weekday) => {
    fixture.locale = locale;
    await render();
    expect(find('Text').some(node => node.children.join('') === value)).toBe(true);
    expect(find('StatusPill').some(node => node.props.label === `${value} ${hours}`)).toBe(true);
    expect(text()).toContain(weekday);
    expect(find('DateInput').every(node => node.props.locale === locale)).toBe(true);
    expect(find('TimeInput').every(node => node.props.locale === locale)).toBe(true);
    if (locale === 'en') {
      expect(text()).toContain('No job title');
      expect(text()).not.toContain('8,5');
      expect(text()).toContain('Ștefan');
    }
  });

  it.each([['en', 'Edit Ștefan', 'Monthly gross salary (RON)', '1250.5'], ['ro', 'Editează Ștefan', 'Salariu brut lunar (lei)', '1250,5']])('opens a salary draft using %s decimal input without changing the saved amount', async (locale, action, label, expected) => {
    fixture.locale = locale; fixture.mode = 'employees';
    await render();
    await act(async () => find('Pressable').find(node => node.props.accessibilityLabel === action)!.props.onPress());
    expect(find('Field').find(node => node.props.label === label)?.props.value).toBe(expected);
    expect(fixture.data.employees[0].grossSalary).toBe(1250.5);
  });
});
