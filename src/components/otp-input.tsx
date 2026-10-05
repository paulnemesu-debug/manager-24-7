/**
 * MANAGER 24/7™ by PARADIM — proprietary software.
 * Copyright © 2026 PARADIM Operations SRL. All rights reserved.
 * Concept author and product director: Marius Paul Nemeșu.
 * See LICENSE-PROPRIETARY.md.
 */

import { useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Brand, Fonts, Radius, TabularNumbers } from '@/constants/theme';
import { OTP_MAX_LENGTH, OTP_MIN_LENGTH, parseOtpInput } from '@/lib/email-otp';

/**
 * Căsuțele pentru codul din email. Sunt doar afișaj: textul este
 * ținut de un singur câmp invizibil așezat peste ele, ca lipirea codului
 * dintr-un email să funcționeze dintr-o singură mișcare, iar completarea
 * automată a codului primit prin SMS/email să rămână disponibilă.
 */
export function OtpInput({
  label,
  value,
  onChange,
  onInvalid,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onInvalid?: () => void;
  disabled?: boolean;
}) {
  const inputRef = useRef<TextInput>(null);
  const [focused, setFocused] = useState(false);
  const displayLength = Math.max(OTP_MIN_LENGTH, Math.min(OTP_MAX_LENGTH, value.length));
  const digits = value.padEnd(displayLength, ' ').slice(0, displayLength).split('');

  const handleChange = (raw: string) => {
    const next = parseOtpInput(raw);
    if (next === null) {
      onInvalid?.();
      return;
    }
    onChange(next);
  };

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        disabled={disabled}
        onPress={() => inputRef.current?.focus()}
        style={styles.boxes}>
        {digits.map((digit, index) => {
          const active = focused && index === Math.min(value.length, displayLength - 1);
          return (
            <View
              key={index}
              style={[
                styles.box,
                digit.trim() !== '' && styles.boxFilled,
                active && styles.boxActive,
              ]}>
              <Text style={[styles.digit, displayLength > 8 && styles.digitCompact]}>{digit.trim()}</Text>
            </View>
          );
        })}

        <TextInput
          ref={inputRef}
          value={value}
          onChangeText={handleChange}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          keyboardType="number-pad"
          inputMode="numeric"
          textContentType="oneTimeCode"
          autoComplete="one-time-code"
          // Leave room for pasted spaces; validation rejects extra digits instead of clipping them.
          maxLength={128}
          editable={!disabled}
          accessibilityLabel={label}
          style={[styles.hiddenInput, Platform.OS === 'web' && styles.hiddenInputWeb]}
          // Cursorul propriu al câmpului ar apărea peste căsuțe.
          caretHidden
        />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  label: {
    color: Brand.navySoft,
    fontSize: 11,
    fontFamily: Fonts.bold,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  boxes: { flexDirection: 'row', gap: 6, position: 'relative', width: '100%' },
  box: {
    flex: 1,
    minWidth: 0,
    minHeight: 52,
    paddingVertical: 10,
    borderRadius: Radius.medium,
    borderWidth: 1.5,
    borderColor: Brand.line,
    backgroundColor: Brand.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxFilled: { borderColor: Brand.navySoft },
  boxActive: { borderColor: Brand.gold, backgroundColor: Brand.goldSoft },
  digit: { color: Brand.navyDeep, fontSize: 24, fontFamily: Fonts.extraBold, ...TabularNumbers },
  digitCompact: { fontSize: 19 },
  hiddenInput: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    opacity: 0,
    color: 'transparent',
    fontSize: 24,
    textAlign: 'center',
  },
  hiddenInputWeb: { outlineWidth: 0 } as object,
});
