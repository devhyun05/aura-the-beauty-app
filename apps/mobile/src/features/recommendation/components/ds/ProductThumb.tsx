// AURADIN product image slot. When `imageUrl` is absent, renders the palette-
// gradient placeholder — NEVER a gray box. Sizes from thumb (54) to full stage.
import * as React from 'react';
import { Image, StyleSheet, View } from 'react-native';
import type { DimensionValue, StyleProp, ViewStyle } from 'react-native';
import {LinearGradient} from './LinearGradientFallback';
import { color, gradPoints } from '../../theme/auradinTokens';
import type { GradientStops } from '../../theme/auradinTokens';

export type ProductThumbProps = {
  imageUrl?: string;
  palette?: string[];
  width?: DimensionValue;
  height?: number;
  radius?: number;
  /** resizeMode contain (saved-library cards) instead of cover */
  contain?: boolean;
  alt?: string;
  style?: StyleProp<ViewStyle>;
};

const FALLBACK: GradientStops = [color.pink, color.sky, color.magenta];

export function ProductThumb({
  imageUrl,
  palette,
  width = 54,
  height = 54,
  radius = 12,
  contain = false,
  alt,
  style,
}: ProductThumbProps): React.JSX.Element {
  const base: ViewStyle = {
    width,
    height,
    borderRadius: radius,
    overflow: 'hidden',
  };
  if (imageUrl) {
    return (
      <View style={[base, style]} accessibilityLabel={alt}>
        <Image
          source={{ uri: imageUrl }}
          resizeMode={contain ? 'contain' : 'cover'}
          style={StyleSheet.absoluteFill}
          accessibilityIgnoresInvertColors
        />
      </View>
    );
  }
  const cols: string[] = palette && palette.length > 0 ? palette : [...FALLBACK];
  const stops: GradientStops =
    cols.length >= 2
      ? (cols as unknown as GradientStops)
      : ([cols[0] ?? FALLBACK[0], cols[0] ?? FALLBACK[0]] as const);
  return (
    <View style={[base, style]} accessibilityLabel={alt ?? '제품 이미지 준비 중'}>
      <LinearGradient
        colors={stops}
        start={gradPoints.deg135.start}
        end={gradPoints.deg135.end}
        style={StyleSheet.absoluteFill}
      />
      {/* soft top-left sheen so the placeholder reads as glass, not a flat fill */}
      <LinearGradient
        colors={['rgba(255,255,255,0.35)', 'rgba(255,255,255,0)']}
        locations={[0, 0.55]}
        start={gradPoints.deg160.start}
        end={gradPoints.deg160.end}
        style={StyleSheet.absoluteFill}
      />
    </View>
  );
}
