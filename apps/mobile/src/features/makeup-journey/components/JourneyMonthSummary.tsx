import {StyleSheet} from 'react-native';
import {CalendarDays, Flame, Target, TrendingUp} from 'lucide-react-native';
import {Text, View} from 'tamagui';

import {colors, radius, shadows, spacing, typography} from '../../../shared/theme';
import type {MakeupJourneyMonthSummary} from '../types';

type JourneyMonthSummaryProps = {
  goalScore: number | null;
  summary?: MakeupJourneyMonthSummary | null;
};

export function JourneyMonthSummary({goalScore, summary}: JourneyMonthSummaryProps) {
  const averageScore = summary?.averageScore ?? null;
  const recordedDays = summary?.recordedDays ?? 0;
  const currentStreak = summary?.currentStreak ?? 0;
  const goalDifference = averageScore !== null && goalScore !== null
    ? averageScore - goalScore
    : null;
  const progress = averageScore !== null && goalScore !== null
    ? Math.min(100, Math.max(0, Math.round((averageScore / goalScore) * 100)))
    : 0;
  const hasReachedGoal = goalDifference !== null && goalDifference >= 0;
  const insight = averageScore === null
    ? '첫 피드백을 남기면 이달의 변화가 시작돼요.'
    : goalScore === null
      ? '목표 점수를 설정하면 달성 흐름을 함께 보여드려요.'
      : hasReachedGoal
        ? goalDifference === 0
          ? '이번 달 평균이 목표에 정확히 도달했어요.'
          : `이번 달 평균이 목표보다 ${goalDifference}점 높아요.`
        : `목표까지 ${Math.abs(goalDifference ?? 0)}점 남았어요.`;
  const metrics = [
    {
      icon: CalendarDays,
      label: '기록한 날',
      value: `${recordedDays}일`,
    },
    {
      icon: Flame,
      label: '현재 연속 기록',
      value: `${currentStreak}일`,
    },
  ];

  return (
    <View accessibilityLabel="이번 달 성장 요약" style={styles.container}>
      <View style={styles.header}>
        <View style={styles.titleGroup}>
          <View style={styles.titleIcon}>
            <TrendingUp color={colors.white} size={17} />
          </View>
          <View>
            <Text style={styles.eyebrow}>MONTHLY REVIEW</Text>
            <Text style={styles.title}>이번 달 성장 리포트</Text>
          </View>
        </View>
        <View accessibilityLabel={`현재 목표 ${goalScore ?? '미설정'}`} style={styles.goalBadge}>
          <Target color={colors.textSecondary} size={15} />
          <Text style={styles.goalBadgeText}>
            {goalScore === null ? '목표 미설정' : `목표 ${goalScore}점`}
          </Text>
        </View>
      </View>

      <View style={styles.hero}>
        <Text style={styles.averageLabel}>메이크업 평균 점수</Text>
        <View style={styles.averageRow}>
          <Text style={styles.averageValue}>{averageScore ?? '—'}</Text>
          {averageScore !== null ? <Text style={styles.averageUnit}>점</Text> : null}
        </View>
        <Text accessibilityLiveRegion="polite" style={styles.insight}>{insight}</Text>
      </View>

      {goalScore !== null ? (
        <View accessibilityLabel={`목표 진행률 ${progress}퍼센트`} style={styles.progressSection}>
          <View style={styles.progressTrack}>
            <View style={[
              styles.progressFill,
              hasReachedGoal ? styles.progressReached : null,
              {width: `${progress}%`},
            ]} />
          </View>
          <View style={styles.progressMeta}>
            <Text style={styles.progressText}>
              {averageScore === null ? '아직 평균 없음' : `평균 ${averageScore}점`}
            </Text>
            <Text style={styles.progressGoal}>목표 {goalScore}점</Text>
          </View>
        </View>
      ) : null}

      <View style={styles.metricRow}>
        {metrics.map((item, index) => {
          const MetricIcon = item.icon;
          return (
            <View key={item.label} style={styles.metricWrapper}>
              <View
                accessibilityLabel={`${item.label} ${item.value}`}
                style={styles.metricItem}>
                <View style={styles.metricIcon}>
                  <MetricIcon color={colors.textSecondary} size={18} />
                </View>
                <View style={styles.metricText}>
                  <Text style={styles.metricLabel}>{item.label}</Text>
                  <Text style={styles.metricValue}>{item.value}</Text>
                </View>
              </View>
              {index < metrics.length - 1 ? <View style={styles.metricDivider} /> : null}
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  averageLabel: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
  averageRow: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    gap: spacing.xs,
  },
  averageUnit: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.lg,
    lineHeight: typography.lineHeight.lg,
    paddingBottom: 7,
  },
  averageValue: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: 52,
    lineHeight: 60,
  },
  container: {
    ...shadows.soft,
    backgroundColor: colors.white,
    borderColor: 'rgba(17, 17, 17, 0.08)',
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.lg,
    padding: spacing.xl,
  },
  eyebrow: {
    color: colors.textTertiary,
    fontFamily: typography.fontFamily.semibold,
    fontSize: 9,
    letterSpacing: 1,
    lineHeight: 12,
  },
  goalBadge: {
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    borderColor: 'rgba(17, 17, 17, 0.07)',
    borderRadius: radius.pill,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
  },
  goalBadgeText: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'space-between',
  },
  hero: {
    gap: spacing.xs,
  },
  insight: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
  metricDivider: {
    backgroundColor: colors.divider,
    height: 34,
    width: 1,
  },
  metricIcon: {
    alignItems: 'center',
    backgroundColor: colors.white,
    borderRadius: radius.pill,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  metricItem: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.md,
  },
  metricLabel: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
  },
  metricRow: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
    flexDirection: 'row',
    overflow: 'hidden',
  },
  metricText: {
    flex: 1,
    gap: 1,
  },
  metricValue: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.md,
    lineHeight: typography.lineHeight.md,
  },
  metricWrapper: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
  },
  progressFill: {
    backgroundColor: colors.textPrimary,
    borderRadius: radius.pill,
    height: '100%',
  },
  progressGoal: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
  },
  progressMeta: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  progressReached: {
    backgroundColor: colors.successMuted,
  },
  progressSection: {
    gap: spacing.sm,
  },
  progressText: {
    color: colors.textTertiary,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
  },
  progressTrack: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.pill,
    height: 8,
    overflow: 'hidden',
  },
  title: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.md,
    lineHeight: typography.lineHeight.md,
  },
  titleGroup: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: spacing.sm,
  },
  titleIcon: {
    alignItems: 'center',
    backgroundColor: colors.textPrimary,
    borderRadius: radius.md,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
});
