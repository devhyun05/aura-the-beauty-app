import React, { useMemo, useRef, useState } from 'react';
import { PanResponder, Text, View } from 'react-native';
import Animated, { SharedValue, useAnimatedStyle } from 'react-native-reanimated';
import { color, font, radius } from '../reportTokens';

interface Props {
  value: SharedValue<number>; // -1 (warm) .. 1 (cool); 0 = 기준 조명
  heading: string;
  warmLabel: string;
  coolLabel: string;
  captions: { warm: string; neutral: string; cool: string };
}

/** S4 lighting dial: horizontal drag rotates the tick −70°..70° and retints the drape preview. */
export function LightingDial({ value, heading, warmLabel, coolLabel, captions }: Props) {
  const [zone, setZone] = useState<-1 | 0 | 1>(0);
  const start = useRef(0);

  // The dial lives inside the report's vertical ScrollView, and the screen has an
  // iOS swipe-back gesture. Without claiming the touch on capture AND refusing
  // termination, the ScrollView steals the drag mid-gesture (page scrolls) and a
  // horizontal drag can fall through to swipe-back. Capture + refusing to
  // terminate keeps the gesture here once it starts on the dial.
  const pan = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onStartShouldSetPanResponderCapture: () => true,
    onMoveShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponderCapture: () => true,
    // Never hand the gesture to the parent ScrollView once the dial owns it.
    onPanResponderTerminationRequest: () => false,
    // Stop native scroll / swipe-back from taking over.
    onShouldBlockNativeResponder: () => true,
    onPanResponderGrant: () => { start.current = value.value; },
    onPanResponderMove: (_e, g) => {
      const v = Math.max(-1, Math.min(1, start.current + g.dx / 70));
      value.value = v;
      const z = v < -0.25 ? -1 : v > 0.25 ? 1 : 0;
      setZone(prev => (prev === z ? prev : z));
    },
  }), []);

  const tickStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${value.value * 70}deg` }] }));

  return (
    <View style={{
      width: 92, alignItems: 'center', justifyContent: 'center', gap: 8,
      borderWidth: 1, borderColor: color.outline8, borderRadius: radius.lg,
      paddingVertical: 10, paddingHorizontal: 6,
    }}>
      <Text style={[font(10, '800', undefined, 0.8), { color: color.muted }]}>{heading}</Text>
      <View
        {...pan.panHandlers}
        // 52px is a small drag target; extend the touch area without changing layout.
        hitSlop={{top: 12, bottom: 12, left: 12, right: 12}}
        style={{
          width: 52, height: 52, borderRadius: 26, backgroundColor: color.dial,
          borderWidth: 1, borderColor: 'rgba(22,48,59,0.1)',
        }}>
        <Animated.View style={[{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center' }, tickStyle]}>
          <View style={{ width: 3, height: 16, borderRadius: 2, backgroundColor: color.magenta, marginTop: 5 }} />
        </Animated.View>
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignSelf: 'stretch', paddingHorizontal: 4 }}>
        <Text style={[font(10, '700'), { color: color.warmLabel }]}>{warmLabel}</Text>
        <Text style={[font(10, '700'), { color: color.accentDeep }]}>{coolLabel}</Text>
      </View>
      <Text style={[font(9.5, '400', 1.4), { color: color.muted, textAlign: 'center' }]}>
        {zone === -1 ? captions.warm : zone === 1 ? captions.cool : captions.neutral}
      </Text>
    </View>
  );
}
