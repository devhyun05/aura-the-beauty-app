import { StyleSheet } from 'react-native';
import { Text, View } from 'tamagui';

import { colors, spacing, typography } from '../theme';
import { AppHeader } from './AppHeader';
import { AppScreen } from './AppScreen';

type RoutePlaceholderProps = {
  title: string;
  description: string;
  onBack?: () => void;
};

export function RoutePlaceholder({
  title,
  description,
  onBack,
}: RoutePlaceholderProps) {
  return (
    <AppScreen scroll={false}>
      <AppHeader onBack={onBack} title={title} />
      <View style={styles.body}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.description}>{description}</Text>
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
  title: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
    lineHeight: typography.lineHeight.lg,
  },
});
