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
import { saveHrEmployee } from '@/lib/hr-repository';

let tree: ReactTestRenderer | undefined;
const find = (type: string) => tree!.root.findAll(node => node.type === type);
const text = () => find('Text').map(node => node.children.join('')).join(' ');
async function render() { await act(async () => { tree = create(createElement(HrScreen)); }); }

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  fixture.locale = 'en'; fixture.mode = 'schedule';
  vi.mocked(saveHrEmployee).mockClear();
  vi.mocked(saveHrEmployee).mockImplementation(async (_userId, input) => ({ ...input, id: 'saved', createdAt: '', updatedAt: '' }));
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


describe('HR report month input', () => {
  it.each(['', '2026-99', '2026-00', '2026-2', 'abcd', '0000-01'])('retains invalid month %s while blocking misleading reports and exports', async (period) => {
    fixture.mode = 'reports';
    await render();
    await act(async () => find('Field').find(node => node.props.label === 'Month (YYYY-MM)')!.props.onChangeText(period));
    expect(find('Field').find(node => node.props.label === 'Month (YYYY-MM)')!.props.value).toBe(period);
    expect(find('Field').find(node => node.props.label === 'Month (YYYY-MM)')!.props.hint).toContain('YYYY-MM');
    expect(find('AppButton').filter(node => /^Download/.test(node.props.label)).every(node => node.props.disabled)).toBe(true);
    expect(find('SectionHeader').some(node => /timesheets.*0.0 hours/.test(node.props.title))).toBe(false);
    expect(find('Text').some(node => node.props.accessibilityRole === 'alert')).toBe(true);
  });

  it('restores exports and correct hours when the report month is corrected', async () => {
    fixture.mode = 'reports';
    await render();
    const month = () => find('Field').find(node => node.props.label === 'Month (YYYY-MM)')!;
    await act(async () => month().props.onChangeText('2026-99'));
    await act(async () => month().props.onChangeText(localIsoDate().slice(0, 7)));
    expect(find('AppButton').filter(node => /^Download/.test(node.props.label)).every(node => !node.props.disabled)).toBe(true);
    expect(find('SectionHeader').some(node => node.props.title === '1 timesheets · 8.5 hours')).toBe(true);
  });
});


describe('HR salary input validation', () => {
  it.each(['-100', '+100', '1,23,4', '12abc'])('keeps invalid salary %s visible and prevents employee save', async (raw) => {
    fixture.mode = 'employees';
    await render();
    const field = (label: string) => find('Field').find(node => node.props.label === label)!;
    await act(async () => field('Full name').props.onChangeText('QA Employee'));
    await act(async () => field('Monthly gross salary (RON)').props.onChangeText(raw));
    expect(field('Monthly gross salary (RON)').props.value).toBe(raw);
    expect(field('Monthly gross salary (RON)').props.hint).toContain('non-negative');
    const save = () => find('AppButton').find(node => node.props.label === 'Save employee')!;
    expect(save().props.disabled).toBe(true);
    await act(async () => save().props.onPress());
    expect(saveHrEmployee).not.toHaveBeenCalled();
  });

  it.each([['en', '1,234.56'], ['ro', '1.234,56']] as const)('saves a grouped %s salary accurately with empty optional net salary', async (locale, salary) => {
    fixture.locale = locale; fixture.mode = 'employees';
    await render();
    await act(async () => find('Field')[0].props.onChangeText('QA Employee'));
    await act(async () => find('Field')[2].props.onChangeText(salary));
    const save = find('AppButton').find(node => node.props.label === (locale === 'en' ? 'Save employee' : 'Salvează angajatul'))!;
    expect(save.props.disabled).toBe(false);
    await act(async () => save.props.onPress());
    expect(vi.mocked(saveHrEmployee).mock.calls[0][1]).toMatchObject({ grossSalary: 1234.56, netSalary: null });
  });
});
