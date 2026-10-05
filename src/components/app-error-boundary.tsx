/**
 * MANAGER 24/7™ by PARADIM — proprietary software.
 * Copyright © 2026 PARADIM Operations SRL. All rights reserved.
 * Concept author and product director: Marius Paul Nemeșu.
 * See LICENSE-PROPRIETARY.md.
 */

import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Text, View, StyleSheet } from 'react-native';

import { AppButton } from '@/components/ui';
import { Brand, Fonts } from '@/constants/theme';
import { reportClientError } from '@/lib/client-errors';
import { captureRenderCrash } from '@/lib/crash-reporting';

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
    return (
      <View style={styles.screen}>
        <Text style={styles.title}>Aplicația a întâmpinat o problemă</Text>
        <Text style={styles.body}>Datele salvate local nu au fost șterse. Reîncarcă ecranul și încearcă din nou.</Text>
        <AppButton label="Reîncarcă" icon="refresh" onPress={() => this.setState({ failed: false })} />
      </View>
    );
  }
}

const styles = StyleSheet.create({
  screen: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24, backgroundColor: Brand.cream },
  title: { color: Brand.navyDeep, fontFamily: Fonts.extraBold, fontSize: 22, textAlign: 'center' },
  body: { color: Brand.muted, fontFamily: Fonts.regular, fontSize: 14, lineHeight: 21, textAlign: 'center' },
});
