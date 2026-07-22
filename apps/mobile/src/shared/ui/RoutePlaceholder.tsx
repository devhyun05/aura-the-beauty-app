import { Pressable, StyleSheet } from 'react-native';
import { Text, View } from 'tamagui';

import { colors, spacing, typography } from '../theme';
import { AppHeader } from './AppHeader';
import { AppScreen } from './AppScreen';

type RoutePlaceholderProps = {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  onBack?: () => void;
  showHeader?: boolean;
};

export function RoutePlaceholder({
  title,
  description,
  actionLabel,
  onAction,
  onBack,
  showHeader = true,
}: RoutePlaceholderProps) {
  return (
    <AppScreen scroll={false} topPadding="none">
      {showHeader ? <AppHeader onBack={onBack} title={title} /> : null}
      <View style={styles.body}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.description}>{description}</Text>
        {actionLabel && onAction ? (
          <Pressable
            accessibilityLabel={actionLabel}
            accessibilityRole="button"
            onPress={onAction}
            style={({pressed}) => [
              styles.action,
              pressed && styles.actionPressed,
            ]}>
            <Text style={styles.actionText}>{actionLabel}</Text>
          </Pressable>
        ) : null}
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  action: {
    alignItems: 'center',
    backgroundColor: colors.blackSurface,
    borderRadius: 12,
    justifyContent: 'center',
    marginTop: spacing.sm,
    minHeight: 44,
    paddingHorizontal: spacing.xl,
  },
  actionPressed: {
    opacity: 0.76,
  },
  actionText: {
    color: colors.white,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    lineHeight: typography.lineHeight.sm,
  },
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
  title: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
    lineHeight: typography.lineHeight.lg,
  },
});
