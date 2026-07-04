import type {ReactNode} from 'react';
import {Image, Pressable, ScrollView, StyleSheet} from 'react-native';
import {CheckCircle2, CircleAlert} from 'lucide-react-native';
import {Text, View, XStack, YStack} from 'tamagui';

import {colors, iconSize, radius, shadows, spacing, typography} from '../../../shared/theme';
import {AppScreen} from '../../../shared/ui';
import type {MakeupFeedbackResult} from '../types';

type MakeupFeedbackResultsListScreenProps = {
  onPressResult?: (result: MakeupFeedbackResult) => void;
  results: MakeupFeedbackResult[];
};

export function MakeupFeedbackResultsListScreen({
  onPressResult,
  results,
}: MakeupFeedbackResultsListScreenProps) {
  return (
    <AppScreen contentGap={spacing.lg} scroll={false} topPadding="none">
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}>
        {results.length > 0 ? (
          results.map((result) => (
            <MakeupFeedbackResultCard
              key={result.id}
              onPress={() => onPressResult?.(result)}
              result={result}
            />
          ))
        ) : (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateText}>저장된 메이크업 피드백이 없어요.</Text>
          </View>
        )}
      </ScrollView>
    </AppScreen>
  );
}

function MakeupFeedbackResultCard({
  onPress,
  result,
}: {
  onPress: () => void;
  result: MakeupFeedbackResult;
}) {
  const goalLabel = result.interpretedGoal?.label ?? '메이크업 피드백';
  const pointCount = result.points.length;
  const strengthCount = result.strengths.length;

  return (
    <Pressable
      accessibilityLabel={`${goalLabel} 피드백 보기`}
      accessibilityRole="button"
      onPress={onPress}
      style={({pressed}) => [styles.card, pressed && styles.cardPressed]}>
      <Image resizeMode="cover" source={result.uploadedImage} style={styles.thumbnail} />
      <YStack style={styles.cardBody}>
        <XStack style={styles.cardHeader}>
          <YStack style={styles.titleGroup}>
            <Text numberOfLines={1} style={styles.eyebrow}>
              {result.photoSourceLabel}
            </Text>
            <Text numberOfLines={2} style={styles.title}>
              {goalLabel}
            </Text>
          </YStack>
          <YStack style={styles.scoreBadge}>
            <Text style={styles.scoreValue}>{result.score}</Text>
            <Text style={styles.scoreLabel}>점</Text>
          </YStack>
        </XStack>

        <XStack style={styles.summaryRow}>
          <SummaryPill
            icon={<CircleAlert color={colors.textPrimary} size={iconSize.xs} strokeWidth={2} />}
            label={`보완 ${pointCount}`}
          />
          <SummaryPill
            icon={<CheckCircle2 color={colors.textPrimary} size={iconSize.xs} strokeWidth={2} />}
            label={`잘한 점 ${strengthCount}`}
          />
        </XStack>
      </YStack>
    </Pressable>
  );
}

function SummaryPill({icon, label}: {icon: ReactNode; label: string}) {
  return (
    <XStack style={styles.summaryPill}>
      {icon}
      <Text numberOfLines={1} style={styles.summaryPillText}>
        {label}
      </Text>
    </XStack>
  );
}

const cardShadow = {
  shadowColor: shadows.soft.shadowColor,
  shadowOffset: shadows.soft.shadowOffset,
  shadowOpacity: shadows.soft.shadowOpacity,
  shadowRadius: shadows.soft.shadowRadius,
} as const;

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.md,
    ...cardShadow,
  },
  cardBody: {
    flex: 1,
    gap: spacing.md,
    justifyContent: 'space-between',
    minWidth: 0,
  },
  cardHeader: {
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  cardPressed: {
    opacity: 0.74,
  },
  content: {
    gap: spacing.md,
    paddingBottom: spacing.xxl,
  },
  emptyState: {
    alignItems: 'center',
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 180,
    padding: spacing.xl,
  },
  emptyStateText: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    lineHeight: typography.lineHeight.sm,
    textAlign: 'center',
  },
  eyebrow: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
    lineHeight: typography.lineHeight.xs,
  },
  scoreBadge: {
    alignItems: 'center',
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: 1,
    height: 54,
    justifyContent: 'center',
    width: 54,
  },
  scoreLabel: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium,
    lineHeight: typography.lineHeight.xs,
  },
  scoreValue: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.bold,
    lineHeight: typography.lineHeight.md,
  },
  summaryPill: {
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.pill,
    gap: spacing.xs,
    maxWidth: '48%',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  summaryPillText: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
    lineHeight: typography.lineHeight.xs,
  },
  summaryRow: {
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  thumbnail: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
    height: 112,
    width: 92,
  },
  title: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.bold,
    lineHeight: typography.lineHeight.md,
  },
  titleGroup: {
    flex: 1,
    gap: spacing.xs,
    minWidth: 0,
  },
});
