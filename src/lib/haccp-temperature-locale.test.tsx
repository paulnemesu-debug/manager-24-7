import { createElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { translate, type Locale } from '@/i18n/translations';

const state = vi.hoisted(() => ({ locale: 'en' as Locale }));
vi.mock('@/contexts/locale-context', () => ({ useI18n: () => ({ locale: state.locale, t: (key: Parameters<typeof translate>[1], params?: Record<string, string | number>) => translate(state.locale, key, params) }) }));
vi.mock('react-native', () => ({ Platform: { select: (options: { default: unknown }) => options.default }, StyleSheet: { create: (styles: object) => styles }, View: 'View', Text: 'Text', Pressable: 'Pressable' }));
vi.mock('@expo/vector-icons', () => ({ Ionicons: 'Icon' }));
vi.mock('@/components/roller-picker-modal', () => ({ RollerPickerModal: 'RollerPickerModal' }));
import { HaccpTemperatureInput } from '@/components/haccp-temperature-input';

let tree: ReactTestRenderer | undefined;
const find = (type: string) => tree!.root.findAll(node => node.type === type);
const text = () => find('Text').map(node => node.children.join('')).join(' ');
beforeEach(() => { vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); state.locale = 'en'; });
afterEach(async () => { await act(async () => tree?.unmount()); tree = undefined; vi.unstubAllGlobals(); });

describe('HACCP temperature display locale', () => {
  it('localizes the initial value, warning and accessible step controls without writing a reading', async () => {
    const onChange = vi.fn();
    const props = { label: 'Temperature', value: '', criticalMin: 60, onChange };
    await act(async () => { tree = create(createElement(HaccpTemperatureInput, props)); });
    expect(text()).toContain('0.0');
    expect(text()).toContain('NON-CONFORMING');
    const labels = find('Pressable').map(node => node.props.accessibilityLabel);
    expect(labels).toContain('Minus 0.5 degrees');
    expect(labels).toContain('Plus 0.5 degrees');
    state.locale = 'ro';
    await act(async () => { tree!.update(createElement(HaccpTemperatureInput, props)); });
    expect(text()).toContain('0,0');
    expect(text()).toContain('NECONFORM');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('shows decimal points for saved comma values while retaining picker values and numeric adjustments', async () => {
    const onChange = vi.fn();
    await act(async () => { tree = create(createElement(HaccpTemperatureInput, { label: 'Temperature', value: '-18,5', onChange })); });
    expect(text()).toContain('-18.5');
    const picker = find('RollerPickerModal')[0];
    expect(picker.props.values.temperature).toBe('-18,5');
    expect(picker.props.columns[0].items.find((item: { value: string }) => item.value === '-18,5').label).toBe('-18.5');
    await act(async () => find('Pressable').find(node => node.props.accessibilityLabel === 'Plus 0.5 degrees')!.props.onPress());
    expect(onChange).toHaveBeenCalledWith('-18');
  });
});
