// AURADIN primary CTA — large magenta→violet "liquid gem" pill, white text.
// White text belongs here: on a saturated fill. ONE magenta emphasis per screen.
// Disabled: glassy white fill + faint ink text (e.g. "구매 링크 준비 중").
import * as React from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import {
  color,
  font,
  gradient,
  gradPoints,
  radius,
  shadows,
} from '../../theme/auradinTokens';
import { usePressScale } from './motion';

export type CTAButtonProps = {
  label: string;
  onPress?: () => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  /** vertical padding override (default 16 / error-screen pill uses 13) */
  paddingVertical?: number;
  paddingHorizontal?: number;
};

export function CTAButton({
  label,
  onPress,
  disabled = false,
  style,
  paddingVertical = 16,
  paddingHorizontal = 24,
}: CTAButtonProps): React.JSX.Element {
  const { pressStyle, onPressIn, onPressOut } = usePressScale(0.96);
  const inner = { paddingVertical, paddingHorizontal, alignItems: 'center' as const, justifyContent: 'center' as const };
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      onPressIn={disabled ? undefined : onPressIn}
      onPressOut={disabled ? undefined : onPressOut}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      style={style}
    >
      <Animated.View
        style={[
          { borderRadius: radius.pill, overflow: 'hidden' },
          disabled
            ? { backgroundColor: 'rgba(255,255,255,0.5)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.7)' }
            : shadows.cta,
          disabled ? null : pressStyle,
        ]}
      >
        {!disabled ? (
          <>
            <LinearGradient
              colors={gradient.cta.colors}
              locations={gradient.cta.locations}
              start={gradPoints.deg150.start}
              end={gradPoints.deg150.end}
              style={StyleSheet.absoluteFill}
            />
            <LinearGradient
              pointerEvents="none"
              colors={gradient.ctaLight.colors}
              locations={gradient.ctaLight.locations}
              start={gradPoints.vertical.start}
              end={gradPoints.vertical.end}
              style={StyleSheet.absoluteFill}
            />
          </>
        ) : null}
        <View style={inner}>
          <Text
            style={{
              fontFamily: font.sansSemiBold,
              fontSize: 15,
              color: disabled ? color.inkFaint : color.inkInverse,
              ...(disabled
                ? null
                : {
                    textShadowColor: 'rgba(58,22,84,0.25)',
                    textShadowOffset: { width: 0, height: 1 },
                    textShadowRadius: 2,
                  }),
            }}
            allowFontScaling={false}
          >
            {label}
          </Text>
        </View>
      </Animated.View>
    </Pressable>
  );
}
