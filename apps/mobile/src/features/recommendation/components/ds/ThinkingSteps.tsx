// AURADIN thinking steps (searching screen): dot (8px pill) + label rows.
// done = white dot + white label · active = magenta dot + pulse (scale 1→1.5,
// 1400ms) + bold white · pending = faint dot + faint label. Row gap 14, max 268.
// Dots always pair with a text label (a11y: color is never the only signal).
import * as React from 'react';
import { Animated, Text, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { color, font, motion, shadows } from '../../theme/auradinTokens';
import type { ThinkingStep } from '../../types';
import { useReducedMotion } from './motion';

export type ThinkingStepsProps = {
  steps: ThinkingStep[];
  style?: StyleProp<ViewStyle>;
};

function StepDot({ state }: { state: ThinkingStep['state'] }): React.JSX.Element {
  const reduced = useReducedMotion();
  const pulse = React.useRef(new Animated.Value(1)).current;
  React.useEffect(() => {
    if (state !== 'active' || reduced) {
      pulse.setValue(1);
      return;
    }
    const half = motion.stepPulse / 2;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.5, duration: half, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: half, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulse, reduced, state]);

  const bg =
    state === 'done' ? color.inkInverse : state === 'active' ? color.magenta : 'rgba(255,255,255,0.4)';
  return (
    <Animated.View
      style={[
        { width: 8, height: 8, borderRadius: 4, backgroundColor: bg, transform: [{ scale: pulse }] },
        state === 'active' ? shadows.glowDot : null,
      ]}
    />
  );
}

export function ThinkingSteps({ steps, style }: ThinkingStepsProps): React.JSX.Element {
  return (
    <View style={[{ gap: 14, maxWidth: 268 }, style]}>
      {steps.map((s) => {
        const labelColor =
          s.state === 'pending' ? color.inkInverseFaint : color.inkInverse;
        return (
          <View
            key={s.label}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}
            accessibilityLabel={`${s.label} — ${
              s.state === 'done' ? '완료' : s.state === 'active' ? '진행 중' : '대기'
            }`}
          >
            <StepDot state={s.state} />
            <Text
              style={{
                fontFamily: s.state === 'active' ? font.sansBold : font.sans,
                fontSize: 13,
                color: labelColor,
              }}
              allowFontScaling={false}
            >
              {s.label}
            </Text>
          </View>
        );
      })}
    </View>
  );
}
