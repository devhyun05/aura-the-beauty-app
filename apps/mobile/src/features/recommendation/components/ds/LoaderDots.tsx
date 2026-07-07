// AURADIN loader row — mono status label + 3 staggered pulsing dots (5px pills,
// 200ms staggered opacity 0.2↔1). Searching screen; also used ink-toned for the
// results refine wait.
import * as React from 'react';
import { Animated, Text, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { color, text, motion } from '../../theme/auradinTokens';
import { useReducedMotion } from './motion';

export type LoaderDotsProps = {
  label?: string;
  /** dot + label color (white on the dark searching screen, ink on light) */
  tone?: 'light' | 'ink';
  style?: StyleProp<ViewStyle>;
};

export function LoaderDots({ label, tone = 'light', style }: LoaderDotsProps): React.JSX.Element {
  const reduced = useReducedMotion();
  const dots = React.useRef([new Animated.Value(0.2), new Animated.Value(0.2), new Animated.Value(0.2)]).current;
  React.useEffect(() => {
    if (reduced) {
      // frozen frame: readable, no motion
      dots[0]?.setValue(1);
      dots[1]?.setValue(0.55);
      dots[2]?.setValue(0.25);
      return;
    }
    const half = motion.loaderCycle / 2;
    const loops = dots.map((v, i) =>
      Animated.sequence([
        Animated.delay(i * motion.loaderStagger),
        Animated.loop(
          Animated.sequence([
            Animated.timing(v, { toValue: 1, duration: half, useNativeDriver: true }),
            Animated.timing(v, { toValue: 0.2, duration: half, useNativeDriver: true }),
          ])
        ),
      ])
    );
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, [dots, reduced]);

  const c = tone === 'light' ? color.inkInverse : color.ink;
  return (
    <View
      style={[{ flexDirection: 'row', alignItems: 'center', gap: 10 }, style]}
      accessibilityRole="progressbar"
      accessibilityLabel={label}
    >
      {label ? (
        <Text style={[text.meta, { color: c }]} allowFontScaling={false}>
          {label}
        </Text>
      ) : null}
      <View style={{ flexDirection: 'row', gap: 5 }}>
        {dots.map((v, i) => (
          <Animated.View
            key={i}
            style={{ width: 5, height: 5, borderRadius: 2.5, backgroundColor: c, opacity: v }}
          />
        ))}
      </View>
    </View>
  );
}
