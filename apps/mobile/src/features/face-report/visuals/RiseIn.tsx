import React, { createContext, useContext } from 'react';
import { StyleProp, ViewStyle, useWindowDimensions } from 'react-native';
import Animated, {
  Easing, SharedValue, measure, runOnUI, useAnimatedReaction, useAnimatedRef,
  useAnimatedStyle, useSharedValue, withTiming,
} from 'react-native-reanimated';

export const ScrollAnimContext = createContext<{ scrollY: SharedValue<number>; enabled: boolean } | null>(null);

const EASE = Easing.bezier(0.22, 0.9, 0.3, 1);

/** omRise equivalent: 16px rise + fade the first time the element scrolls into view. */
export function RiseIn({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const ctx = useContext(ScrollAnimContext);
  const { height: windowH } = useWindowDimensions();
  const enabled = ctx?.enabled ?? true;
  const done = useSharedValue(enabled ? 0 : 1);
  const shown = useSharedValue(enabled ? 0 : 1);
  const ref = useAnimatedRef<Animated.View>();
  const scrollY = ctx?.scrollY;

  const check = () => {
    'worklet';
    if (done.value) return;
    const m = measure(ref);
    if (m && m.pageY < windowH - 40 && m.pageY + m.height > 0) {
      done.value = 1;
      shown.value = withTiming(1, { duration: 550, easing: EASE });
    }
  };

  useAnimatedReaction(() => (scrollY ? scrollY.value : 0), () => check());

  const aStyle = useAnimatedStyle(() => ({
    opacity: shown.value,
    transform: [{ translateY: 16 * (1 - shown.value) }],
  }));

  return (
    <Animated.View ref={ref} style={[style, aStyle]} onLayout={() => runOnUI(check)()}>
      {children}
    </Animated.View>
  );
}
