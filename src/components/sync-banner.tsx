/**
 * MANAGER 24/7™ by PARADIM — proprietary software.
 * Copyright © 2026 PARADIM Operations SRL. All rights reserved.
 * Concept author and product director: Marius Paul Nemeșu.
 * See LICENSE-PROPRIETARY.md.
 */

import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Brand, Fonts, Radius } from '@/constants/theme';
import { useI18n } from '@/contexts/locale-context';
import { useWorkspace } from '@/contexts/workspace-context';

export function SyncBanner() {
  const { t } = useI18n();
  const { syncState, pendingChanges, failedChanges, dismissFailedChanges, refresh } = useWorkspace();

  if (failedChanges > 0) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('offline.failedDismiss')}
        onPress={() => void dismissFailedChanges()}
        style={({ pressed }) => [styles.banner, styles.failed, pressed && styles.pressed]}>
        <Ionicons name="alert-circle-outline" size={16} color={Brand.red} />
        <View style={styles.copy}>
          <Text style={styles.title}>{t('offline.failedTitle')}</Text>
          <Text style={styles.body}>{t('offline.failedBody', { count: failedChanges })}</Text>
        </View>
        <Text style={styles.retry}>{t('offline.failedDismiss')}</Text>
      </Pressable>
    );
  }

  if (syncState === 'online' && pendingChanges === 0) return null;

  const offline = syncState === 'offline';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('offline.retry')}
      onPress={() => void refresh()}
      style={({ pressed }) => [
        styles.banner,
        offline ? styles.offline : styles.syncing,
        pressed && styles.pressed,
      ]}>
      <Ionicons
        name={offline ? 'cloud-offline-outline' : 'sync-outline'}
        size={16}
        color={offline ? Brand.amber : Brand.teal}
      />
      <View style={styles.copy}>
        <Text style={styles.title}>
          {offline ? t('offline.title') : t('offline.syncing')}
        </Text>
        <Text style={styles.body}>
          {pendingChanges > 0
            ? t('offline.pending', { count: pendingChanges })
            : t('offline.cached')}
        </Text>
      </View>
      <Text style={styles.retry}>{t('offline.retry')}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    borderRadius: Radius.medium,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  offline: { backgroundColor: Brand.amberSoft, borderColor: '#EBCB8B' },
  syncing: { backgroundColor: Brand.tealSoft, borderColor: '#B8E3DC' },
  failed: { backgroundColor: Brand.redSoft, borderColor: '#E9B6B6' },
  copy: { flex: 1 },
  title: { color: Brand.navyDeep, fontSize: 12, fontFamily: Fonts.extraBold },
  body: { color: Brand.muted, fontSize: 10, marginTop: 1 },
  retry: { color: Brand.navy, fontSize: 11, fontFamily: Fonts.extraBold },
  pressed: { opacity: 0.75 },
});
