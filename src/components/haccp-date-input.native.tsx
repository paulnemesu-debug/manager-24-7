/**
 * MANAGER 24/7™ by PARADIM — proprietary software.
 * Copyright © 2026 PARADIM Operations SRL. All rights reserved.
 * Concept author and product director: Marius Paul Nemeșu.
 * See LICENSE-PROPRIETARY.md.
 */

import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { Brand, Fonts, Radius, TabularNumbers } from '@/constants/theme';
import type { Locale } from '@/i18n/translations';

function parseDate(value: string) {
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T12:00:00`)
    : new Date();
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function toIsoDate(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function HaccpDateInput({
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
  const selected = parseDate(value);
  const choose = (event: DateTimePickerEvent, next?: Date) => {
    if (Platform.OS === 'android') setOpen(false);
    if (event.type !== 'dismissed' && next) onChange(toIsoDate(next));
  };

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        onPress={() => setOpen(true)}
        style={({ pressed }) => [styles.control, pressed && styles.pressed]}>
        <Ionicons name="calendar-outline" size={18} color={Brand.navy} />
        <Text style={styles.value}>
          {value
            ? selected.toLocaleDateString(locale === 'ro' ? 'ro-RO' : 'en-GB')
            : locale === 'ro' ? 'Selectează data' : 'Select date'}
        </Text>
        <Ionicons name="chevron-down" size={17} color={Brand.muted} />
      </Pressable>
      {open && (
        <View style={styles.pickerWrap}>
          <DateTimePicker
            value={selected}
            mode="date"
            display={Platform.OS === 'ios' ? 'inline' : 'default'}
            onChange={choose}
          />
          {Platform.OS === 'ios' && (
            <Pressable onPress={() => setOpen(false)} style={styles.done}>
              <Text style={styles.doneText}>{locale === 'ro' ? 'Gata' : 'Done'}</Text>
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  label: { color: Brand.navySoft, fontSize: 11, fontFamily: Fonts.bold, letterSpacing: 0.5, textTransform: 'uppercase' },
  control: { minHeight: 44, borderWidth: 1, borderColor: Brand.line, backgroundColor: Brand.white, borderRadius: Radius.medium, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 10 },
  value: { flex: 1, color: Brand.ink, fontSize: 14, fontFamily: Fonts.semiBold, ...TabularNumbers },
  pickerWrap: { borderWidth: 1, borderColor: Brand.line, borderRadius: Radius.medium, overflow: 'hidden', backgroundColor: Brand.white },
  done: { alignSelf: 'flex-end', paddingHorizontal: 16, paddingVertical: 10 },
  doneText: { color: Brand.navy, fontFamily: Fonts.bold },
  pressed: { opacity: 0.76 },
});
