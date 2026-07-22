import { Pressable, StyleSheet } from 'react-native';
import { Text, View } from 'tamagui';

import { colors, spacing, typography } from '../theme';
import { AppHeader } from './AppHeader';
import { AppScreen } from './AppScreen';

type RoutePlaceholderProps = {
  title: string;
  description: string;
  onBack?: () => void;
  onPrimaryAction?: () => void;
  onSecondaryAction?: () => void;
  primaryActionLabel?: string;
  secondaryActionLabel?: string;
  showHeader?: boolean;
};

export function RoutePlaceholder({
  title,
  description,
  onBack,
  onPrimaryAction,
  onSecondaryAction,
  primaryActionLabel,
  secondaryActionLabel,
  showHeader = true,
}: RoutePlaceholderProps) {
  return (
    <AppScreen scroll={false} topPadding="none">
      {showHeader ? <AppHeader onBack={onBack} title={title} /> : null}
      <View style={styles.body}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.description}>{description}</Text>
        {primaryActionLabel && onPrimaryAction ? (
          <Pressable
            accessibilityRole="button"
            onPress={onPrimaryAction}
            style={styles.primaryAction}>
            <Text style={styles.primaryActionText}>{primaryActionLabel}</Text>
          </Pressable>
        ) : null}
        {secondaryActionLabel && onSecondaryAction ? (
          <Pressable
            accessibilityRole="button"
            onPress={onSecondaryAction}
            style={styles.secondaryAction}>
            <Text style={styles.secondaryActionText}>{secondaryActionLabel}</Text>
          </Pressable>
        ) : null}
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  body: {
    alignItems: 'center',
    borderColor: colors.border,
    borderRadius: 18,
    borderWidth: 1,
    gap: spacing.sm,
    justifyContent: 'center',
    padding: spacing.xxl,
  },
  description: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.regular,
    lineHeight: typography.lineHeight.sm,
    textAlign: 'center',
  },
  primaryAction: {
    alignItems: 'center',
    backgroundColor: colors.textPrimary,
    borderRadius: 999,
    marginTop: spacing.md,
    minWidth: 180,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  primaryActionText: {
    color: colors.surface,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
    lineHeight: typography.lineHeight.sm,
  },
  secondaryAction: {
    alignItems: 'center',
    borderColor: colors.border,
    borderRadius: 999,
    borderWidth: 1,
    minWidth: 180,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  secondaryActionText: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
    lineHeight: typography.lineHeight.sm,
  },
  title: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
    lineHeight: typography.lineHeight.lg,
  },
});
