import React, { useEffect } from 'react';
import { View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { beardColors } from '../tokens/tokens';

/**
 * 하관 전용 스캔 모션. Reanimated loop over translateY (168↔256) with a dwell at each end,
 * plus a horizontal shimmer across the core line.
 *
 * FIDELITY: CSS `mix-blend-mode: screen` (which actually brightens the photo) has no RN
 * equivalent — approximated here with a translucent ice→lavender LinearGradient band + a low
 * -opacity white layer. See README "screen-blend" flag. Reduced motion → static core line.
 */
export function ScanOverlay({ reducedMotion = false }: { reducedMotion?: boolean }) {
  const y = useSharedValue(168);
  const shimmer = useSharedValue(0);

  useEffect(() => {
    if (reducedMotion) {
      y.value = 212; // rest at mid-lower jaw
      return;
    }
    // 3.6s round trip with brief dwell at each end (mirrors bs-scan keyframes).
    y.value = withRepeat(
      withSequence(
        withTiming(168, { duration: 300, easing: Easing.inOut(Easing.ease) }),
        withTiming(256, { duration: 1500, easing: Easing.inOut(Easing.ease) }),
        withDelay(300, withTiming(256, { duration: 1 })),
        withTiming(168, { duration: 1500, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
      false,
    );
    shimmer.value = withRepeat(withTiming(1, { duration: 2300, easing: Easing.linear }), -1, false);
  }, [reducedMotion]);

  const bandStyle = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));
  const shimmerStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: -160 + shimmer.value * 420 }],
  }));

  return (
    <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: 0, right: 0, top: 0, height: 0 }, bandStyle]}>
      {/* Light band (screen-blend approximation) */}
      <LinearGradient
        colors={[
          'rgba(140,170,220,0)',
          'rgba(150,182,232,0.26)',
          'rgba(196,184,255,0.34)',
          'rgba(150,182,232,0.26)',
          'rgba(140,170,220,0)',
        ]}
        locations={[0, 0.4, 0.5, 0.6, 1]}
        style={{ position: 'absolute', left: 0, right: 0, top: -36, height: 72 }}
      />
      {/* Soft halo */}
      <LinearGradient
        colors={['rgba(145,191,255,0)', 'rgba(145,191,255,0.14)', 'rgba(184,164,255,0)']}
        locations={[0, 0.5, 1]}
        style={{ position: 'absolute', left: '7%', right: '7%', top: -60, height: 120, borderRadius: 60 }}
      />
      {/* Core line 2px with glow */}
      <View
        style={{
          position: 'absolute',
          left: '7%',
          right: '7%',
          top: -1,
          height: 2,
          borderRadius: 2,
          overflow: 'hidden',
          shadowColor: beardColors.iceBlue,
          shadowOpacity: 0.85,
          shadowRadius: 10,
          shadowOffset: { width: 0, height: 0 },
        }}
      >
        <LinearGradient
          colors={['transparent', beardColors.iceBlue, '#E4DBFF', beardColors.iceBlue, 'transparent']}
          locations={[0, 0.16, 0.5, 0.84, 1]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
        />
        {/* Moving glint */}
        {!reducedMotion ? (
          <Animated.View style={[{ position: 'absolute', top: -1, width: 110, height: 4 }, shimmerStyle]}>
            <LinearGradient
              colors={['transparent', 'rgba(255,255,255,0.95)', 'transparent']}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={{ flex: 1, borderRadius: 4 }}
            />
          </Animated.View>
        ) : null}
      </View>
      {/* End cap ticks */}
      <View style={{ position: 'absolute', left: '4.5%', top: -7, width: 2.5, height: 14, borderRadius: 2, backgroundColor: beardColors.lavenderBright }} />
      <View style={{ position: 'absolute', right: '4.5%', top: -7, width: 2.5, height: 14, borderRadius: 2, backgroundColor: beardColors.lavenderBright }} />
    </Animated.View>
  );
}
