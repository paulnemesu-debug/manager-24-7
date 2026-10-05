/**
 * MANAGER 24/7™ by PARADIM — proprietary software.
 * Copyright © 2026 PARADIM Operations SRL. All rights reserved.
 * Concept author and product director: Marius Paul Nemeșu.
 * See LICENSE-PROPRIETARY.md.
 */

import { StyleSheet, Text, View } from 'react-native';

import { Brand, Fonts, Radius } from '@/constants/theme';
import type { Locale } from '@/i18n/translations';

export function HaccpTimeInput({
  label,
  locale,
  value,
  onChange,
}: {
  label: string;
  locale: Locale;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <input
        aria-label={label}
        lang={locale}
        type="time"
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
        style={styles.input as React.CSSProperties}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  label: { color: Brand.navySoft, fontSize: 11, fontFamily: Fonts.bold, letterSpacing: 0.5, textTransform: 'uppercase' },
  input: { minHeight: 44, borderWidth: 1, borderColor: Brand.line, backgroundColor: Brand.white, borderRadius: Radius.medium, paddingHorizontal: 12, color: Brand.ink, fontSize: 14, fontFamily: Fonts.semiBold },
});
