// AURADIN — motion hooks: reduced-motion, screen-enter transition, liquid press scale.
import * as React from 'react';
import { AccessibilityInfo, Animated } from 'react-native';
import { motion } from '../../theme/auradinTokens';

/** prefers-reduced-motion — always respected (orb freezes, loops stop, enters jump). */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = React.useState(false);
  React.useEffect(() => {
    let live = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((v) => {
        if (live) setReduced(v);
      })
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => {
      live = false;
      sub.remove();
    };
  }, []);
  return reduced;
}

type EnterStyle = {
  opacity: Animated.Value;
  transform: { translateY: Animated.AnimatedInterpolation<number> }[];
};

/** Screen enter: fade + translateY 12–16 → 0, 480ms ease-out.
 *  Pass enabled=false for the error screen (it enters statically, per spec). */
export function useEnterTransition(offsetY = 14, enabled = true): EnterStyle {
  const reduced = useReducedMotion();
  const progress = React.useRef(new Animated.Value(enabled ? 0 : 1)).current;
  React.useEffect(() => {
    if (!enabled) {
      progress.setValue(1);
      return;
    }
    if (reduced) {
      progress.setValue(1);
      return;
    }
    Animated.timing(progress, {
      toValue: 1,
      duration: motion.durEnter,
      easing: motion.easeOut,
      useNativeDriver: true,
    }).start();
  }, [enabled, progress, reduced]);
  return {
    opacity: progress,
    transform: [
      {
        translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [offsetY, 0] }),
      },
    ],
  };
}

type PressScale = {
  pressStyle: { transform: { scale: Animated.Value }[]; opacity: Animated.Value };
  onPressIn: () => void;
  onPressOut: () => void;
};

/** Press feedback: springy scale (liquid), optional opacity dim (tiles: .92). */
export function usePressScale(to = 0.96, dim?: number): PressScale {
  const reduced = useReducedMotion();
  const scale = React.useRef(new Animated.Value(1)).current;
  const opacity = React.useRef(new Animated.Value(1)).current;
  const onPressIn = React.useCallback(() => {
    if (reduced) return;
    Animated.spring(scale, { toValue: to, useNativeDriver: true, speed: 40, bounciness: 4 }).start();
    if (dim !== undefined) {
      Animated.timing(opacity, { toValue: dim, duration: 120, useNativeDriver: true }).start();
    }
  }, [dim, opacity, reduced, scale, to]);
  const onPressOut = React.useCallback(() => {
    if (reduced) return;
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 14, bounciness: 11 }).start();
    if (dim !== undefined) {
      Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }).start();
    }
  }, [dim, opacity, reduced, scale]);
  return { pressStyle: { transform: [{ scale }], opacity }, onPressIn, onPressOut };
}
