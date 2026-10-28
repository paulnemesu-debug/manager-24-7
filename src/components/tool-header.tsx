/**
 * MANAGER 24/7™ by PARADIM — proprietary software.
 * Copyright © 2026 PARADIM Operations SRL. All rights reserved.
 * Concept author and product director: Marius Paul Nemeșu.
 * See LICENSE-PROPRIETARY.md.
 */

import { useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { BrandHeader, IconButton } from '@/components/ui';
import { Brand, Fonts } from '@/constants/theme';
import { useI18n } from '@/contexts/locale-context';

export function ToolHeader({
  title,
  subtitle,
  showBack = true,
  onBack,
}: {
  title: string;
  subtitle: string;
  showBack?: boolean;
  onBack?: () => void;
}) {
  const router = useRouter();
  const { t } = useI18n();
  return (
    <View style={styles.header}>
      <BrandHeader mini />
      <View style={styles.row}>
        {showBack && <IconButton icon="arrow-back" label={t('common.back')} onPress={onBack ?? (() => router.canGoBack() ? router.back() : router.replace('/'))} />}
        <View style={styles.copy}>
          <Text style={styles.title}>{title}</Text>
          {!!subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { gap: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  copy: { flex: 1 },
  title: { color: Brand.navyDeep, fontSize: 22, lineHeight: 27, fontFamily: Fonts.extraBold },
  subtitle: { color: Brand.muted, fontSize: 11, lineHeight: 16, marginTop: 2, fontFamily: Fonts.regular },
});
