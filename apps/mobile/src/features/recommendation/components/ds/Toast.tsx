// AURADIN glass toast, bottom-centered — "보관함에 담김" after a save.
import * as React from 'react';
import { Animated, Text } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { color, font, motion, radius } from '../../theme/auradinTokens';
import { GlassBase } from './GlassBase';
import { useReducedMotion } from './motion';

export type ToastProps = {
  show: boolean;
  label: string;
  /** distance from the bottom edge (default 28) */
  bottom?: number;
  style?: StyleProp<ViewStyle>;
};

export function Toast({ show, label, bottom = 28, style }: ToastProps): React.JSX.Element {
  const reduced = useReducedMotion();
  const anim = React.useRef(new Animated.Value(show ? 1 : 0)).current;
  React.useEffect(() => {
    Animated.timing(anim, {
      toValue: show ? 1 : 0,
      duration: reduced ? 0 : 300,
      easing: motion.easeOut,
      useNativeDriver: true,
    }).start();
  }, [anim, reduced, show]);
  return (
    <Animated.View
      pointerEvents="none"
      accessibilityLiveRegion="polite"
      style={[
        {
          position: 'absolute',
          bottom,
          alignSelf: 'center',
          opacity: anim,
          transform: [
            { translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) },
          ],
          zIndex: 30,
        },
        style,
      ]}
    >
      <GlassBase
        tier="card"
        radius={radius.pill}
        contentStyle={{ paddingVertical: 12, paddingHorizontal: 20 }}
      >
        <Text
          style={{ fontFamily: font.sans, fontSize: 13, color: color.ink }}
          allowFontScaling={false}
          numberOfLines={1}
        >
          {label}
        </Text>
      </GlassBase>
    </Animated.View>
  );
}
