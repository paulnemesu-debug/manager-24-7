import { createElement, useEffect } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { translate, type TranslationKey } from '@/i18n/translations';
import { currentPnlPeriod, EMPTY_PNL_INPUTS } from '@/lib/pnl';
import type { HrData, HrEmployee } from '@/types/hr';
import type { PnlReport, PnlReportDraft } from '@/types/pnl';

const fixture = vi.hoisted(() => ({
  data: { employees: [], shifts: [] } as HrData,
  reports: [] as PnlReport[],
  hrError: false,
  reportError: false,
  refocus: () => {},
  push: vi.fn(),
  saved: [] as PnlReportDraft[],
  deferSave: false,
  finishSave: undefined as undefined | (() => void),
  userId: null as string | null,
  locale: 'en' as 'en' | 'ro',
}));

vi.mock('@/contexts/auth-context', () => ({ useAuth: () => ({ user: fixture.userId ? { id: fixture.userId } : null }) }));
vi.mock('@/contexts/locale-context', () => ({ useI18n: () => ({ locale: fixture.locale, t: (key: TranslationKey, params?: Record<string, string | number>) => translate(fixture.locale, key, params) }) }));
vi.mock('@/contexts/preferences-context', () => ({ usePreferences: () => ({ currency: 'RON', format: { money: String, percent: String } }) }));
vi.mock('@/lib/hr-repository', () => ({ loadHrData: async () => {
  if (fixture.hrError) throw new Error('HR storage unavailable');
  return fixture.data;
} }));
vi.mock('@/lib/pnl-repository', () => ({
  createPnlReportId: () => 'new-report',
  syncPnlReports: async () => {
    if (fixture.reportError) throw new Error('P&L storage unavailable');
    return fixture.reports;
  },
  savePnlReport: async (_userId: string, draft: PnlReportDraft) => {
    fixture.saved.push(draft);
    if (fixture.deferSave) await new Promise<void>((resolve) => { fixture.finishSave = resolve; });
    const report = { ...draft, createdAt: '', updatedAt: '', syncState: 'local' };
    fixture.reports = [report as PnlReport, ...fixture.reports.filter(item => item.period !== draft.period)];
    return report;
  },
}));
vi.mock('expo-router', () => ({
  useRouter: () => ({ push: fixture.push }),
  useFocusEffect: (callback: () => undefined | (() => void)) => useEffect(() => {
    let cleanup: undefined | (() => void);
    fixture.refocus = () => { cleanup?.(); cleanup = callback(); };
    fixture.refocus();
    return () => { cleanup?.(); fixture.refocus = () => {}; };
  }, [callback]),
}));
vi.mock('react-native', () => ({
  Platform: { OS: 'web', select: (values: { default: unknown }) => values.default },
  Alert: { alert: vi.fn() }, StyleSheet: { create: (styles: object) => styles },
  View: 'View', Text: 'Text', Pressable: 'Pressable',
}));
vi.mock('@expo/vector-icons', () => ({ Ionicons: 'Icon' }));
vi.mock('expo-haptics', () => ({ notificationAsync: async () => {}, NotificationFeedbackType: { Success: 'success', Error: 'error' } }));
vi.mock('@/components/tool-header', () => ({ ToolHeader: 'ToolHeader' }));
vi.mock('@/components/ui', () => Object.fromEntries(['AppButton', 'Body', 'Card', 'Field', 'ListSkeleton', 'Screen', 'SectionHeader', 'StatusPill'].map(name => [name, name])));

import PnlScreen from '@/app/tools/pnl';

let tree: ReactTestRenderer | undefined;
const find = (type: string) => tree!.root.findAll(node => node.type === type);
const field = (label: string) => find('Field').find(node => node.props.label === `${label} (RON)`)!;
const saveButton = () => find('Screen')[0].props.footer.props;
const button = (label: string) => find('AppButton').find(node => node.props.label === label)!;
const employee = (id: string, grossSalary: number | null, active = true): HrEmployee => ({
  id, name: id, grossSalary, active, role: '', locationId: null, locationName: '', netSalary: null, createdAt: '', updatedAt: '',
});
function report(period: string, payrollCost: number): PnlReport {
  return { ...EMPTY_PNL_INPUTS, id: `report-${period}`, period, payrollCost, revenueFood: 20_000, notes: '', createdAt: '', updatedAt: '', syncState: 'local' };
}
function previousPeriod() {
  const [year, month] = currentPnlPeriod().split('-').map(Number);
  return currentPnlPeriod(new Date(year, month - 2, 1, 12));
}
async function render() { await act(async () => { tree = create(createElement(PnlScreen)); }); }

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  fixture.data = { employees: [], shifts: [] };
  fixture.reports = [];
  fixture.hrError = false;
  fixture.reportError = false;
  fixture.refocus = () => {};
  fixture.push.mockClear();
  fixture.saved = [];
  fixture.deferSave = false;
  fixture.finishSave = undefined;
  fixture.userId = null;
  fixture.locale = 'en';
});
afterEach(async () => { await act(async () => tree?.unmount()); tree = undefined; vi.unstubAllGlobals(); });

describe('P&L automatic HR payroll', () => {
  it('shows zero explicitly and opens HR to complete employee salaries', async () => {
    await render();
    expect(field('Gross salaries from HR').props.value).toBe('0');
    expect(field('Gross salaries from HR').props.editable).toBe(false);
    await act(async () => button('Edit salaries in HR').props.onPress());
    expect(fixture.push).toHaveBeenCalledWith('/tools/hr?mode=employees');
  });

  it('sums gross salaries for active employees, including decimals and excluding departed employees', async () => {
    fixture.data.employees = [employee('Ana', 1500.5), employee('Dan', 2000), employee('Left', 9000, false), employee('Unset', null)];
    await render();
    expect(field('Gross salaries from HR').props.value).toBe('3500.5');
    expect(field('Gross salaries from HR').props.hint).toContain('1 active employee(s)');
  });

  it('refreshes HR salary on return while retaining unsaved revenue and notes', async () => {
    fixture.data.employees = [employee('Ana', 3000)];
    await render();
    await act(async () => {
      field('Food').props.onChangeText('12345');
      find('Field').find(node => node.props.label === 'Notes')!.props.onChangeText('Keep my draft');
    });
    fixture.data.employees = [employee('Ana', 4500)];
    await act(async () => fixture.refocus());
    expect(field('Gross salaries from HR').props.value).toBe('4500');
    expect(field('Food').props.value).toBe('12345');
    expect(find('Field').find(node => node.props.label === 'Notes')!.props.value).toBe('Keep my draft');
  });

  it('preserves the saved salary snapshot when opening and saving a previous month', async () => {
    fixture.data.employees = [employee('Ana', 8000)];
    fixture.reports = [report(previousPeriod(), 4200)];
    await render();
    await act(async () => find('Pressable').find(node => node.props.accessibilityLabel === 'Previous')!.props.onPress());
    expect(field('Gross salaries from HR').props.value).toBe('4200');
    await act(async () => saveButton().onPress());
    expect(fixture.saved[0].payrollCost).toBe(4200);
    expect(fixture.saved[0].period).toBe(previousPeriod());
  });

  it('retains loaded P&L data if HR fails and blocks saving until payroll can be retried', async () => {
    fixture.reports = [report(currentPnlPeriod(), 4200)];
    fixture.hrError = true;
    await render();
    expect(field('Food').props.value).toBe('20000');
    expect(field('Gross salaries from HR').props.value).toBe('4200');
    expect(saveButton().disabled).toBe(true);
    await act(async () => saveButton().onPress());
    expect(fixture.saved).toHaveLength(0);
    fixture.hrError = false;
    fixture.data.employees = [employee('Ana', 7000)];
    await act(async () => button('Try again').props.onPress());
    expect(field('Gross salaries from HR').props.value).toBe('7000');
    expect(saveButton().disabled).toBe(false);
  });

  it('blocks a fresh P&L save when HR is unavailable instead of silently saving zero', async () => {
    fixture.hrError = true;
    await render();
    expect(saveButton().disabled).toBe(true);
    await act(async () => saveButton().onPress());
    expect(fixture.saved).toHaveLength(0);
  });

  it('does not overwrite saved reports with an empty draft after a report load failure', async () => {
    fixture.reportError = true;
    fixture.reports = [report(currentPnlPeriod(), 4200)];
    fixture.data.employees = [employee('Ana', 7000)];
    await render();
    expect(saveButton().disabled).toBe(true);
    fixture.reportError = false;
    await act(async () => button('Try again').props.onPress());
    expect(field('Food').props.value).toBe('20000');
    expect(field('Gross salaries from HR').props.value).toBe('7000');
    expect(saveButton().disabled).toBe(false);
  });

  it('does not offer an editable empty report while the existing reports are unavailable', async () => {
    fixture.reportError = true;
    await render();
    expect(find('Field')).toHaveLength(0);
    expect(button('Try again')).toBeDefined();
  });

  it('keeps the refreshed HR total when an older save finishes after returning from HR', async () => {
    fixture.data.employees = [employee('Ana', 3000)];
    fixture.deferSave = true;
    await render();
    await act(async () => saveButton().onPress());
    fixture.data.employees = [employee('Ana', 4500)];
    await act(async () => fixture.refocus());
    expect(field('Gross salaries from HR').props.value).toBe('4500');
    await act(async () => fixture.finishSave!());
    expect(field('Gross salaries from HR').props.value).toBe('4500');
    fixture.deferSave = false;
    await act(async () => saveButton().onPress());
    expect(fixture.saved[1].payrollCost).toBe(4500);
  });

  it('does not replace the selected previous month when another month finishes saving', async () => {
    fixture.data.employees = [employee('Ana', 8000)];
    fixture.reports = [report(previousPeriod(), 4200)];
    fixture.deferSave = true;
    await render();
    await act(async () => field('Food').props.onChangeText('12345'));
    await act(async () => saveButton().onPress());
    await act(async () => find('Pressable').find(node => node.props.accessibilityLabel === 'Previous')!.props.onPress());
    await act(async () => fixture.finishSave!());
    expect(field('Gross salaries from HR').props.value).toBe('4200');
    expect(field('Food').props.value).toBe('20000');
    fixture.deferSave = false;
    await act(async () => saveButton().onPress());
    expect(fixture.saved[1].payrollCost).toBe(4200);
    expect(fixture.saved[1].period).toBe(previousPeriod());
  });

  it('does not insert a previous account’s delayed save into the newly loaded account', async () => {
    fixture.data.employees = [employee('Ana', 3000)];
    fixture.deferSave = true;
    await render();
    await act(async () => field('Food').props.onChangeText('12345'));
    await act(async () => saveButton().onPress());
    fixture.userId = 'another-account';
    fixture.data.employees = [employee('Dan', 9000)];
    fixture.reports = [report(currentPnlPeriod(), 9000)];
    await act(async () => tree!.update(createElement(PnlScreen)));
    await act(async () => fixture.finishSave!());
    await act(async () => find('Pressable').find(node => node.props.accessibilityLabel === 'Previous')!.props.onPress());
    await act(async () => find('Pressable').find(node => node.props.accessibilityLabel === 'Next')!.props.onPress());
    expect(field('Food').props.value).toBe('20000');
    expect(field('Gross salaries from HR').props.value).toBe('9000');
  });
});


describe('P&L money draft validation', () => {
  it.each([
    ['en', '1,234.56', 1234.56], ['ro', '1.234,56', 1234.56],
    ['en', '1 234.56', 1234.56], ['ro', '1\u00a0234,56', 1234.56],
    ['en', '1200,50', 1200.5], ['ro', '1200.50', 1200.5],
    ['en', '1,234', 1234], ['ro', '1.234', 1234],
    ['en', '', 0], ['ro', '0,00', 0],
  ] as const)('keeps the %s input %s visible and saves its amount', async (locale, raw, amount) => {
    fixture.locale = locale;
    await render();
    const revenueField = () => find('Field')[0];
    await act(async () => revenueField().props.onChangeText(raw));
    expect(revenueField().props.value).toBe(raw);
    expect(saveButton().disabled).toBe(false);
    await act(async () => saveButton().onPress());
    expect(fixture.saved[0].revenueFood).toBe(amount);
  });

  it.each(['-100', '+100', '1,23,4', '1,234.567', '1.234', '12abc', 'Infinity', '1e4', '999999999999999999999'])('retains invalid %s and blocks a financial save', async (raw) => {
    await render();
    await act(async () => field('Food').props.onChangeText(raw));
    expect(field('Food').props.value).toBe(raw);
    expect(field('Food').props.hint).toContain('non-negative');
    expect(saveButton().disabled).toBe(true);
    await act(async () => saveButton().onPress());
    expect(fixture.saved).toHaveLength(0);
  });

  it('allows correction and clearing without losing the typed decimal separator', async () => {
    await render();
    await act(async () => field('Food').props.onChangeText('-100'));
    await act(async () => field('Food').props.onChangeText('100.'));
    expect(field('Food').props.value).toBe('100.');
    expect(saveButton().disabled).toBe(true);
    await act(async () => field('Food').props.onChangeText('100.25'));
    expect(saveButton().disabled).toBe(false);
    await act(async () => saveButton().onPress());
    expect(fixture.saved[0].revenueFood).toBe(100.25);
    await act(async () => field('Food').props.onChangeText(''));
    expect(saveButton().disabled).toBe(false);
    await act(async () => saveButton().onPress());
    expect(fixture.saved[1].revenueFood).toBe(0);
  });

  it('preserves invalid draft text on HR refocus but discards it when selecting another period', async () => {
    fixture.data.employees = [employee('Ana', 3000)];
    await render();
    await act(async () => field('Food').props.onChangeText('-100'));
    fixture.data.employees = [employee('Ana', 4500)];
    await act(async () => fixture.refocus());
    expect(field('Food').props.value).toBe('-100');
    expect(field('Gross salaries from HR').props.value).toBe('4500');
    expect(saveButton().disabled).toBe(true);
    await act(async () => find('Pressable').find(node => node.props.accessibilityLabel === 'Previous')!.props.onPress());
    expect(field('Food').props.value).toBe('');
    expect(saveButton().disabled).toBe(false);
  });
});
