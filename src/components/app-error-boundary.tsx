/**
 * MANAGER 24/7™ by PARADIM — proprietary software.
 * Copyright © 2026 PARADIM Operations SRL. All rights reserved.
 * Concept author and product director: Marius Paul Nemeșu.
 * See LICENSE-PROPRIETARY.md.
 */

import { Component, useEffect, useState, type ErrorInfo, type ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Text, View, StyleSheet } from 'react-native';

import { AppButton } from '@/components/ui';
import { Brand, Fonts } from '@/constants/theme';
import { reportClientError } from '@/lib/client-errors';
import { captureRenderCrash } from '@/lib/crash-reporting';
import { detectDeviceLocale, LOCALE_STORAGE_KEY } from '@/contexts/locale-context';
import { translate, type Locale } from '@/i18n/translations';

export class AppErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: Error, info: ErrorInfo) {
    captureRenderCrash(error);
    void reportClientError(error, 'render', false, info.componentStack ?? '');
    console.error('Manager24/7 render error', error.message, info.componentStack);
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return <AppErrorFallback onRetry={() => this.setState({ failed: false })} />;
  }
}

// The root boundary also covers LocaleProvider, so its fallback reads the saved
// preference independently instead of depending on the failed provider tree.
function AppErrorFallback({ onRetry }: { onRetry: () => void }) {
  const [locale, setLocale] = useState<Locale>(detectDeviceLocale);
  useEffect(() => {
    let active = true;
    void AsyncStorage.getItem(LOCALE_STORAGE_KEY).then((stored) => {
      if (active && (stored === 'ro' || stored === 'en')) setLocale(stored);
    }).catch(() => undefined);
    return () => { active = false; };
  }, []);
  return (
      <View style={styles.screen}>
        <Text style={styles.title}>{translate(locale, 'operational.shared.crashTitle')}</Text>
        <Text style={styles.body}>{translate(locale, 'operational.shared.crashBody')}</Text>
        <AppButton label={translate(locale, 'operational.shared.reload')} icon="refresh" onPress={onRetry} />
      </View>
    );
}

const styles = StyleSheet.create({
  screen: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24, backgroundColor: Brand.cream },
  title: { color: Brand.navyDeep, fontFamily: Fonts.extraBold, fontSize: 22, textAlign: 'center' },
  body: { color: Brand.muted, fontFamily: Fonts.regular, fontSize: 14, lineHeight: 21, textAlign: 'center' },
});
