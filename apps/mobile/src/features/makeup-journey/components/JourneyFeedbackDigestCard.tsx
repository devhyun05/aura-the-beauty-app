import {Pressable, StyleSheet} from 'react-native';
import {ArrowRight} from 'lucide-react-native';
import {Text, View} from 'tamagui';

import {colors, radius, shadows, spacing, typography} from '../../../shared/theme';
import type {MakeupJourneyFeedbackDigest, MakeupJourneyStatus} from '../types';
import {getJourneyDigestContent, getJourneyStatusLabel} from '../utils/presentation';
import {
  JourneyCheckIcon,
  JourneyImprovementIcon,
  JourneySparkleIcon,
  JourneyTargetIcon,
  JourneyTipIcon,
} from './JourneyVisualIcons';

export const JOURNEY_DIGEST_SUPPORTS_UNBOUNDED_TEXT = true;

const JOURNEY_IMPROVEMENT_BLUE = '#5B78A6';
const JOURNEY_BLUE_TINT = 'rgba(91, 120, 166, 0.10)';
const JOURNEY_RED_TINT = 'rgba(255, 90, 77, 0.10)';

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
  const iconColor = isStrength ? colors.danger : JOURNEY_IMPROVEMENT_BLUE;
  const visibleCount = Math.max(count, items.length);

  if (visibleCount <= 0) {
    return null;
  }

  return (
    <View style={[
      styles.listSection,
      isStrength ? styles.strengthSection : styles.improvementSection,
    ]}>
      <View style={styles.listTitleRow}>
        {isStrength
          ? <JourneyCheckIcon color={iconColor} size={22} />
          : <JourneyImprovementIcon color={iconColor} size={22} />}
        <Text style={styles.listTitle}>{title} {visibleCount}개</Text>
      </View>
      <View style={styles.listItems}>
        {items.map((item, index) => (
          <View key={`${kind}-${index}-${item}`} style={styles.listItemRow}>
            <View style={[styles.bullet, {backgroundColor: iconColor}]} />
            <Text style={styles.listItem}>{item}</Text>
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
  const feedbackAccent = !hasGoal
    ? colors.textSecondary
    : status === 'success'
      ? colors.danger
      : JOURNEY_IMPROVEMENT_BLUE;
  const feedbackAccentTint = !hasGoal
    ? colors.surfaceMuted
    : status === 'success'
      ? JOURNEY_RED_TINT
      : JOURNEY_BLUE_TINT;

  return (
    <View accessibilityLabel="현재 사진의 AI 피드백 요약" style={styles.section}>
      <View style={styles.sectionHeading}>
        <View style={styles.sectionTitleRow}>
          <JourneySparkleIcon color={feedbackAccent} size={25} />
          <Text accessibilityRole="header" style={styles.sectionTitle}>AI 피드백 요약</Text>
        </View>
        <Text style={styles.sectionDescription}>
          현재 선택한 사진의 실제 분석 결과를 정리했어요.
        </Text>
      </View>

      <View style={styles.heroCard}>
        <View style={[styles.heroIcon, {backgroundColor: feedbackAccentTint}]}>
          <JourneySparkleIcon color={feedbackAccent} size={38} />
        </View>
        <View style={styles.heroContent}>
          <View style={styles.scoreRow}>
            <Text style={styles.score}>{score}</Text>
            <Text style={styles.scoreUnit}>점</Text>
            <View style={[
              styles.statusBadge,
              hasGoal && status === 'success' ? styles.successBadge : styles.neutralBadge,
            ]}>
              <JourneyTargetIcon color={feedbackAccent} size={17} />
              <Text style={[
                styles.statusText,
                hasGoal && status === 'success' ? styles.successText : styles.neutralText,
              ]}>
                {hasGoal
                  ? `${getJourneyStatusLabel(status)} · 목표 ${goalScore}점`
                  : '목표 미설정'}
              </Text>
            </View>
          </View>
          {content.headline ? <Text style={styles.headline}>{content.headline}</Text> : null}
        </View>
      </View>

      <View style={styles.lists}>
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
          <View style={styles.nextActionIcon}>
            <JourneyTipIcon color={colors.danger} size={24} />
          </View>
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
        <ArrowRight color={colors.white} size={20} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bullet: {
    borderRadius: radius.pill,
    height: 6,
    marginTop: 8,
    width: 6,
  },
  headline: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
  heroCard: {
    ...shadows.soft,
    alignItems: 'center',
    backgroundColor: colors.white,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.lg,
    padding: spacing.lg,
  },
  heroContent: {
    flex: 1,
    gap: spacing.sm,
    minWidth: 0,
  },
  heroIcon: {
    alignItems: 'center',
    borderRadius: radius.pill,
    height: 72,
    justifyContent: 'center',
    width: 72,
  },
  improvementSection: {
    backgroundColor: JOURNEY_BLUE_TINT,
    borderColor: 'rgba(91, 120, 166, 0.22)',
  },
  listItem: {
    color: colors.textSecondary,
    flex: 1,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
  },
  listItemRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  listItems: {
    gap: spacing.sm,
  },
  lists: {
    alignItems: 'stretch',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  listSection: {
    borderRadius: radius.lg,
    borderWidth: 1,
    flex: 1,
    gap: spacing.md,
    minWidth: 0,
    padding: spacing.md,
  },
  listTitle: {
    color: colors.textPrimary,
    flexShrink: 1,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
  listTitleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  neutralBadge: {
    backgroundColor: colors.surfaceMuted,
  },
  neutralText: {
    color: colors.textSecondary,
  },
  nextAction: {
    ...shadows.soft,
    alignItems: 'center',
    backgroundColor: colors.white,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.md,
  },
  nextActionContent: {
    flex: 1,
    gap: 2,
  },
  nextActionIcon: {
    alignItems: 'center',
    backgroundColor: JOURNEY_RED_TINT,
    borderRadius: radius.pill,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  nextActionLabel: {
    color: colors.danger,
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
    opacity: 0.72,
  },
  reportButton: {
    alignItems: 'center',
    alignSelf: 'stretch',
    backgroundColor: colors.black,
    borderRadius: radius.pill,
    flexDirection: 'row',
    justifyContent: 'center',
    minHeight: 54,
    paddingHorizontal: spacing.lg,
  },
  reportButtonText: {
    color: colors.white,
    flex: 1,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
    textAlign: 'center',
  },
  score: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: 44,
    lineHeight: 50,
  },
  scoreRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  scoreUnit: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.md,
    lineHeight: typography.lineHeight.md,
    marginRight: spacing.xs,
    paddingTop: 15,
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
    fontSize: typography.fontSize.xl,
    lineHeight: typography.lineHeight.xl,
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
    paddingVertical: spacing.xs,
  },
  statusText: {
    fontFamily: typography.fontFamily.semibold,
    fontSize: 10,
    lineHeight: 13,
  },
  strengthSection: {
    backgroundColor: JOURNEY_RED_TINT,
    borderColor: 'rgba(255, 90, 77, 0.20)',
  },
  successBadge: {
    backgroundColor: JOURNEY_RED_TINT,
  },
  successText: {
    color: colors.danger,
  },
});
