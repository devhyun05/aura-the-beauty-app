// AURADIN glass suggestion chip. Variants: default · hl (violet-tinted highlight)
// · on (magenta fill, selected — white text belongs on this saturated fill).
import * as React from 'react';
import { Animated, Pressable, Text } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import {
  color,
  gradient,
  gradPoints,
  radius,
  shadows,
  text,
} from '../../theme/auradinTokens';
import { GlassBase } from './GlassBase';
import { usePressScale } from './motion';

export type ChipProps = {
  label: string;
  /** violet-tinted highlight variant (first suggestion) */
  hl?: boolean;
  /** selected — magenta gradient fill + white text */
  on?: boolean;
  onPress?: () => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function Chip({ label, hl = false, on = false, onPress, disabled = false, style }: ChipProps): React.JSX.Element {
  const { pressStyle, onPressIn, onPressOut } = usePressScale(0.96);
  const padding = { paddingVertical: 9, paddingHorizontal: 14 } as const;

  let surface: React.ReactNode;
  if (on) {
    surface = (
      <Animated.View
        style={[
          {
            borderRadius: radius.pill,
            borderWidth: 1,
            borderColor: 'rgba(255,255,255,0.5)',
            overflow: 'hidden',
          },
          shadows.chipOn,
        ]}
      >
        <LinearGradient
          colors={gradient.chipOn.colors}
          start={gradPoints.deg150.start}
          end={gradPoints.deg150.end}
          style={padding}
        >
          <Text style={[text.chip, { color: color.inkInverse }]} allowFontScaling={false}>
            {label}
          </Text>
        </LinearGradient>
      </Animated.View>
    );
  } else {
    surface = (
      <GlassBase tier="chip" radius={radius.pill} contentStyle={padding}>
        {hl ? (
          <LinearGradient
            pointerEvents="none"
            colors={['rgba(200,150,240,0.28)', 'rgba(255,255,255,0.14)', 'rgba(176,108,240,0.18)']}
            locations={[0, 0.45, 1]}
            start={gradPoints.deg160.start}
            end={gradPoints.deg160.end}
            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
          />
        ) : null}
        <Text style={text.chip} allowFontScaling={false}>
          {label}
        </Text>
      </GlassBase>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: on, disabled }}
      style={style}
    >
      <Animated.View style={[pressStyle, disabled ? { opacity: 0.5 } : null]}>{surface}</Animated.View>
    </Pressable>
  );
}
