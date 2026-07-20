import React from 'react';
import { Platform, StyleSheet, View, type ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';
import { beardColors } from '../tokens/tokens';

/**
 * The single glass surface in the flow (result bottom control panel).
 * expo-blur BlurView + translucent fill + 1px border + inset top highlight.
 *
 * Fallback: if BlurView is unsupported or perf-limited, the component still reads correctly
 * with an opaque-ish fill + border only (set `disableBlur`). See README blur fidelity flag.
 */
export function GlassPanel({
  children,
  radius = 26,
  style,
  disableBlur = false,
  intensity = 40,
}: {
  children: React.ReactNode;
  radius?: number;
  style?: ViewStyle;
  disableBlur?: boolean;
  intensity?: number;
}) {
  const useBlur = !disableBlur && Platform.OS !== 'web';

  return (
    <View style={[{ borderRadius: radius, overflow: 'hidden' }, style]}>
      {useBlur ? (
        <BlurView intensity={intensity} tint="dark" style={StyleSheet.absoluteFill} />
      ) : null}
      <View
        style={{
          borderRadius: radius,
          borderWidth: 1,
          borderColor: beardColors.glassBorder,
          backgroundColor: useBlur ? beardColors.glassFill : beardColors.glassFallback,
        }}
      >
        {/* inset top reflection: 0 1 0 rgba(255,255,255,0.08) */}
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: 0,
            height: 1,
            backgroundColor: beardColors.glassHighlight,
          }}
        />
        {children}
      </View>
    </View>
  );
}
