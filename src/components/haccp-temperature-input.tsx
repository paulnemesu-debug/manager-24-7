/**
 * MANAGER 24/7™ by PARADIM — proprietary software.
 * Copyright © 2026 PARADIM Operations SRL. All rights reserved.
 * Concept author and product director: Marius Paul Nemeșu.
 * See LICENSE-PROPRIETARY.md.
 */

import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { RollerPickerModal, type RollerPickerColumn } from '@/components/roller-picker-modal';
import { Brand, Fonts, Radius, TabularNumbers } from '@/constants/theme';
import { useI18n } from '@/contexts/locale-context';

function numeric(value: string) {
  const parsed = Number(value.replace(',', '.').replace(/[^0-9.-]/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
}

function formatted(value: number) {
  return String(Math.round(value * 10) / 10).replace('.', ',');
}

function displayTemperature(value: string, locale: 'ro' | 'en') {
  return locale === 'en' ? value.replace(',', '.') : value.replace('.', ',');
}

export function HaccpTemperatureInput({
  label,
  value,
  onChange,
  criticalMin = null,
  criticalMax = null,
  step = 0.5,
  minimum = -40,
  maximum = 200,
  large = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  criticalMin?: number | null;
  criticalMax?: number | null;
  step?: number;
  minimum?: number;
  maximum?: number;
  large?: boolean;
}) {
  const { locale, t } = useI18n();
  const [open, setOpen] = useState(false);
  const parsed = numeric(value);
  const nonconform = parsed !== null && (
    (criticalMin !== null && parsed < criticalMin)
    || (criticalMax !== null && parsed > criticalMax)
  );
  const adjust = (direction: -1 | 1) => onChange(formatted((parsed ?? 0) + direction * step));
  const values = useMemo(() => {
    const count = Math.max(1, Math.floor((maximum - minimum) / step));
    return Array.from({ length: count + 1 }, (_, index) => {
      const amount = Math.round((minimum + index * step) * 10) / 10;
      return { value: formatted(amount), label: displayTemperature(formatted(amount), locale) };
    });
  }, [maximum, minimum, step, locale]);
  const fallback = parsed ?? criticalMin ?? criticalMax ?? 0;
  const selectedValue = formatted(Math.min(maximum, Math.max(minimum, Math.round(fallback / step) * step)));
  const columns: RollerPickerColumn[] = [{ key: 'temperature', label: '°C', items: values }];
  const range = [
    criticalMin === null ? null : displayTemperature(formatted(criticalMin), locale),
    criticalMax === null ? null : displayTemperature(formatted(criticalMax), locale),
  ].filter(Boolean).join(' – ');

  return (
    <View style={styles.wrap}>
      <View style={styles.labelRow}>
        <Text style={styles.label}>{label}</Text>
        {!!range && (
          <Text style={[styles.range, nonconform && styles.rangeAlert]}>
            {range} °C {nonconform ? `· ${t('operational.temperature.nonconform')}` : ''}
          </Text>
        )}
      </View>
      <View style={[styles.control, large && styles.controlLarge, nonconform && styles.controlAlert]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('operational.temperature.minus', { step: displayTemperature(formatted(step), locale) })}
          onPress={() => adjust(-1)}
          style={({ pressed }) => [styles.stepButton, large && styles.stepButtonLarge, pressed && styles.pressed]}>
          <Ionicons name="remove" size={large ? 26 : 21} color={Brand.navyDeep} />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={label}
          onPress={() => setOpen(true)}
          style={({ pressed }) => [styles.valueWrap, pressed && styles.pressed]}>
          <Text style={[styles.input, large && styles.inputLarge, nonconform && styles.inputAlert]}>
            {displayTemperature(value || '0,0', locale)}
          </Text>
          <Text style={[styles.unit, large && styles.unitLarge]}>°C</Text>
          <Ionicons name="chevron-down" size={17} color={Brand.muted} style={styles.chevron} />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('operational.temperature.plus', { step: displayTemperature(formatted(step), locale) })}
          onPress={() => adjust(1)}
          style={({ pressed }) => [styles.stepButton, large && styles.stepButtonLarge, pressed && styles.pressed]}>
          <Ionicons name="add" size={large ? 26 : 21} color={Brand.navyDeep} />
        </Pressable>
      </View>
      <RollerPickerModal
        visible={open}
        title={label}
        columns={columns}
        values={{ temperature: selectedValue }}
        onCancel={() => setOpen(false)}
        onConfirm={(next) => {
          onChange(next.temperature ?? selectedValue);
          setOpen(false);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  labelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' },
  label: { color: Brand.navySoft, fontSize: 11, fontFamily: Fonts.bold, letterSpacing: 0.5, textTransform: 'uppercase' },
  range: { color: Brand.green, fontSize: 10, fontFamily: Fonts.extraBold, ...TabularNumbers },
  rangeAlert: { color: Brand.red },
  control: { minHeight: 48, flexDirection: 'row', alignItems: 'stretch', borderWidth: 1, borderColor: Brand.line, borderRadius: Radius.medium, overflow: 'hidden', backgroundColor: Brand.white },
  controlLarge: { minHeight: 62 },
  controlAlert: { borderColor: Brand.red, backgroundColor: '#FFF5F4' },
  stepButton: { width: 50, alignItems: 'center', justifyContent: 'center', backgroundColor: Brand.goldSoft },
  stepButtonLarge: { width: 64 },
  valueWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10 },
  input: { minWidth: 72, textAlign: 'right', color: Brand.navyDeep, fontSize: 20, fontFamily: Fonts.extraBold, ...TabularNumbers },
  inputLarge: { fontSize: 28 },
  inputAlert: { color: Brand.red },
  unit: { color: Brand.muted, fontSize: 14, fontFamily: Fonts.bold, marginLeft: 4 },
  unitLarge: { fontSize: 18 },
  chevron: { marginLeft: 7 },
  pressed: { opacity: 0.65 },
});
