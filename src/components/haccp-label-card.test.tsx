import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import type { TranslationKey } from '@/i18n/translations';
import type { Allergen } from '@/constants/allergens';

const state = vi.hoisted(() => ({
  html: [] as string[], alerts: [] as string[], locale: 'ro' as 'ro' | 'en',
  recipe: { id: 'r', title: 'Supă cremă de țelină', allergens: ['celery', 'milk'] as Allergen[] },
}));
vi.mock('react-native', () => ({ View: 'View', Text: 'Text', Platform: { OS: 'android' },
  StyleSheet: { create: (value: unknown) => value }, Alert: { alert: (_title: string, message: string) => state.alerts.push(message) } }));
vi.mock('@/constants/theme', () => ({ Brand: {}, Fonts: {} }));
vi.mock('@/components/ui', () => ({ AppButton: 'AppButton', Body: 'Body', Card: 'Card', Field: 'Field', SectionHeader: 'SectionHeader' }));
vi.mock('@/components/inputs', () => ({ ChoiceRow: 'ChoiceRow', Select: 'Select' }));
vi.mock('@/components/haccp-date-input', () => ({ HaccpDateInput: 'HaccpDateInput' }));
vi.mock('@/components/haccp-time-input', () => ({ HaccpTimeInput: 'HaccpTimeInput' }));
vi.mock('@/contexts/workspace-context', () => ({ useWorkspace: () => ({ recipes: [state.recipe] }) }));
vi.mock('@/contexts/locale-context', async () => {
  const { translate } = await import('@/i18n/translations');
  return { useI18n: () => ({ locale: state.locale, t: (key: TranslationKey) => translate(state.locale, key) }) };
});
vi.mock('expo-print', () => ({ printToFileAsync: async ({ html }: { html: string }) => { state.html.push(html); return { uri: 'file:///label.pdf' }; } }));
vi.mock('expo-sharing', () => ({ isAvailableAsync: async () => true, shareAsync: async () => undefined }));

import { HaccpLabelCard } from '@/components/haccp-label-card';
import { ALLERGEN_LABELS } from '@/constants/allergens';

let root: ReactTestRenderer;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  state.html = []; state.alerts = []; state.locale = 'ro';
  state.recipe = { id: 'r', title: 'Supă cremă de țelină', allergens: ['celery', 'milk'] };
});
afterEach(async () => { if (root) await act(async () => root.unmount()); vi.unstubAllGlobals(); });

async function exportLabel(size: '50x30' | '40x60', production?: { date: string; time: string; hours: number }) {
  await act(async () => { root = create(<HaccpLabelCard />); });
  await act(async () => root.root.find(node => String(node.type) === 'Select').props.onChange('r'));
  await act(async () => root.root.find(node => String(node.type) === 'ChoiceRow').props.onChange(size));
  if (production) {
    await act(async () => root.root.find(node => String(node.type) === 'HaccpDateInput').props.onChange(production.date));
    await act(async () => root.root.find(node => String(node.type) === 'HaccpTimeInput').props.onChange(production.time));
    await act(async () => root.root.find(node => String(node.type) === 'Field').props.onChangeText(String(production.hours)));
  }
  await act(async () => root.root.find(node => String(node.type) === 'AppButton').props.onPress());
}

it.each(['50x30', '40x60'] as const)('exports every required field on a fitting %s label', async size => {
  await exportLabel(size);
  expect(state.alerts).toEqual([]);
  expect(state.html).toHaveLength(1);
  const text = state.html[0].replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
  for (const value of ['Supă cremă de țelină', 'Produs la:', 'A se consuma până la:', 'Alergeni:', 'Țelină, Lapte']) expect(text).toContain(value);
});

it.each(['2026-10-25', '2026-03-29'])('keeps the exact elapsed shelf life across the %s clock change', async date => {
  await exportLabel('40x60', { date, time: '00:30', hours: 4 });
  const expected = new Date(new Date(`${date}T00:30:00`).getTime() + 4 * 60 * 60 * 1000);
  const expectedTime = new Intl.DateTimeFormat('ro-RO', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(expected);
  expect(state.alerts).toEqual([]);
  expect(state.html[0].replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ')).toContain(expectedTime);
});

it.each(['50x30', '40x60'] as const)('refuses a %s label whose long title would remove expiry or allergens', async size => {
  state.recipe.title = 'Supă cremă de țelină și legume cu crutoane de pâine integrală, smântână și semințe de susan';
  await exportLabel(size);
  expect(state.html).toEqual([]);
  expect(state.alerts.join(' ')).toMatch(/titlu.*scurt/i);
});

it('refuses the small label when all fourteen allergens cannot fit', async () => {
  state.recipe.allergens = Object.keys(ALLERGEN_LABELS.ro) as Allergen[];
  await exportLabel('50x30');
  expect(state.html).toEqual([]);
  expect(state.alerts.join(' ')).toContain('40 × 60');
});

it('keeps all fourteen allergens on the larger label', async () => {
  state.recipe.allergens = Object.keys(ALLERGEN_LABELS.ro) as Allergen[];
  await exportLabel('40x60');
  expect(state.alerts).toEqual([]);
  expect(state.html).toHaveLength(1);
  for (const allergen of ['Cereale', 'Lupin', 'Moluște']) expect(state.html[0]).toContain(allergen);
});

it('explains an oversized label in English without printing', async () => {
  state.locale = 'en'; state.recipe.title = 'Long recipe name '.repeat(20);
  await exportLabel('40x60');
  expect(state.html).toEqual([]);
  expect(state.alerts.join(' ')).toContain('shorter');
});
