import type { ReactNode } from 'react';
import { Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { View } from 'tamagui';

import { colors, radius, shadows } from '../theme';

type AppCardProps = {
  children: ReactNode;
  onPress?: () => void;
  padded?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function AppCard({
  children,
  onPress,
  padded = true,
  style,
}: AppCardProps) {
  const cardStyle = [styles.card, padded ? styles.padded : null, style];

  if (onPress) {
    return (
      <Pressable
        accessibilityRole="button"
        onPress={onPress}
        style={cardStyle}
      >
        {children}
      </Pressable>
    );
  }

  return <View style={cardStyle}>{children}</View>;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    elevation: shadows.soft.elevation,
    shadowColor: shadows.soft.shadowColor,
    shadowOffset: shadows.soft.shadowOffset,
    shadowOpacity: 0.035,
    shadowRadius: 12,
  },
  padded: {
    padding: 18,
  },
});
