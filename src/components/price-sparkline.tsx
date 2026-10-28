/**
 * MANAGER 24/7™ by PARADIM — proprietary software.
 * Copyright © 2026 PARADIM Operations SRL. All rights reserved.
 * Concept author and product director: Marius Paul Nemeșu.
 * See LICENSE-PROPRIETARY.md.
 */

import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Path, Stop } from 'react-native-svg';

import { Brand } from '@/constants/theme';
import type { PriceHistoryEntry } from '@/lib/catalog-repository';

const WIDTH = 320;
const HEIGHT = 86;
const PAD = 8;

export function PriceSparkline({ history }: { history: readonly PriceHistoryEntry[] }) {
  const chronological = [...history].reverse();
  const values = chronological.map((entry) => entry.newPrice);
  if (chronological[0]?.oldPrice !== null && chronological[0]?.oldPrice !== undefined) {
    values.unshift(chronological[0].oldPrice);
  }
  if (values.length < 2) return null;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(0.01, max - min);
  const points = values.map((value, index) => ({
    x: PAD + index * ((WIDTH - PAD * 2) / Math.max(1, values.length - 1)),
    y: HEIGHT - PAD - ((value - min) / span) * (HEIGHT - PAD * 2),
  }));
  const line = points.map((point, index) => `${index ? 'L' : 'M'}${point.x},${point.y}`).join(' ');
  const area = `${line} L${points[points.length - 1].x},${HEIGHT - PAD} L${points[0].x},${HEIGHT - PAD} Z`;
  const up = values[values.length - 1] > values[0];
  const color = up ? Brand.red : Brand.green;

  return (
    <View style={styles.wrap} accessibilityLabel="Price trend">
      <Svg width="100%" height={HEIGHT} viewBox={`0 0 ${WIDTH} ${HEIGHT}`}>
        <Defs>
          <LinearGradient id="priceFill" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={color} stopOpacity="0.25" />
            <Stop offset="1" stopColor={color} stopOpacity="0.02" />
          </LinearGradient>
        </Defs>
        <Path d={area} fill="url(#priceFill)" />
        <Path d={line} fill="none" stroke={color} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
        {points.map((point, index) => (
          <Circle key={index} cx={point.x} cy={point.y} r={index === points.length - 1 ? 4 : 2.2} fill={color} />
        ))}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%', height: HEIGHT, borderRadius: 14, overflow: 'hidden', backgroundColor: '#F3F7F7' },
});
