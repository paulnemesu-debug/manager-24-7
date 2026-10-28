/**
 * MANAGER 24/7™ by PARADIM — proprietary software.
 * Copyright © 2026 PARADIM Operations SRL. All rights reserved.
 * Concept author and product director: Marius Paul Nemeșu.
 * See LICENSE-PROPRIETARY.md.
 */

import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, G, Line, Rect, Text as SvgText } from 'react-native-svg';

import { Brand, Fonts } from '@/constants/theme';
import { useI18n } from '@/contexts/locale-context';
import type { MenuEngineeringItem } from '@/lib/operations';

const WIDTH = 340;
const HEIGHT = 300;
const LEFT = 34;
const TOP = 22;
const PLOT_W = 292;
const PLOT_H = 238;

const palette = {
  star: Brand.green,
  plowhorse: Brand.goldInk,
  puzzle: Brand.tealDeep,
  dog: Brand.red,
} as const;

const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value));

export function MenuEngineeringMatrix({ items }: { items: readonly MenuEngineeringItem[] }) {
  const { t } = useI18n();
  if (!items.length) return null;

  const popularityThreshold = 70 / items.length;
  const avgMargin = items.reduce((sum, item) => sum + item.contributionPerPortion, 0) / items.length;
  const maxPopularity = Math.max(popularityThreshold + 0.01, ...items.map((item) => item.popularityPercent));
  const minMargin = Math.min(avgMargin, ...items.map((item) => item.contributionPerPortion));
  const maxMargin = Math.max(avgMargin + 0.01, ...items.map((item) => item.contributionPerPortion));

  const point = (item: MenuEngineeringItem) => {
    const popular = item.classification === 'star' || item.classification === 'plowhorse';
    const profitable = item.classification === 'star' || item.classification === 'puzzle';
    const xLocal = popular
      ? 0.55 + clamp((item.popularityPercent - popularityThreshold) / (maxPopularity - popularityThreshold)) * 0.40
      : 0.05 + clamp(item.popularityPercent / Math.max(0.01, popularityThreshold)) * 0.40;
    const yLocal = profitable
      ? 0.45 - clamp((item.contributionPerPortion - avgMargin) / (maxMargin - avgMargin)) * 0.40
      : 0.55 + clamp((avgMargin - item.contributionPerPortion) / Math.max(0.01, avgMargin - minMargin)) * 0.40;
    return { x: LEFT + xLocal * PLOT_W, y: TOP + yLocal * PLOT_H };
  };

  return (
    <View style={styles.wrap}>
      <Svg width="100%" height={HEIGHT} viewBox={`0 0 ${WIDTH} ${HEIGHT}`} accessibilityLabel={t('menu.matrixTitle')}>
        <Rect x={LEFT} y={TOP} width={PLOT_W / 2} height={PLOT_H / 2} rx={13} fill="#E5F4F3" />
        <Rect x={LEFT + PLOT_W / 2} y={TOP} width={PLOT_W / 2} height={PLOT_H / 2} rx={13} fill="#E7F7EF" />
        <Rect x={LEFT} y={TOP + PLOT_H / 2} width={PLOT_W / 2} height={PLOT_H / 2} rx={13} fill="#FCEAEA" />
        <Rect x={LEFT + PLOT_W / 2} y={TOP + PLOT_H / 2} width={PLOT_W / 2} height={PLOT_H / 2} rx={13} fill="#FFF4DD" />
        <Line x1={LEFT + PLOT_W / 2} y1={TOP} x2={LEFT + PLOT_W / 2} y2={TOP + PLOT_H} stroke="#FFFFFF" strokeWidth={4} />
        <Line x1={LEFT} y1={TOP + PLOT_H / 2} x2={LEFT + PLOT_W} y2={TOP + PLOT_H / 2} stroke="#FFFFFF" strokeWidth={4} />

        <SvgText x={LEFT + 10} y={TOP + 18} fill={Brand.tealDeep} fontSize={10} fontWeight="700">{t('menu.class.puzzle')}</SvgText>
        <SvgText x={LEFT + PLOT_W / 2 + 10} y={TOP + 18} fill={Brand.green} fontSize={10} fontWeight="700">{t('menu.class.star')}</SvgText>
        <SvgText x={LEFT + 10} y={TOP + PLOT_H / 2 + 19} fill={Brand.red} fontSize={10} fontWeight="700">{t('menu.class.dog')}</SvgText>
        <SvgText x={LEFT + PLOT_W / 2 + 10} y={TOP + PLOT_H / 2 + 19} fill={Brand.goldInk} fontSize={10} fontWeight="700">{t('menu.class.plowhorse')}</SvgText>

        {items.map((item, index) => {
          const p = point(item);
          const label = item.recipe.title.length > 12 ? `${item.recipe.title.slice(0, 11)}…` : item.recipe.title;
          return (
            <G key={item.recipe.id}>
              <Circle cx={p.x} cy={p.y} r={8 + Math.min(7, Math.sqrt(item.sold))} fill={palette[item.classification]} opacity={0.9} />
              {items.length <= 12 && (
                <SvgText x={p.x} y={p.y + 25 + (index % 2) * 8} textAnchor="middle" fill={Brand.navyDeep} fontSize={8.5} fontWeight="600">
                  {label}
                </SvgText>
              )}
            </G>
          );
        })}

        <SvgText x={LEFT + PLOT_W / 2} y={HEIGHT - 6} textAnchor="middle" fill={Brand.muted} fontSize={9}>{t('menu.axisPopularity')}</SvgText>
        <SvgText x={8} y={TOP + PLOT_H / 2} textAnchor="middle" fill={Brand.muted} fontSize={9} transform={`rotate(-90 8 ${TOP + PLOT_H / 2})`}>{t('menu.axisMargin')}</SvgText>
      </Svg>
      <Text style={styles.hint}>{t('menu.matrixHint')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 2 },
  hint: { color: Brand.muted, fontSize: 10, lineHeight: 14, fontFamily: Fonts.regular, textAlign: 'center' },
});
