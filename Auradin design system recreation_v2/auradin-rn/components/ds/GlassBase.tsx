// AURADIN — shared liquid-glass surface (internal building block for GlassSheet,
// GlassCard, Composer, Chip, Toast, query echo).
//
// Entry-v3 "milk glass" recipe: white multi-stop gradient fill + BlurView +
// luminous top-interior glow + bottom fill-light + DUAL hairlines (top
// light-catch AND bottom refracted-light catch) + violet shadow. The edge
// glare stays at the EDGES — never a full-surface milky white wash.
//
// `iridescent` swaps the plain white border for the soap-film gradient rim
// (tokens.iridescent) + pastel aura. HARD RULE: exactly TWO mounts app-wide —
// the searching QUERY echo block and the results #1 hero card. One emphasis
// per screen; never chips, badges, composer, sheet, or detail cards.
import * as React from 'react';
import { StyleSheet, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import {
  edgeGlare,
  glassTiers,
  gradPoints,
  iridescent as iridescentToken,
  radius as r,
  shadows,
} from '../../theme/auradinTokens';
import type { GlassTierName } from '../../theme/auradinTokens';

export type GlassBaseProps = {
  tier?: GlassTierName;
  radius?: number;
  /** diagonal edge glare overlay (sheet + stage cards) */
  glare?: boolean;
  /** 1px top light-catch (on by default) */
  lightCatch?: boolean;
  /** soap-film gradient rim — see the two-mounts-only rule above */
  iridescent?: boolean;
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
  iridescent = false,
  shadow,
  style,
  contentStyle,
  children,
}: GlassBaseProps): React.JSX.Element {
  const spec = glassTiers[tier];
  const shadowStyle: ViewStyle | null =
    shadow === false ? null : (shadow ?? (iridescent ? shadows.iridescent : spec.shadow));
  const hairlineInset = Math.min(radius * 0.6, 18);

  const surface = (
    <View
      style={{
        borderRadius: radius,
        overflow: 'hidden',
        borderWidth: iridescent ? 0 : 1,
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
      {/* luminous top interior (web: inset 0 18px 34px rgba(255,255,255,.3)) */}
      <LinearGradient
        pointerEvents="none"
        colors={[spec.innerGlow, 'rgba(255,255,255,0)']}
        start={gradPoints.vertical.start}
        end={gradPoints.vertical.end}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '45%' }}
      />
      {/* bottom fill-light (web: inset 0 -14px 28px rgba(255,255,255,.26)) */}
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
            left: hairlineInset,
            right: hairlineInset,
            height: 1,
            backgroundColor: spec.lightCatch,
          }}
        />
      ) : null}
      {/* bottom refracted-light hairline — the embossed under-edge of the redesign */}
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          bottom: 0,
          left: hairlineInset + 4,
          right: hairlineInset + 4,
          height: 1,
          backgroundColor: spec.bottomCatch,
        }}
      />
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
  );

  if (iridescent) {
    // gradient border = padded gradient wrapper (RN has no border-image)
    const w = iridescentToken.width;
    return (
      <View style={[{ borderRadius: radius + w, backgroundColor: spec.base }, shadowStyle, style]}>
        <LinearGradient
          colors={iridescentToken.rim}
          locations={iridescentToken.rimLocations}
          start={gradPoints.deg135.start}
          end={gradPoints.deg135.end}
          style={{ borderRadius: radius + w, padding: w }}
        >
          {surface}
        </LinearGradient>
      </View>
    );
  }
  return <View style={[{ borderRadius: radius, backgroundColor: spec.base }, shadowStyle, style]}>{surface}</View>;
}
