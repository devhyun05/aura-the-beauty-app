import {Pressable, StyleSheet} from 'react-native';
import {
  ArrowRight,
  CheckCircle2,
  CircleAlert,
  Lightbulb,
  Sparkles,
  Target,
} from 'lucide-react-native';
import {Text, View} from 'tamagui';

import {colors, radius, spacing, typography} from '../../../shared/theme';
import type {MakeupJourneyFeedbackDigest, MakeupJourneyStatus} from '../types';
import {getJourneyDigestContent, getJourneyStatusLabel} from '../utils/presentation';

export const JOURNEY_DIGEST_SUPPORTS_UNBOUNDED_TEXT = true;

const JOURNEY_IMPROVEMENT_BLUE = '#5B78A6';
const JOURNEY_BLUE_TINT = 'rgba(91, 120, 166, 0.09)';
const JOURNEY_RED_TINT = 'rgba(255, 90, 77, 0.08)';

type JourneyFeedbackDigestCardProps = {
  digest: MakeupJourneyFeedbackDigest;
  goalScore: number | null;
  onOpenReport: (reportId: string) => void;
  score: number;
  status: MakeupJourneyStatus;
};

function DigestList({
  count,
  items,
  kind,
  title,
}: {
  count: number;
  items: string[];
  kind: 'strength' | 'improvement';
  title: string;
}) {
  const isStrength = kind === 'strength';
  const accent = isStrength ? colors.danger : JOURNEY_IMPROVEMENT_BLUE;
  const visibleCount = Math.max(count, items.length);

  if (visibleCount <= 0) {
    return null;
  }

  return (
    <View style={styles.findingGroup}>
      <View style={styles.findingHeader}>
        <View style={[
          styles.findingIcon,
          {backgroundColor: isStrength ? JOURNEY_RED_TINT : JOURNEY_BLUE_TINT},
        ]}>
          {isStrength
            ? <CheckCircle2 color={accent} size={18} strokeWidth={2} />
            : <CircleAlert color={accent} size={18} strokeWidth={2} />}
        </View>
        <Text style={styles.findingTitle}>{title}</Text>
        <Text style={[styles.findingCount, {color: accent}]}>{visibleCount}</Text>
      </View>
      <View style={styles.findingItems}>
        {items.map((item, index) => (
          <View key={`${kind}-${index}-${item}`} style={styles.findingItemRow}>
            <View style={[styles.bullet, {backgroundColor: accent}]} />
            <Text style={styles.findingItem}>{item}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

export function JourneyFeedbackDigestCard({
  digest,
  goalScore,
  onOpenReport,
  score,
  status,
}: JourneyFeedbackDigestCardProps) {
  const content = getJourneyDigestContent(digest);
  const hasGoal = goalScore !== null;
  const statusAccent = !hasGoal
    ? colors.textSecondary
    : status === 'success'
      ? colors.danger
      : JOURNEY_IMPROVEMENT_BLUE;
  const statusTint = !hasGoal
    ? colors.surfaceMuted
    : status === 'success'
      ? JOURNEY_RED_TINT
      : JOURNEY_BLUE_TINT;

  return (
    <View accessibilityLabel="현재 사진의 AI 피드백 요약" style={styles.section}>
      <View style={styles.sectionHeading}>
        <View style={styles.sectionTitleRow}>
          <Sparkles color={statusAccent} size={20} strokeWidth={1.9} />
          <Text accessibilityRole="header" style={styles.sectionTitle}>AI 피드백</Text>
        </View>
        <Text style={styles.sectionDescription}>
          현재 선택한 사진의 실제 분석 결과예요.
        </Text>
      </View>

      <View style={styles.card}>
        <View style={styles.summaryHeader}>
          <View style={styles.scoreBlock}>
            <Text style={styles.scoreLabel}>메이크업 점수</Text>
            <View style={styles.scoreRow}>
              <Text style={styles.score}>{score}</Text>
              <Text style={styles.scoreUnit}>점</Text>
            </View>
          </View>
          <View style={[styles.statusBadge, {backgroundColor: statusTint}]}>
            <Target color={statusAccent} size={16} strokeWidth={2} />
            <Text style={[styles.statusText, {color: statusAccent}]}>
              {hasGoal ? getJourneyStatusLabel(status) : '목표 미설정'}
            </Text>
          </View>
        </View>
        {hasGoal ? <Text style={styles.goalText}>목표 {goalScore}점 기준</Text> : null}
        {content.headline ? <Text style={styles.headline}>{content.headline}</Text> : null}

        <View style={styles.divider} />
        <View style={styles.findings}>
          <DigestList
            count={digest.strengthCount}
            items={content.strengths}
            kind="strength"
            title="잘한 점"
          />
          <DigestList
            count={digest.improvementCount}
            items={content.improvements}
            kind="improvement"
            title="보완할 점"
          />
        </View>

        {content.nextAction ? (
          <View style={styles.nextAction}>
            <Lightbulb color={colors.textPrimary} size={19} strokeWidth={1.9} />
            <View style={styles.nextActionContent}>
              <Text style={styles.nextActionLabel}>먼저 해볼 것</Text>
              <Text style={styles.nextActionText}>{content.nextAction}</Text>
            </View>
          </View>
        ) : null}

        <Pressable
          accessibilityLabel="전체 AI 보고서 보기"
          accessibilityRole="button"
          onPress={() => onOpenReport(digest.reportId)}
          style={({pressed}) => [styles.reportButton, pressed ? styles.pressed : null]}>
          <Text style={styles.reportButtonText}>전체 AI 보고서 보기</Text>
          <ArrowRight color={colors.white} size={18} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bullet: {
    borderRadius: radius.pill,
    height: 5,
    marginTop: 8,
    width: 5,
  },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.lg,
    shadowColor: colors.black,
    shadowOffset: {width: 0, height: 5},
    shadowOpacity: 0.025,
    shadowRadius: 10,
  },
  divider: {
    backgroundColor: colors.divider,
    height: 1,
  },
  findingCount: {
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
  },
  findingGroup: {
    gap: spacing.sm,
  },
  findingHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  findingIcon: {
    alignItems: 'center',
    borderRadius: radius.sm,
    height: 30,
    justifyContent: 'center',
    width: 30,
  },
  findingItem: {
    color: colors.textSecondary,
    flex: 1,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
  findingItemRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: spacing.sm,
    paddingLeft: 38,
  },
  findingItems: {
    gap: spacing.sm,
  },
  findingTitle: {
    color: colors.textPrimary,
    flex: 1,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
  findings: {
    gap: spacing.lg,
  },
  goalText: {
    color: colors.textTertiary,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
    marginTop: -spacing.sm,
  },
  headline: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.md,
    lineHeight: typography.lineHeight.md,
  },
  nextAction: {
    alignItems: 'flex-start',
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.md,
  },
  nextActionContent: {
    flex: 1,
    gap: 2,
  },
  nextActionLabel: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
  },
  nextActionText: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
  pressed: {
    opacity: 0.7,
  },
  reportButton: {
    alignItems: 'center',
    backgroundColor: colors.black,
    borderRadius: radius.pill,
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'center',
    minHeight: 50,
    paddingHorizontal: spacing.lg,
  },
  reportButtonText: {
    color: colors.white,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
  score: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: 42,
    lineHeight: 47,
  },
  scoreBlock: {
    flex: 1,
    gap: 1,
  },
  scoreLabel: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
  },
  scoreRow: {
    alignItems: 'baseline',
    flexDirection: 'row',
    gap: spacing.xs,
  },
  scoreUnit: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.md,
    lineHeight: typography.lineHeight.md,
  },
  section: {
    gap: spacing.md,
  },
  sectionDescription: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
  sectionHeading: {
    gap: spacing.xs,
    paddingHorizontal: spacing.xs,
  },
  sectionTitle: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.lg,
    lineHeight: typography.lineHeight.lg,
  },
  sectionTitleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  statusBadge: {
    alignItems: 'center',
    borderRadius: radius.pill,
    flexDirection: 'row',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  statusText: {
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
  },
  summaryHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
  },
});
