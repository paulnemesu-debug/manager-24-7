/**
 * MANAGER 24/7™ by PARADIM — proprietary software.
 * Copyright © 2026 PARADIM Operations SRL. All rights reserved.
 * Concept author and product director: Marius Paul Nemeșu.
 * See LICENSE-PROPRIETARY.md.
 */

import { Platform } from 'react-native';

export const Brand = {
  navy: '#062544',
  navyDeep: '#031B33',
  navySoft: '#123B5C',
  gold: '#D5A640',
  /** Auriu cu contrast suficient pentru text mic pe fundal deschis. */
  goldInk: '#8F6614',
  goldSoft: '#F3E4BD',
  cream: '#F7F5EF',
  white: '#FFFFFF',
  ink: '#17212B',
  muted: '#667482',
  line: '#DDE4E8',
  teal: '#0B9C91',
  tealDeep: '#0B6A68',
  tealSoft: '#E6F7F4',
  mint: '#D7EEE9',
  green: '#228B5A',
  greenSoft: '#EAF7F0',
  amber: '#B36B00',
  amberSoft: '#FFF3DC',
  red: '#B54444',
  redSoft: '#FCEAEA',
} as const;

/**
 * Manrope este încărcat în layout-ul rădăcină. Folosim fișierul potrivit
 * pentru fiecare greutate, fiindcă Android nu sintetizează consecvent bold
 * pentru fonturi încărcate din aplicație.
 */
export const Fonts = {
  regular: 'Manrope_400Regular',
  medium: 'Manrope_500Medium',
  semiBold: 'Manrope_600SemiBold',
  bold: 'Manrope_700Bold',
  extraBold: 'Manrope_800ExtraBold',
  mono: Platform.select({ ios: 'ui-monospace', default: 'monospace' }),
} as const;

export const TabularNumbers = {
  fontVariant: ['tabular-nums'] as ('tabular-nums')[],
} as const;

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const Radius = {
  small: 10,
  medium: 16,
  large: 24,
  pill: 999,
} as const;

export const Shadow = Platform.select({
  ios: {
    shadowColor: '#031B33',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 20,
  },
  android: { elevation: 3 },
  default: {},
});

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
