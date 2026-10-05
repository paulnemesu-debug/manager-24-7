/**
 * MANAGER 24/7™ by PARADIM — proprietary software.
 * Copyright © 2026 PARADIM Operations SRL. All rights reserved.
 * Concept author and product director: Marius Paul Nemeșu.
 * See LICENSE-PROPRIETARY.md.
 */

import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, Text, View } from 'react-native';

import { Brand, Fonts, Radius, TabularNumbers } from '@/constants/theme';
import type { RecipeCategory } from '@/constants/categories';

const CATEGORY: Record<RecipeCategory | 'default', {
  colors: readonly [string, string];
  icon: keyof typeof Ionicons.glyphMap;
}> = {
  soup: { colors: ['#E8A85D', '#B95D3D'], icon: 'restaurant-outline' },
  starter: { colors: ['#5FA58B', '#276E68'], icon: 'leaf-outline' },
  main: { colors: ['#D5A640', '#8F6614'], icon: 'flame-outline' },
  dessert: { colors: ['#C9829E', '#7E466B'], icon: 'ice-cream-outline' },
  salad: { colors: ['#7CB96B', '#26745D'], icon: 'nutrition-outline' },
  side: { colors: ['#81A6C8', '#315D83'], icon: 'fast-food-outline' },
  default: { colors: [Brand.teal, Brand.tealDeep], icon: 'restaurant-outline' },
};

export function RecipeCover({
  uri,
  category,
  foodCost,
  compact = false,
}: {
  uri?: string | null;
  category?: RecipeCategory | null;
  foodCost?: string | null;
  compact?: boolean;
}) {
  const visual = CATEGORY[category ?? 'default'];
  return (
    <LinearGradient
      colors={[...visual.colors]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.cover, compact && styles.coverCompact]}>
      <View style={styles.patternLarge} />
      <View style={styles.patternSmall} />
      {!uri && (
        <View style={styles.fallbackIcon}>
          <Ionicons name={visual.icon} size={compact ? 28 : 42} color="rgba(255,255,255,0.92)" />
        </View>
      )}
      {!!uri && (
        <Image
          source={{ uri }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          transition={180}
          cachePolicy="memory-disk"
          accessibilityLabel="Recipe photo"
        />
      )}
      {!!foodCost && (
        <View style={styles.foodCostBadge}>
          <View style={styles.foodCostDot} />
          <Text style={styles.foodCostText}>{foodCost}</Text>
        </View>
      )}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  cover: {
    height: 178,
    overflow: 'hidden',
    borderRadius: Radius.large,
    alignItems: 'center',
    justifyContent: 'center',
  },
  coverCompact: { height: 126, borderRadius: 17 },
  fallbackIcon: {
    width: 78,
    height: 78,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(3,27,51,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  patternLarge: {
    position: 'absolute', width: 190, height: 190, borderRadius: 95,
    right: -52, top: -75, borderWidth: 24, borderColor: 'rgba(255,255,255,0.10)',
  },
  patternSmall: {
    position: 'absolute', width: 96, height: 96, borderRadius: 48,
    left: -28, bottom: -42, backgroundColor: 'rgba(3,27,51,0.12)',
  },
  foodCostBadge: {
    position: 'absolute', top: 10, right: 10, flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 10, paddingVertical: 7, borderRadius: Radius.pill,
    backgroundColor: 'rgba(3,27,51,0.86)',
  },
  foodCostDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: Brand.gold },
  foodCostText: { color: Brand.white, fontSize: 12, fontFamily: Fonts.extraBold, ...TabularNumbers },
});
