// AURADIN general liquid-glass card/row surface (results cards, saved cards,
// evidence blocks, panels). radius: 16 cards/rows · 22 stage cards.
// Pressable variant: scale .97 / opacity .92 feedback, spring easing.
import * as React from 'react';
import { Animated, Pressable } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { radius as r, space } from '../../theme/auradinTokens';
import { GlassBase } from './GlassBase';
import { usePressScale } from './motion';

export type GlassCardProps = {
  radius?: number;
  padding?: number;
  glare?: boolean;
  /** soap-film gradient rim — results #1 hero card ONLY (two mounts app-wide, see GlassBase) */
  iridescent?: boolean;
  onPress?: () => void;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
};

export function GlassCard({
  radius = r.card,
  padding = space.pad,
  glare = false,
  iridescent = false,
  onPress,
  accessibilityLabel,
  style,
  children,
}: GlassCardProps): React.JSX.Element {
  const { pressStyle, onPressIn, onPressOut } = usePressScale(0.97, 0.92);
  const surface = (
    <GlassBase tier="card" radius={radius} glare={glare} iridescent={iridescent} contentStyle={{ padding }}>
      {children}
    </GlassBase>
  );
  if (!onPress) {
    return <Animated.View style={style}>{surface}</Animated.View>;
  }
  return (
    <Pressable
      onPress={onPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={style}
    >
      <Animated.View style={pressStyle}>{surface}</Animated.View>
    </Pressable>
  );
}
