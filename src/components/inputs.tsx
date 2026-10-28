/**
 * MANAGER 24/7™ by PARADIM — proprietary software.
 * Copyright © 2026 PARADIM Operations SRL. All rights reserved.
 * Concept author and product director: Marius Paul Nemeșu.
 * See LICENSE-PROPRIETARY.md.
 */

import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Brand, Fonts, Radius, Shadow } from '@/constants/theme';
import { useI18n } from '@/contexts/locale-context';

export type SelectOption<T extends string> = {
  value: T;
  label: string;
  description?: string;
};

/**
 * Listă derulantă cu foaie modală. Pe web și pe mobil se comportă identic,
 * deci nu avem nevoie de o componentă separată pentru fiecare platformă.
 */
export function Select<T extends string>({
  label,
  hint,
  value,
  options,
  placeholder,
  onChange,
  allowClear = false,
}: {
  label: string;
  hint?: string;
  value: T | null;
  options: readonly SelectOption<T>[];
  placeholder: string;
  onChange: (value: T | null) => void;
  allowClear?: boolean;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.value === value) ?? null;

  const pick = (next: T | null) => {
    onChange(next);
    setOpen(false);
  };

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityValue={{ text: selected?.label ?? placeholder }}
        onPress={() => setOpen(true)}
        style={({ pressed }) => [styles.control, pressed && styles.pressed]}>
        <Text style={[styles.controlText, !selected && styles.placeholder]} numberOfLines={1}>
          {selected?.label ?? placeholder}
        </Text>
        <Ionicons name="chevron-down" size={18} color={Brand.muted} />
      </Pressable>
      {!!hint && <Text style={styles.hint}>{hint}</Text>}

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.sheet} onPress={(event) => event.stopPropagation()}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>{label}</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('common.close')}
                onPress={() => setOpen(false)}
                style={styles.sheetClose}>
                <Ionicons name="close" size={20} color={Brand.navy} />
              </Pressable>
            </View>
            <ScrollView style={styles.sheetScroll}>
              {allowClear && (
                <Pressable
                  accessibilityRole="radio"
                  accessibilityState={{ checked: value === null }}
                  onPress={() => pick(null)}
                  style={({ pressed }) => [styles.option, pressed && styles.pressed]}>
                  <Text style={[styles.optionLabel, styles.placeholder]}>{placeholder}</Text>
                  {value === null && <Ionicons name="checkmark" size={19} color={Brand.gold} />}
                </Pressable>
              )}
              {options.map((option) => {
                const active = option.value === value;
                return (
                  <Pressable
                    key={option.value}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: active }}
                    onPress={() => pick(option.value)}
                    style={({ pressed }) => [
                      styles.option,
                      active && styles.optionActive,
                      pressed && styles.pressed,
                    ]}>
                    <View style={styles.optionCopy}>
                      <Text style={styles.optionLabel}>{option.label}</Text>
                      {!!option.description && (
                        <Text style={styles.optionDescription}>{option.description}</Text>
                      )}
                    </View>
                    {active && <Ionicons name="checkmark" size={19} color={Brand.gold} />}
                  </Pressable>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

/** Grup de etichete comutabile — folosit pentru alergeni și pentru filtre. */
export function ChipGroup<T extends string>({
  label,
  options,
  selected,
  onToggle,
}: {
  label?: string;
  options: readonly SelectOption<T>[];
  selected: readonly T[];
  onToggle: (value: T) => void;
}) {
  return (
    <View style={styles.wrap}>
      {!!label && <Text style={styles.label}>{label}</Text>}
      <View style={styles.chips}>
        {options.map((option) => {
          const active = selected.includes(option.value);
          return (
            <Pressable
              key={option.value}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: active }}
              onPress={() => onToggle(option.value)}
              style={({ pressed }) => [
                styles.chip,
                active && styles.chipActive,
                pressed && styles.pressed,
              ]}>
              {active && <Ionicons name="checkmark" size={13} color={Brand.navyDeep} />}
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{option.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/** Un singur rând de opțiuni exclusive, cu etichete complete (nu doar coduri). */
export function ChoiceRow<T extends string>({
  label,
  options,
  value,
  onChange,
  large = false,
}: {
  label?: string;
  options: readonly SelectOption<T>[];
  value: T;
  onChange: (value: T) => void;
  large?: boolean;
}) {
  return (
    <View style={styles.wrap}>
      {!!label && <Text style={styles.label}>{label}</Text>}
      <View style={styles.chips}>
        {options.map((option) => {
          const active = option.value === value;
          return (
            <Pressable
              key={option.value}
              accessibilityRole="radio"
              accessibilityState={{ checked: active }}
              onPress={() => onChange(option.value)}
              style={({ pressed }) => [
                styles.chip,
                large && styles.chipLarge,
                active && styles.chipActive,
                pressed && styles.pressed,
              ]}>
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{option.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  label: {
    color: Brand.navySoft,
    fontSize: 11,
    fontFamily: Fonts.bold,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  control: {
    minHeight: 42,
    borderWidth: 1,
    borderColor: Brand.line,
    backgroundColor: Brand.white,
    borderRadius: 13,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  controlText: { flex: 1, color: Brand.ink, fontSize: 14, fontFamily: Fonts.semiBold },
  placeholder: { color: '#98A3AD', fontFamily: Fonts.regular },
  hint: { color: Brand.muted, fontSize: 11, lineHeight: 16 },
  pressed: { opacity: 0.75 },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(3, 27, 51, 0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: Brand.white,
    borderTopLeftRadius: Radius.large,
    borderTopRightRadius: Radius.large,
    paddingBottom: 28,
    maxHeight: '80%',
    width: '100%',
    maxWidth: 640,
    alignSelf: 'center',
    ...Shadow,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 18,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: Brand.line,
  },
  sheetTitle: { flex: 1, color: Brand.navyDeep, fontSize: 16, fontFamily: Fonts.extraBold },
  sheetClose: {
    width: 38,
    height: 38,
    borderRadius: 13,
    backgroundColor: '#F0F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetScroll: { paddingHorizontal: 10 },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 14,
    borderRadius: Radius.medium,
  },
  optionActive: { backgroundColor: Brand.goldSoft },
  optionCopy: { flex: 1 },
  optionLabel: { color: Brand.navyDeep, fontSize: 15, fontFamily: Fonts.bold },
  optionDescription: { color: Brand.muted, fontSize: 11, lineHeight: 16, marginTop: 3 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1,
    borderColor: Brand.line,
    backgroundColor: Brand.white,
    borderRadius: Radius.pill,
    paddingHorizontal: 11,
    paddingVertical: 7,
  },
  chipActive: { borderColor: Brand.gold, backgroundColor: Brand.goldSoft },
  chipLarge: { minHeight: 48, paddingHorizontal: 18, justifyContent: 'center' },
  chipText: { color: Brand.navySoft, fontSize: 12, fontFamily: Fonts.extraBold },
  chipTextActive: { color: Brand.navyDeep },
});
