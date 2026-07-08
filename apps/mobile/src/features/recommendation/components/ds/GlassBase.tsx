import * as React from 'react';
import {StyleSheet, View} from 'react-native';
import type {StyleProp, ViewStyle} from 'react-native';

import {glassTiers, radius as r, shadows} from '../../theme/auradinTokens';
import type {GlassTierName} from '../../theme/auradinTokens';

export type GlassBaseProps = {
  tier?: GlassTierName;
  radius?: number;
  glare?: boolean;
  lightCatch?: boolean;
  iridescent?: boolean;
  shadow?: ViewStyle | false;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
};

const TIER_BACKGROUND: Record<GlassTierName, string> = {
  card: 'rgba(255,255,255,0.46)',
  chip: 'rgba(255,255,255,0.42)',
  composer: 'rgba(255,255,255,0.5)',
  dark: 'rgba(28,22,54,0.38)',
  sheet: 'rgba(255,255,255,0.52)',
};

const TIER_BORDER: Record<GlassTierName, string> = {
  card: 'rgba(255,255,255,0.68)',
  chip: 'rgba(255,255,255,0.62)',
  composer: 'rgba(255,255,255,0.7)',
  dark: 'rgba(255,255,255,0.28)',
  sheet: 'rgba(255,255,255,0.78)',
};

export function GlassBase({
  tier = 'card',
  radius = r.card,
  iridescent = false,
  shadow,
  style,
  contentStyle,
  children,
}: GlassBaseProps): React.JSX.Element {
  const spec = glassTiers[tier];
  const shadowStyle: ViewStyle | null =
    shadow === false ? null : (shadow ?? (iridescent ? shadows.iridescent : spec.shadow));

  return (
    <View
      style={[
        styles.surface,
        {
          backgroundColor: TIER_BACKGROUND[tier],
          borderColor: iridescent ? 'rgba(224,72,156,0.42)' : TIER_BORDER[tier],
          borderRadius: radius,
        },
        shadowStyle,
        style,
      ]}>
      <View style={[styles.content, {borderRadius: radius}, contentStyle]}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    overflow: 'hidden',
  },
  surface: {
    borderWidth: 1,
    overflow: 'hidden',
  },
});
