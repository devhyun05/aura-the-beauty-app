import { Pressable, StyleSheet } from 'react-native';
import { Text, View } from 'tamagui';

import { colors, spacing, typography } from '../theme';
import { ChevronRightIcon } from './LineIcons';

type SectionHeaderProps = {
  title: string;
  actionLabel?: string;
  onPressAction?: () => void;
};

export function SectionHeader({
  title,
  actionLabel,
  onPressAction,
}: SectionHeaderProps) {
  return (
    <View style={styles.header}>
      <Text style={styles.title}>{title}</Text>

      {actionLabel ? (
        <Pressable
          accessibilityLabel={`${title} ${actionLabel}`}
          accessibilityRole="button"
          onPress={onPressAction}
          style={styles.action}
        >
          <Text style={styles.actionLabel}>{actionLabel}</Text>
          <ChevronRightIcon />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  action: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
  },
  actionLabel: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.medium,
    lineHeight: typography.lineHeight.md,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 32,
  },
  title: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.bold,
    lineHeight: typography.lineHeight.xl,
  },
});
