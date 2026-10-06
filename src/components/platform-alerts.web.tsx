import React, { useLayoutEffect, useRef, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View, type AlertButton } from 'react-native';

import { Brand, Fonts } from '@/constants/theme';
import { useI18n } from '@/contexts/locale-context';

type QueuedAlert = {
  id: number;
  title: string;
  message?: string;
  buttons: AlertButton[];
  options?: Parameters<typeof Alert.alert>[3];
};

/** React Native Web leaves Alert.alert empty; native builds use the no-op host. */
export function PlatformAlerts() {
  const { locale } = useI18n();
  const queue = useRef<QueuedAlert[]>([]);
  const nextId = useRef(0);
  const [current, setCurrent] = useState<QueuedAlert | null>(null);
  const acknowledgement = locale === 'ro' ? 'Am înțeles' : 'OK';

  useLayoutEffect(() => {
    const original = Alert.alert;
    let mounted = true;
    const adapter: typeof Alert.alert = (title, message, buttons, options) => {
      if (!mounted) return;
      const entry: QueuedAlert = {
        id: nextId.current++,
        title,
        message,
        buttons: buttons?.length ? buttons.map((button) => ({ ...button })) : [{}],
        options: options ? { ...options } : undefined,
      };
      queue.current.push(entry);
      if (queue.current.length === 1) setCurrent(entry);
    };
    setCurrent(null);
    Alert.alert = adapter;
    return () => {
      mounted = false;
      queue.current = [];
      // Preserve an adapter installed later by another owner (including hot reload).
      if (Alert.alert === adapter) Alert.alert = original;
    };
  }, []);

  const finish = (entry: QueuedAlert, callback?: () => void) => {
    // Remove before calling user code: double clicks and stale handlers cannot
    // repeat an action or accidentally consume the next alert in the queue.
    if (queue.current[0] !== entry) return;
    queue.current.shift();
    setCurrent(queue.current[0] ?? null);
    callback?.();
  };

  if (!current) return null;
  const dismiss = () => {
    if (current.options?.cancelable) finish(current, current.options.onDismiss);
  };

  return (
    <Modal
      visible
      transparent
      animationType="none"
      accessibilityLabel={current.title || (locale === 'ro' ? 'Mesaj' : 'Message')}
      onRequestClose={dismiss}>
      <View style={styles.overlay}>
        {current.options?.cancelable && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={locale === 'ro' ? 'Închide mesajul' : 'Dismiss message'}
            style={styles.backdrop}
            onPress={dismiss}
          />
        )}
        <View style={styles.card} accessibilityRole="alert" accessibilityLiveRegion="assertive">
          <ScrollView key={current.id} style={styles.scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            {!!current.title && <Text style={styles.title}>{current.title}</Text>}
            {!!current.message && <Text style={styles.message}>{current.message}</Text>}
            <View style={styles.buttons}>
              {current.buttons.map((button, index) => {
                const label = button.text ?? acknowledgement;
                return (
                  <Pressable
                    key={index}
                    accessibilityRole="button"
                    accessibilityLabel={label}
                    onPress={() => finish(current, button.onPress)}
                    style={({ pressed }) => [
                      styles.button,
                      button.style === 'cancel' && styles.cancel,
                      button.style === 'destructive' && styles.destructive,
                      pressed && styles.pressed,
                    ]}>
                    <Text style={[styles.buttonText, button.style === 'cancel' && styles.cancelText]}>{label}</Text>
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20, backgroundColor: 'rgba(3,27,51,0.62)' },
  backdrop: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  card: { width: '100%', maxWidth: 440, maxHeight: '90%', backgroundColor: Brand.white, borderRadius: 20, borderTopWidth: 4, borderTopColor: Brand.gold, overflow: 'hidden' },
  scroll: { flexShrink: 1 },
  content: { padding: 24, gap: 16 },
  title: { fontFamily: Fonts.extraBold, color: Brand.navyDeep, fontSize: 21, lineHeight: 29 },
  message: { fontFamily: Fonts.regular, color: Brand.ink, fontSize: 15, lineHeight: 23 },
  buttons: { gap: 10, paddingTop: 8 },
  button: { minHeight: 48, paddingVertical: 12, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: Brand.navy },
  cancel: { backgroundColor: Brand.cream, borderWidth: 1, borderColor: Brand.line },
  destructive: { backgroundColor: Brand.red },
  pressed: { opacity: 0.8 },
  buttonText: { color: Brand.white, fontFamily: Fonts.bold, fontSize: 15, textAlign: 'center' },
  cancelText: { color: Brand.navyDeep },
});
