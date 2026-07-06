// AURADIN — shared liquid-glass surface (internal building block for GlassSheet,
// GlassCard, Composer, Chip, Toast, query pill).
//
// Web recipe (tokens/glass.css): white multi-stop gradient fill +
// backdrop-filter blur(26) saturate(1.7) + dual inset borders (top light-catch +
// bottom fill-light) + 3 layered colored shadows + 1px white-gradient edge +
// diagonal edge glare. RN approximation: BlurView + gradient fill + hairline
// light-catch + single violet shadow. The edge glare stays at the EDGES —
// never a full-surface milky white wash.
import * as React from 'react';
import { StyleSheet, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { edgeGlare, glassTiers, gradPoints, radius as r } from '../../theme/auradinTokens';
import type { GlassTierName } from '../../theme/auradinTokens';

export type GlassBaseProps = {
  tier?: GlassTierName;
  radius?: number;
  /** diagonal edge glare overlay (sheet + stage cards) */
  glare?: boolean;
  /** 1px top light-catch (on by default) */
  lightCatch?: boolean;
  /** false disables the shadow; a ViewStyle overrides the tier default */
  shadow?: ViewStyle | false;
  /** outer wrapper style (margins, flex, size) */
  style?: StyleProp<ViewStyle>;
  /** inner content style (padding etc.) */
  contentStyle?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
};

export function GlassBase({
  tier = 'card',
  radius = r.card,
  glare = false,
  lightCatch = true,
  shadow,
  style,
  contentStyle,
  children,
}: GlassBaseProps): React.JSX.Element {
  const spec = glassTiers[tier];
  const shadowStyle: ViewStyle | null = shadow === false ? null : (shadow ?? spec.shadow);
  return (
    <View style={[{ borderRadius: radius, backgroundColor: spec.base }, shadowStyle, style]}>
      <View
        style={{
          borderRadius: radius,
          overflow: 'hidden',
          borderWidth: 1,
          borderColor: spec.border,
        }}
      >
        <BlurView
          intensity={spec.intensity}
          tint={spec.tint}
          experimentalBlurMethod="dimezisBlurView"
          style={StyleSheet.absoluteFill}
        />
        <LinearGradient
          pointerEvents="none"
          colors={spec.fill}
          locations={spec.fillLocations}
          start={gradPoints.deg165.start}
          end={gradPoints.deg165.end}
          style={StyleSheet.absoluteFill}
        />
        {/* bottom fill-light (web: inset 0 -14px 28px rgba(255,255,255,.2)) */}
        <LinearGradient
          pointerEvents="none"
          colors={['rgba(255,255,255,0)', spec.bottomLight]}
          start={gradPoints.vertical.start}
          end={gradPoints.vertical.end}
          style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 28 }}
        />
        {lightCatch ? (
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              top: 0,
              left: Math.min(radius * 0.6, 18),
              right: Math.min(radius * 0.6, 18),
              height: 1,
              backgroundColor: spec.lightCatch,
            }}
          />
        ) : null}
        <View style={contentStyle}>{children}</View>
        {glare ? (
          <LinearGradient
            pointerEvents="none"
            colors={edgeGlare.colors}
            locations={edgeGlare.locations}
            start={gradPoints.glare120.start}
            end={gradPoints.glare120.end}
            style={StyleSheet.absoluteFill}
          />
        ) : null}
      </View>
    </View>
  );
}
