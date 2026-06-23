import type { ReactNode } from 'react';
import { Pressable, StyleSheet } from 'react-native';

import { colors, radius } from '../theme';

type IconButtonProps = {
  accessibilityLabel: string;
  children: ReactNode;
  onPress?: () => void;
  variant?: 'plain' | 'outlined';
  size?: number;
};

export function IconButton({
  accessibilityLabel,
  children,
  onPress,
  variant = 'plain',
  size = 40,
}: IconButtonProps) {
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      hitSlop={8}
      onPress={onPress}
      style={[
        styles.button,
        {
          height: size,
          width: size,
        },
        variant === 'outlined' ? styles.outlined : null,
      ]}
    >
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  outlined: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
});
