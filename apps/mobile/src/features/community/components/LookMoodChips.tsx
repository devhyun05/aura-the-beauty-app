import {StyleSheet} from 'react-native';
import {Text, XStack} from 'tamagui';

import {colors, communityColors, radius, spacing, typography} from '../../../shared/theme';

type LookMoodChipsTone = 'light' | 'dark' | 'tint';

export function LookMoodChips({
  limit = 3,
  tags,
  tone = 'light',
}: {
  limit?: number;
  tags: string[];
  tone?: LookMoodChipsTone;
}) {
  return (
    <XStack style={styles.chipRow}>
      {tags.slice(0, limit).map(tag => (
        <Text
          key={tag}
          numberOfLines={1}
          style={[
            styles.chipText,
            tone === 'dark' && styles.darkChipText,
            tone === 'tint' && styles.tintChipText,
          ]}>
          #{tag}
        </Text>
      ))}
    </XStack>
  );
}

const styles = StyleSheet.create({
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  chipText: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.pill,
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
    maxWidth: 118,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  darkChipText: {
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
    color: colors.white,
  },
  tintChipText: {
    backgroundColor: communityColors.accentSoft,
    color: communityColors.accent,
  },
});