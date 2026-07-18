import {Pressable, StyleSheet} from 'react-native';
import {ArrowRight, CheckCircle2, CircleAlert, Sparkles} from 'lucide-react-native';
import {Text, View} from 'tamagui';

import {colors, radius, shadows, spacing, typography} from '../../../shared/theme';
import type {MakeupJourneyFeedbackDigest, MakeupJourneyStatus} from '../types';
import {getJourneyDigestContent, getJourneyStatusLabel} from '../utils/presentation';

export const JOURNEY_DIGEST_SUPPORTS_UNBOUNDED_TEXT = true;

type JourneyFeedbackDigestCardProps = {
  digest: MakeupJourneyFeedbackDigest;
  goalScore: number | null;
  latestScore: number;
  onOpenReport: (reportId: string) => void;
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
  const Icon = kind === 'strength' ? CheckCircle2 : CircleAlert;
  const iconColor = kind === 'strength' ? colors.successMuted : colors.danger;

  if (count <= 0 && items.length === 0) {
    return null;
  }

  return (
    <View style={styles.listSection}>
      <View style={styles.listTitleRow}>
        <Icon color={iconColor} size={17} strokeWidth={2} />
        <Text style={styles.listTitle}>{title} {count}개</Text>
      </View>
      {items.map((item, index) => (
        <Text key={`${kind}-${index}-${item}`} style={styles.listItem}>• {item}</Text>
      ))}
    </View>
  );
}

export function JourneyFeedbackDigestCard({
  digest,
  goalScore,
  latestScore,
  onOpenReport,
  status,
}: JourneyFeedbackDigestCardProps) {
  const content = getJourneyDigestContent(digest);
  const hasGoal = goalScore !== null;

  return (
    <View accessibilityLabel="오늘의 한눈 요약" style={styles.card}>
      <View style={styles.headingRow}>
        <View style={styles.iconCircle}>
          <Sparkles color={colors.textPrimary} size={20} strokeWidth={1.9} />
        </View>
        <View style={styles.headingText}>
          <Text style={styles.eyebrow}>최신 AI 피드백</Text>
          <Text style={styles.title}>오늘의 한눈 요약</Text>
        </View>
      </View>

      <View style={styles.scoreRow}>
        <Text style={styles.score}>{latestScore}점</Text>
        <View style={[
          styles.statusBadge,
          !hasGoal
            ? styles.neutralBadge
            : status === 'success'
              ? styles.successBadge
              : styles.failureBadge,
        ]}>
          <Text style={[
            styles.statusText,
            !hasGoal
              ? styles.neutralText
              : status === 'success'
                ? styles.successText
                : styles.failureText,
          ]}>
            {hasGoal
              ? `${getJourneyStatusLabel(status)} · 목표 ${goalScore}점`
              : '목표 미설정'}
          </Text>
        </View>
      </View>

      {content.headline ? <Text style={styles.headline}>{content.headline}</Text> : null}

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
          <Text style={styles.nextActionLabel}>먼저 해볼 것</Text>
          <Text style={styles.nextActionText}>{content.nextAction}</Text>
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
  );
}

const styles = StyleSheet.create({
  card: {
    ...shadows.soft,
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    gap: spacing.lg,
    padding: spacing.xl,
  },
  eyebrow: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
  },
  failureBadge: {
    backgroundColor: 'rgba(17, 17, 17, 0.07)',
    borderColor: colors.transparent,
  },
  failureText: {
    color: colors.textSecondary,
  },
  headingRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
  },
  headingText: {
    flex: 1,
    gap: 2,
  },
  headline: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.md,
    lineHeight: typography.lineHeight.md,
  },
  iconCircle: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 90, 77, 0.10)',
    borderRadius: radius.pill,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  listItem: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
    paddingLeft: spacing.xs,
  },
  lists: {
    gap: spacing.md,
  },
  listSection: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
    gap: spacing.xs,
    padding: spacing.md,
  },
  listTitle: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
  listTitleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  nextAction: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
    gap: spacing.xs,
    padding: spacing.md,
  },
  nextActionLabel: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
  },
  nextActionText: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
  neutralBadge: {
    borderColor: colors.borderStrong,
  },
  neutralText: {
    color: colors.textSecondary,
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
    minHeight: 48,
    paddingHorizontal: spacing.lg,
  },
  reportButtonText: {
    color: colors.white,
    flex: 1,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
    textAlign: 'center',
  },
  score: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xl,
    lineHeight: typography.lineHeight.xl,
  },
  scoreRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  statusBadge: {
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  statusText: {
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
  },
  successBadge: {
    backgroundColor: 'rgba(255, 90, 77, 0.10)',
    borderColor: colors.transparent,
  },
  successText: {
    color: colors.danger,
  },
  title: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.lg,
    lineHeight: typography.lineHeight.lg,
  },
});
