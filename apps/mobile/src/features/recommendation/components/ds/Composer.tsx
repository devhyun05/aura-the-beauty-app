// AURADIN composer — glass pill: transparent input + circular magenta→violet
// send (↗). Focus = magenta glow ring + lift. Wrap the screen in
// KeyboardAvoidingView (the views do this) so the composer never hides.
import * as React from 'react';
import { Animated, Pressable, StyleSheet, TextInput, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path } from 'react-native-svg';
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

export type ComposerProps = {
  value: string;
  onChangeText: (v: string) => void;
  onSend: () => void;
  placeholder?: string;
  editable?: boolean;
  autoFocus?: boolean;
  style?: StyleProp<ViewStyle>;
};

/** Circular "liquid gem" send button (40px, ↗ arrow). */
function SendButton({ onPress }: { onPress: () => void }): React.JSX.Element {
  const { pressStyle, onPressIn, onPressOut } = usePressScale(0.9);
  return (
    <Pressable
      onPress={onPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      accessibilityRole="button"
      accessibilityLabel="보내기"
      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
    >
      <Animated.View
        style={[
          { width: 40, height: 40, borderRadius: 20, overflow: 'hidden' },
          pressStyle,
        ]}
      >
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
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Svg width={17} height={17} viewBox="0 0 24 24" fill="none">
            <Path d="M7 17 L17 7" stroke="#fff" strokeWidth={2.4} strokeLinecap="round" />
            <Path
              d="M9.5 7 H17 V14.5"
              stroke="#fff"
              strokeWidth={2.4}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          </Svg>
        </View>
      </Animated.View>
    </Pressable>
  );
}

export function Composer({
  value,
  onChangeText,
  onSend,
  placeholder = '예: 물빠진 로즈 느낌의 매트 립',
  editable = true,
  autoFocus = false,
  style,
}: ComposerProps): React.JSX.Element {
  const focusAnim = React.useRef(new Animated.Value(0)).current;
  const setFocused = (f: boolean) => {
    Animated.timing(focusAnim, {
      toValue: f ? 1 : 0,
      duration: 260,
      useNativeDriver: false, // animates layout ring opacity + lift together
    }).start();
  };
  return (
    <Animated.View
      style={[
        {
          transform: [
            { translateY: focusAnim.interpolate({ inputRange: [0, 1], outputRange: [0, -1] }) },
          ],
        },
        style,
      ]}
    >
      {/* focus glow ring: 0 0 0 3px rgba(224,72,156,.14) */}
      <Animated.View
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: -3,
          left: -3,
          right: -3,
          bottom: -3,
          borderRadius: radius.pill,
          borderWidth: 3,
          borderColor: color.focusRing,
          opacity: focusAnim,
        }}
      />
      <GlassBase
        tier="composer"
        radius={radius.pill}
        shadow={shadows.glass}
        contentStyle={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          paddingTop: 6,
          paddingBottom: 6,
          paddingLeft: 18,
          paddingRight: 6,
        }}
      >
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={color.inkFaint}
          editable={editable}
          autoFocus={autoFocus}
          autoCorrect={false}
          returnKeyType="send"
          onSubmitEditing={onSend}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          accessibilityLabel={placeholder}
          style={[text.body, { flex: 1, minWidth: 0, paddingVertical: 8 }]}
        />
        <SendButton onPress={onSend} />
      </GlassBase>
    </Animated.View>
  );
}
