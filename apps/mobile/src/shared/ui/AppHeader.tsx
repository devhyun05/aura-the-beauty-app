import type { ReactNode } from 'react';
import { StyleSheet } from 'react-native';
import { Text, View } from 'tamagui';

import { colors, spacing, typography } from '../theme';
import { ChevronLeftIcon } from './LineIcons';
import { IconButton } from './IconButton';

type AppHeaderProps = {
  title: string;
  leftSlot?: ReactNode;
  rightSlot?: ReactNode;
  onBack?: () => void;
};

export function AppHeader({
  title,
  leftSlot,
  rightSlot,
  onBack,
}: AppHeaderProps) {
  const leftContent =
    leftSlot ??
    (onBack ? (
      <IconButton accessibilityLabel="뒤로가기" onPress={onBack}>
        <ChevronLeftIcon />
      </IconButton>
    ) : null);

  return (
    <View style={styles.header}>
      <View style={styles.side}>{leftContent}</View>
      <Text numberOfLines={1} style={styles.title}>
        {title}
      </Text>
      <View style={styles.side}>{rightSlot}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 44,
  },
  side: {
    alignItems: 'center',
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  title: {
    color: colors.textPrimary,
    flex: 1,
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.bold,
    lineHeight: typography.lineHeight.xl,
    textAlign: 'center',
  },
});
