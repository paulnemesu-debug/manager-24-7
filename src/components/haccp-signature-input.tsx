/**
 * MANAGER 24/7™ by PARADIM — proprietary software.
 * Copyright © 2026 PARADIM Operations SRL. All rights reserved.
 * Concept author and product director: Marius Paul Nemeșu.
 * See LICENSE-PROPRIETARY.md.
 */

import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Brand, Fonts, Radius, TabularNumbers } from '@/constants/theme';
import { haccpIdentityStamp } from '@/lib/haccp-today';
import type { Locale } from '@/i18n/translations';

export function HaccpSignatureInput({
  label,
  value,
  identity,
  locale = 'ro',
  onChange,
}: {
  label: string;
  value: string;
  identity: string;
  locale?: Locale;
  onChange: (value: string) => void;
}) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        onPress={() => onChange(haccpIdentityStamp(identity))}
        style={({ pressed }) => [styles.control, value && styles.signed, pressed && styles.pressed]}>
        <Ionicons name={value ? 'checkmark-circle' : 'finger-print-outline'} size={23} color={value ? Brand.green : Brand.navy} />
        <View style={styles.copy}>
          <Text style={styles.action}>{value
            ? (locale === 'ro' ? 'Identitate confirmată' : 'Identity confirmed')
            : (locale === 'ro' ? `Semnează ca ${identity || 'operator'}` : `Sign as ${identity || 'operator'}`)}</Text>
          {!!value && <Text style={styles.value}>{value}</Text>}
        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  label: { color: Brand.navySoft, fontSize: 11, fontFamily: Fonts.bold, letterSpacing: 0.5, textTransform: 'uppercase' },
  control: { minHeight: 54, borderWidth: 1, borderColor: Brand.line, borderRadius: Radius.medium, backgroundColor: Brand.white, paddingHorizontal: 13, paddingVertical: 9, flexDirection: 'row', alignItems: 'center', gap: 10 },
  signed: { borderColor: '#B8DDCA', backgroundColor: '#F1FAF5' },
  copy: { flex: 1 },
  action: { color: Brand.navyDeep, fontSize: 13, fontFamily: Fonts.extraBold },
  value: { color: Brand.muted, fontSize: 10, marginTop: 3, fontFamily: Fonts.regular, ...TabularNumbers },
  pressed: { opacity: 0.72 },
});
