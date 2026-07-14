import {ActivityIndicator, Pressable, StyleSheet, View} from 'react-native';
import {Text} from 'tamagui';

import {colors, radius, spacing, typography} from '../../../shared/theme';

export function RecommendationSectionState({
  kind,
  message,
  actionLabel,
  onAction,
}: {
  kind: 'loading' | 'empty' | 'error' | 'off';
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View accessibilityLiveRegion="polite" style={styles.container}>
      {kind === 'loading' ? <ActivityIndicator color={colors.textPrimary} /> : null}
      <Text style={styles.message}>{message}</Text>
      {actionLabel && onAction ? (
        <Pressable accessibilityRole="button" onPress={onAction} style={styles.action}>
          <Text style={styles.actionText}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {alignItems: 'flex-start', backgroundColor: colors.surface, borderRadius: radius.lg, gap: spacing.sm, padding: spacing.md},
  message: {color: colors.textSecondary, fontFamily: typography.fontFamily.regular, fontSize: typography.fontSize.sm, lineHeight: typography.lineHeight.sm},
  action: {alignItems: 'center', borderColor: colors.borderStrong, borderRadius: radius.pill, borderWidth: 1, justifyContent: 'center', minHeight: 44, paddingHorizontal: spacing.md},
  actionText: {...typography.caption, color: colors.textPrimary, fontWeight: '700'},
});
