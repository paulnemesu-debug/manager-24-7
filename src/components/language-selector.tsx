/**
 * MANAGER 24/7™ by PARADIM — proprietary software.
 * Copyright © 2026 PARADIM Operations SRL. All rights reserved.
 * Concept author and product director: Marius Paul Nemeșu.
 * See LICENSE-PROPRIETARY.md.
 */

import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Brand } from '@/constants/theme';
import { useI18n } from '@/contexts/locale-context';
import { SUPPORTED_LOCALES } from '@/i18n/translations';

export function LanguageSelector() {
  const { locale, setLocale } = useI18n();
  return (
    <View style={styles.container}>
      <View style={styles.options}>
        {SUPPORTED_LOCALES.map((value) => (
          <Pressable
            key={value}
            accessibilityRole="button"
            accessibilityLabel={value === 'ro' ? 'Română' : 'English'}
            accessibilityHint={value === 'ro' ? 'Schimbă limba în română' : 'Switch language to English'}
            accessibilityState={{ selected: value === locale }}
            onPress={() => setLocale(value)}
            style={({ pressed }) => [
              styles.option,
              value === locale && styles.selected,
              pressed && styles.pressed,
            ]}>
            <Text style={styles.flag} importantForAccessibility="no">
              {value === 'ro' ? '🇷🇴' : '🇬🇧'}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Nu ocupa forțat 100% într-un rând. În onboarding, această regulă împingea
  // textul din antet în afara ecranului și destabiliza măsurarea întregii pagini.
  container: { gap: 6, flexShrink: 1, minWidth: 0 },
  options: { flexDirection: 'row', gap: 6, alignItems: 'center', flexShrink: 0 },
  option: {
    width: 44, height: 44,
    borderWidth: 1, borderColor: Brand.line, borderRadius: 13,
    justifyContent: 'center', alignItems: 'center', backgroundColor: Brand.white,
  },
  selected: { borderWidth: 2, borderColor: Brand.navyDeep, backgroundColor: '#F3E4BD' },
  flag: { fontSize: 23, lineHeight: 30, textAlign: 'center' },
  pressed: { opacity: 0.68 },
});
