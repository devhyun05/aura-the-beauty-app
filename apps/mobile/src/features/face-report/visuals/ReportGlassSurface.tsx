import type {ReactNode} from 'react';
import {BlurView} from 'expo-blur';
import {
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import {color, radius} from '../reportTokens';

type ReportGlassSurfaceProps = {
  children: ReactNode;
  contentStyle?: StyleProp<ViewStyle>;
  style?: StyleProp<ViewStyle>;
};

/**
 * Neutral report glass. It keeps AURADIN's real blur, light catch and fine
 * membrane edge, while deliberately omitting its colour-film and holo layers.
 */
export function ReportGlassSurface({
  children,
  contentStyle,
  style,
}: ReportGlassSurfaceProps) {
  return (
    <View style={[styles.host, style]}>
      <BlurView
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        intensity={34}
        pointerEvents="none"
        tint="light"
        style={StyleSheet.absoluteFill}
      />
      <View pointerEvents="none" style={styles.membrane} />
      <View pointerEvents="none" style={styles.lightCatch} />
      <View style={contentStyle}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    backgroundColor: 'rgba(255,255,255,0.58)',
    borderColor: 'rgba(255,255,255,0.78)',
    borderRadius: radius.md,
    borderWidth: 1,
    overflow: 'hidden',
    shadowColor: color.ink,
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.08,
    shadowRadius: 12,
  },
  lightCatch: {
    backgroundColor: 'rgba(255,255,255,0.72)',
    height: StyleSheet.hairlineWidth,
    left: 10,
    position: 'absolute',
    right: 10,
    top: 0,
  },
  membrane: {
    backgroundColor: 'rgba(244,249,251,0.24)',
    bottom: 0,
    borderBottomColor: 'rgba(22,48,59,0.08)',
    borderBottomWidth: StyleSheet.hairlineWidth,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
});
