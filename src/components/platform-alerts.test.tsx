import { createElement, StrictMode } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const adapters = vi.hoisted(() => ({ locale: 'ro', original: vi.fn() }));
vi.mock('@/contexts/locale-context', () => ({ useI18n: () => ({ locale: adapters.locale }) }));
vi.mock('react-native', () => ({
  Alert: { alert: adapters.original },
  Modal: 'Modal', Pressable: 'Pressable', ScrollView: 'ScrollView', Text: 'Text', View: 'View',
  StyleSheet: { create: (styles: unknown) => styles },
  Platform: { select: (options: { default: unknown }) => options.default },
}));

import { Alert } from 'react-native';
// eslint-disable-next-line import/no-duplicates -- Exercise both platform implementations; Expo's lint resolver prefers .web.
import { PlatformAlerts } from './platform-alerts.web';
// eslint-disable-next-line import/no-duplicates -- Vitest resolves this extensionless import to the native no-op file.
import { PlatformAlerts as NativePlatformAlerts } from './platform-alerts';

let renderer: ReactTestRenderer | undefined;
function press(label: string) {
  return renderer!.root.findByProps({ accessibilityRole: 'button', accessibilityLabel: label }).props.onPress as () => void;
}
function content() { return JSON.stringify(renderer!.toJSON()); }
function requestClose() { renderer!.root.findByType('Modal' as never).props.onRequestClose(); }

beforeEach(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  adapters.locale = 'ro';
  Alert.alert = adapters.original;
  vi.clearAllMocks();
  await act(async () => { renderer = create(createElement(PlatformAlerts)); });
});
afterEach(async () => {
  await act(async () => { renderer?.unmount(); });
  renderer = undefined;
  Alert.alert = adapters.original;
  vi.unstubAllGlobals();
});

describe('web alert bridge', () => {
  it('displays validation text in an accessible, scrollable modal and localizes the default acknowledgement', async () => {
    await act(async () => { Alert.alert('Document nesalvat', 'Expirarea trebuie să fie după emitere.'); });
    expect(content()).toContain('Document nesalvat');
    expect(content()).toContain('Expirarea trebuie să fie după emitere.');
    expect(renderer!.root.findByType('Modal' as never).props.accessibilityLabel).toBe('Document nesalvat');
    expect(renderer!.root.findAllByType('ScrollView' as never)).toHaveLength(1);
    expect(press('Am înțeles')).toBeTypeOf('function');
    adapters.locale = 'en';
    await act(async () => { renderer!.update(createElement(PlatformAlerts)); });
    await act(async () => { press('OK')(); });
    expect(renderer!.toJSON()).toBeNull();
    expect(adapters.original).not.toHaveBeenCalled();
  });

  it('preserves cancel and destructive choices and invokes only the chosen callback once', async () => {
    const cancel = vi.fn();
    const remove = vi.fn();
    const dismissed = vi.fn();
    const show = () => Alert.alert('Ștergi angajatul?', 'Ștergere definitivă', [
      { text: 'Renunță', style: 'cancel', onPress: cancel },
      { text: 'Șterge', style: 'destructive', onPress: remove },
    ], { cancelable: true, onDismiss: dismissed });
    await act(async () => { show(); });
    const cancelPress = press('Renunță');
    await act(async () => { cancelPress(); cancelPress(); });
    expect(cancel).toHaveBeenCalledOnce();
    expect(remove).not.toHaveBeenCalled();
    expect(dismissed).not.toHaveBeenCalled();
    await act(async () => { show(); });
    const deletePress = press('Șterge');
    await act(async () => { deletePress(); deletePress(); });
    expect(remove).toHaveBeenCalledOnce();
    expect(dismissed).not.toHaveBeenCalled();
  });

  it('only dismisses cancelable alerts and never treats dismissal as confirmation or a cancel button press', async () => {
    const confirm = vi.fn();
    const cancel = vi.fn();
    const dismissed = vi.fn();
    await act(async () => { Alert.alert('Required', '', [{ text: 'Confirm', onPress: confirm }], { onDismiss: dismissed }); });
    await act(async () => { requestClose(); });
    expect(content()).toContain('Required');
    expect(confirm).not.toHaveBeenCalled();
    expect(dismissed).not.toHaveBeenCalled();
    await act(async () => { press('Confirm')(); });
    confirm.mockClear();
    await act(async () => {
      Alert.alert('Optional', '', [{ text: 'Cancel', style: 'cancel', onPress: cancel }, { text: 'Delete', style: 'destructive', onPress: confirm }], { cancelable: true, onDismiss: dismissed });
    });
    const backdropPress = press('Închide mesajul');
    await act(async () => { backdropPress(); backdropPress(); });
    expect(dismissed).toHaveBeenCalledOnce();
    expect(confirm).not.toHaveBeenCalled();
    expect(cancel).not.toHaveBeenCalled();
    expect(renderer!.toJSON()).toBeNull();
  });

  it('queues alerts in order, including alerts raised by a button callback', async () => {
    await act(async () => {
      Alert.alert('First', 'One', [{ text: 'Continue', onPress: () => Alert.alert('Third', 'Three') }]);
      Alert.alert('Second', 'Two', []);
    });
    expect(content()).toContain('First');
    expect(content()).not.toContain('Second');
    const firstPress = press('Continue');
    await act(async () => { firstPress(); firstPress(); });
    expect(content()).toContain('Second');
    expect(content()).not.toContain('Third');
    await act(async () => { press('Am înțeles')(); });
    expect(content()).toContain('Third');
    await act(async () => { press('Am înțeles')(); });
    expect(renderer!.toJSON()).toBeNull();
  });

  it('survives development effect replay and handles an Escape dismissal once', async () => {
    await act(async () => { renderer!.unmount(); });
    await act(async () => { renderer = create(createElement(StrictMode, null, createElement(PlatformAlerts))); });
    const dismissed = vi.fn();
    await act(async () => { Alert.alert('Dismissible', '', undefined, { cancelable: true, onDismiss: dismissed }); });
    const escape = renderer!.root.findByType('Modal' as never).props.onRequestClose;
    await act(async () => { escape(); escape(); });
    expect(dismissed).toHaveBeenCalledOnce();
    expect(renderer!.toJSON()).toBeNull();
    await act(async () => { renderer!.unmount(); });
    renderer = undefined;
    expect(Alert.alert).toBe(adapters.original);
  });

  it('restores the original adapter and invalidates queued callbacks on unmount', async () => {
    const callback = vi.fn();
    const installed = Alert.alert;
    await act(async () => { Alert.alert('Pending', '', [{ text: 'Delete', onPress: callback }]); });
    const stalePress = press('Delete');
    await act(async () => { renderer!.unmount(); });
    renderer = undefined;
    expect(Alert.alert).toBe(adapters.original);
    await act(async () => { stalePress(); installed('Stale'); });
    expect(callback).not.toHaveBeenCalled();
    expect(adapters.original).not.toHaveBeenCalled();
  });

  it('does not overwrite a later adapter on cleanup and keeps the native host a no-op', async () => {
    const later = vi.fn();
    Alert.alert = later;
    await act(async () => { renderer!.unmount(); });
    expect(Alert.alert).toBe(later);
    await act(async () => { renderer = create(createElement(NativePlatformAlerts)); });
    expect(renderer!.toJSON()).toBeNull();
    expect(Alert.alert).toBe(later);
  });
});
