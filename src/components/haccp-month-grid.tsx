/**
 * MANAGER 24/7™ by PARADIM — proprietary software.
 * Copyright © 2026 PARADIM Operations SRL. All rights reserved.
 * Concept author and product director: Marius Paul Nemeșu.
 * See LICENSE-PROPRIETARY.md.
 */

import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Brand, Fonts, Radius, TabularNumbers } from '@/constants/theme';
import type { HaccpDocumentRow } from '@/types/haccp';

function rowStatus(row: HaccpDocumentRow | undefined) {
  if (!row) return 'empty' as const;
  const values = Object.entries(row.values);
  if (values.some(([, value]) => value === 'no' || value === 'nonconform')) return 'nonconform' as const;
  if (values.some(([key, value]) => /corrective|correction/.test(key) && value.trim())) return 'nonconform' as const;
  return 'conform' as const;
}

export function HaccpMonthGrid({
  rows,
  selectedDay,
  onSelectDay,
}: {
  rows: readonly HaccpDocumentRow[];
  selectedDay?: string | null;
  onSelectDay: (day: string, row?: HaccpDocumentRow) => void;
}) {
  const byDay = new Map(rows.map((row) => [row.values.day, row]));
  const today = String(new Date().getDate());
  return (
    <View style={styles.wrap}>
      {Array.from({ length: 31 }, (_, index) => String(index + 1)).map((day) => {
        const row = byDay.get(day);
        const status = rowStatus(row);
        return (
          <Pressable
            key={day}
            accessibilityRole="button"
            accessibilityLabel={`Ziua ${day}`}
            accessibilityState={{ selected: selectedDay === day }}
            onPress={() => onSelectDay(day, row)}
            style={({ pressed }) => [
              styles.cell,
              status === 'conform' && styles.conform,
              status === 'nonconform' && styles.nonconform,
              day === today && styles.today,
              selectedDay === day && styles.selected,
              pressed && styles.pressed,
            ]}>
            <Text style={[styles.day, status !== 'empty' && styles.dayFilled]}>{day}</Text>
            <View style={[
              styles.dot,
              status === 'conform' && styles.dotConform,
              status === 'nonconform' && styles.dotNonconform,
            ]} />
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  cell: { width: 42, minHeight: 46, borderWidth: 1, borderColor: Brand.line, borderRadius: Radius.small, backgroundColor: Brand.white, alignItems: 'center', justifyContent: 'center', gap: 3 },
  conform: { backgroundColor: '#EEF9F3', borderColor: '#B8DDCA' },
  nonconform: { backgroundColor: '#FFF0EE', borderColor: '#E8A39C' },
  today: { borderWidth: 2, borderColor: Brand.gold },
  selected: { borderWidth: 2, borderColor: Brand.navy },
  day: { color: Brand.muted, fontSize: 13, fontFamily: Fonts.bold, ...TabularNumbers },
  dayFilled: { color: Brand.navyDeep },
  dot: { width: 5, height: 5, borderRadius: 999, backgroundColor: Brand.line },
  dotConform: { backgroundColor: Brand.green },
  dotNonconform: { backgroundColor: Brand.red },
  pressed: { opacity: 0.7 },
});
