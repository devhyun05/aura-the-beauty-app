// AURADIN swatch answer tile (question screen). The deliberate exception
// to glass: SOLID swatch fill, radius 24, dark bottom scrim + WHITE label
// (white belongs here — on saturated color). Tap advances immediately.
// Fill variants (§8.2): string → solid hex (neutral fallback), gradient →
// colorFamily 3-stop brightness ramp, texture → abstract finish swatch.
import * as React from 'react';
import { Animated, Pressable, Text } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import {
  color,
  edgeGlare,
  font,
  gradPoints,
  radius as r,
  shadows,
} from '../../theme/auradinTokens';
import type { AuradinSwatch } from '../../types';
import { TextureSwatch } from './TextureSwatch';
import { usePressScale } from './motion';

export type SwatchTileProps = {
  swatch: AuradinSwatch;
  label: string;
  onPick: () => void;
  height?: number;
  style?: StyleProp<ViewStyle>;
};

export function SwatchTile({ swatch, label, onPick, height = 160, style }: SwatchTileProps): React.JSX.Element {
  const { pressStyle, onPressIn, onPressOut } = usePressScale(0.97, 0.92);
  const spec = typeof swatch === 'string' ? null : swatch;
  // 단색 폴백 배경 — gradient/texture는 아래 절대배치 레이어가 덮는다.
  const baseColor =
    typeof swatch === 'string'
      ? swatch
      : spec?.kind === 'gradient'
        ? spec.colors[1]
        : color.swatchNeutral;
  return (
    <Pressable
      onPress={onPick}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      accessibilityRole="button"
      accessibilityLabel={`${label} 선택`}
      style={style}
    >
      <Animated.View
        style={[
          {
            height,
            borderRadius: r.tile,
            backgroundColor: baseColor,
            borderWidth: 1,
            borderColor: 'rgba(255,255,255,0.55)',
            overflow: 'hidden',
            justifyContent: 'flex-end',
          },
          shadows.tile,
          pressStyle,
        ]}
      >
        {/* colorFamily 3색 밝기 그라데이션 (§8.2-3) — 계열의 폭을 보여준다 */}
        {spec?.kind === 'gradient' ? (
          <LinearGradient
            pointerEvents="none"
            colors={spec.colors}
            locations={[0, 0.52, 1]}
            start={{ x: 0.12, y: 0 }}
            end={{ x: 0.88, y: 1 }}
            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
          />
        ) : null}
        {/* finish/texture 추상 질감 (§8.2-1) — 자체 제작, 제품 연상 차단 */}
        {spec?.kind === 'texture' ? <TextureSwatch texture={spec.texture} /> : null}
        {/* glass edge glare (edges only) */}
        <LinearGradient
          pointerEvents="none"
          colors={edgeGlare.colors}
          locations={edgeGlare.locations}
          start={gradPoints.glare120.start}
          end={gradPoints.glare120.end}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
        />
        {/* bottom scrim: flat black 16% fade */}
        <LinearGradient
          pointerEvents="none"
          colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.16)']}
          locations={[0.55, 1]}
          start={gradPoints.vertical.start}
          end={gradPoints.vertical.end}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
        />
        <Text
          style={{
            fontFamily: font.sansSemiBold,
            fontSize: 14,
            color: color.inkInverse,
            padding: 14,
            textShadowColor: 'rgba(0,0,0,0.28)',
            textShadowOffset: { width: 0, height: 1 },
            textShadowRadius: 6,
          }}
          allowFontScaling={false}
        >
          {label}
        </Text>
      </Animated.View>
    </Pressable>
  );
}
