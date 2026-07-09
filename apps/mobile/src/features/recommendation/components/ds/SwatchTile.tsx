// AURADIN color-swatch answer tile (question screen). The deliberate exception
// to glass: SOLID swatch fill, radius 24, dark bottom scrim + WHITE label
// (white belongs here — on saturated color). Tap advances immediately.
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
import { usePressScale } from './motion';

export type SwatchTileProps = {
  swatch: string;
  label: string;
  onPick: () => void;
  height?: number;
  style?: StyleProp<ViewStyle>;
};

export function SwatchTile({ swatch, label, onPick, height = 160, style }: SwatchTileProps): React.JSX.Element {
  const { pressStyle, onPressIn, onPressOut } = usePressScale(0.97, 0.92);
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
            backgroundColor: swatch,
            borderWidth: 1,
            borderColor: 'rgba(255,255,255,0.55)',
            overflow: 'hidden',
            justifyContent: 'flex-end',
          },
          shadows.tile,
          pressStyle,
        ]}
      >
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
