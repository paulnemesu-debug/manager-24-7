/**
 * MANAGER 24/7™ by PARADIM — proprietary software.
 * Copyright © 2026 PARADIM Operations SRL. All rights reserved.
 * Concept author and product director: Marius Paul Nemeșu.
 * See LICENSE-PROPRIETARY.md.
 */

import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { RollerPickerModal, type RollerPickerColumn } from '@/components/roller-picker-modal';
import { Brand, Fonts, Radius, TabularNumbers } from '@/constants/theme';
import type { Locale } from '@/i18n/translations';

const HOURS = Array.from({ length: 24 }, (_, value) => ({
  value: String(value).padStart(2, '0'), label: String(value).padStart(2, '0'),
}));
const MINUTES = Array.from({ length: 60 }, (_, value) => ({
  value: String(value).padStart(2, '0'), label: String(value).padStart(2, '0'),
}));

function parseTime(value: string) {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  return { hour: match?.[1] ?? '08', minute: match?.[2] ?? '00' };
}

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
  const [open, setOpen] = useState(false);
  const selected = parseTime(value);
  const columns: RollerPickerColumn[] = [
    { key: 'hour', label: locale === 'ro' ? 'Ora' : 'Hour', items: HOURS },
    { key: 'minute', label: locale === 'ro' ? 'Minute' : 'Minutes', items: MINUTES },
  ];

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        onPress={() => setOpen(true)}
        style={({ pressed }) => [styles.control, pressed && styles.pressed]}>
        <Ionicons name="time-outline" size={18} color={Brand.navy} />
        <Text style={styles.value}>{value || (locale === 'ro' ? 'Selectează ora' : 'Select time')}</Text>
        <Ionicons name="chevron-down" size={17} color={Brand.muted} />
      </Pressable>
      <RollerPickerModal
        visible={open}
        title={label}
        columns={columns}
        values={selected}
        cancelLabel={locale === 'ro' ? 'Renunță' : 'Cancel'}
        confirmLabel={locale === 'ro' ? 'Gata' : 'Done'}
        onCancel={() => setOpen(false)}
        onConfirm={(next) => {
          onChange(`${next.hour ?? selected.hour}:${next.minute ?? selected.minute}`);
          setOpen(false);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  label: { color: Brand.navySoft, fontSize: 11, fontFamily: Fonts.bold, letterSpacing: 0.5, textTransform: 'uppercase' },
  control: { minHeight: 44, borderWidth: 1, borderColor: Brand.line, backgroundColor: Brand.white, borderRadius: Radius.medium, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 10 },
  value: { flex: 1, color: Brand.ink, fontSize: 14, fontFamily: Fonts.semiBold, ...TabularNumbers },
  pressed: { opacity: 0.76 },
});
