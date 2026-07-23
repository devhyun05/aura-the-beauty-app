import type {ReactNode} from 'react';
import {BlurView} from 'expo-blur';
import {StyleSheet, View, type StyleProp, type ViewStyle} from 'react-native';

import {colors, radius, shadows} from '../../theme/makeupResultTokens';

export interface ResultGlassCardProps {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function ResultGlassCard({
  children,
  style,
  testID,
}: ResultGlassCardProps) {
  return (
    <View testID={testID} style={[styles.shadowHost, shadows.card, style]}>
      <View style={styles.container}>
        <BlurView
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          intensity={40}
          pointerEvents="none"
          tint="light"
          style={StyleSheet.absoluteFill}
        />
        <View pointerEvents="none" style={styles.fill} />
        <View pointerEvents="none" style={styles.lightCatch} />
        <View style={styles.content}>{children}</View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shadowHost: {
    backgroundColor: colors.glass,
    borderRadius: radius.card,
  },
  container: {
    borderColor: colors.glassBorder,
    borderRadius: radius.card,
    borderWidth: 1,
    overflow: 'hidden',
  },
  fill: {
    backgroundColor: 'rgba(255,255,255,0.54)',
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  lightCatch: {
    backgroundColor: 'rgba(255,255,255,0.82)',
    height: StyleSheet.hairlineWidth,
    left: 14,
    position: 'absolute',
    right: 14,
    top: 0,
  },
  content: {
    padding: 20,
  },
});
