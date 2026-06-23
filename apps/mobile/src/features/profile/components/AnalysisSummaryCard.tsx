import { StyleSheet } from 'react-native';
import { Text, View } from 'tamagui';

import { colors, radius, spacing, typography } from '../../../shared/theme';
import {
  AppCard,
  ChevronRightIcon,
  ImagePlaceholder,
} from '../../../shared/ui';
import type { AnalysisResult } from '../../../shared/types/analysis';

type AnalysisSummaryCardProps = {
  result: AnalysisResult;
  onPress?: () => void;
};

export function AnalysisSummaryCard({
  result,
  onPress,
}: AnalysisSummaryCardProps) {
  return (
    <AppCard onPress={onPress} style={styles.card}>
      <View style={styles.row}>
        <View style={styles.imageFrame}>
          <ImagePlaceholder
            borderRadius={radius.md}
            source={result.imageSource}
          />
        </View>

        <View style={styles.info}>
          <Text numberOfLines={1} style={styles.title}>
            {result.title}
          </Text>
          <Text numberOfLines={2} style={styles.description}>
            {result.shortSummary}
          </Text>
          <Text numberOfLines={1} style={styles.mood}>
            {result.recommendedMood}
          </Text>
        </View>

        <ChevronRightIcon />
      </View>
    </AppCard>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 18,
    padding: 10,
  },
  description: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.regular,
    lineHeight: typography.lineHeight.sm,
  },
  imageFrame: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
    height: 92,
    overflow: 'hidden',
    width: 92,
  },
  info: {
    flex: 1,
    gap: spacing.sm,
    justifyContent: 'center',
    minWidth: 0,
  },
  mood: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    lineHeight: typography.lineHeight.sm,
  },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.lg,
  },
  title: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
    lineHeight: typography.lineHeight.lg,
  },
});
