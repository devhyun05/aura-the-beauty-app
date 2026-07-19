import {useEffect, useState} from 'react';
import type {DimensionValue} from 'react-native';
import {Pressable, StyleSheet} from 'react-native';
import {ChevronDown, ChevronUp} from 'lucide-react-native';
import {Text, View} from 'tamagui';

import {
  colors,
  feedbackColors,
  feedbackRadius,
  iconSize,
  radius,
  shadows,
  spacing,
  typography,
} from '../../../shared/theme';
import type {
  MakeupFeedbackEvaluation,
  MakeupFeedbackScoreBreakdown,
  MakeupFeedbackScoreAxisId,
} from '../types';

export function MakeupFeedbackScoreBreakdownCard({
  breakdown,
  evaluations,
}: {
  breakdown: MakeupFeedbackScoreBreakdown;
  evaluations: readonly MakeupFeedbackEvaluation[];
}) {
  const priorityAxis = breakdown.axes.reduce((lowest, axis) =>
    axis.score / axis.maxScore < lowest.score / lowest.maxScore ? axis : lowest,
  breakdown.axes[0]);
  const [activeAxisId, setActiveAxisId] = useState<MakeupFeedbackScoreAxisId | null>(
    null,
  );
  const [isFormulaVisible, setIsFormulaVisible] = useState(false);
  const evidenceById = new Map(
    evaluations.flatMap(evaluation =>
      (evaluation.observations ?? []).map(observation => [
        observation.id,
        {claim: observation.claim, topicLabel: evaluation.topicLabel},
      ] as const),
    ),
  );

  useEffect(() => {
    setActiveAxisId(null);
    setIsFormulaVisible(false);
  }, [breakdown.formula, priorityAxis.id]);

  return (
    <View style={styles.card} testID="makeup-feedback-score-breakdown">
      <View
        accessibilityLabel="점수 구성, 네 가지 기준의 받은 점수와 이유"
        accessible
        style={styles.header}>
        <View style={styles.headerCopy}>
          <Text style={styles.title}>점수 구성</Text>
          <Text style={styles.subtitle}>항목을 누르면 평가 이유와 사진에서 확인한 사실을 볼 수 있어요.</Text>
        </View>
        <View style={styles.totalBadge}>
          <Text style={styles.totalBadgeText}>{breakdown.maxScore}점 만점</Text>
        </View>
      </View>

      <View style={styles.axisList}>
        {breakdown.axes.map(axis => {
          const percentage = Math.round((axis.score / axis.maxScore) * 100);
          const width = `${Math.max(0, Math.min(100, percentage))}%` as DimensionValue;
          const isActive = axis.id === activeAxisId;
          const evidence = axis.evidenceIds.flatMap(evidenceId => {
            const item = evidenceById.get(evidenceId);
            return item ? [{...item, id: evidenceId}] : [];
          });

          return (
            <View key={axis.id} style={styles.axis}>
              <Pressable
                accessibilityLabel={`${axis.label} 점수 근거 ${isActive ? '접기' : '보기'}`}
                accessibilityRole="button"
                accessibilityState={{expanded: isActive}}
                onPress={() =>
                  setActiveAxisId(current => current === axis.id ? null : axis.id)
                }
                style={({pressed}) => [
                  styles.axisToggle,
                  pressed ? styles.togglePressed : undefined,
                ]}>
                <View style={styles.axisHeader}>
                  <View style={styles.axisLabelRow}>
                    <Text style={styles.axisLabel}>{axis.label}</Text>
                    {axis.id === priorityAxis.id ? (
                      <View style={styles.priorityBadge}>
                        <Text style={styles.priorityBadgeText}>우선 확인</Text>
                      </View>
                    ) : null}
                  </View>
                  <Text style={styles.axisScore}>
                    {axis.score}
                    <Text style={styles.axisMax}>/{axis.maxScore}</Text>
                  </Text>
                  {isActive ? (
                    <ChevronUp color={feedbackColors.textMuted} size={iconSize.xs} strokeWidth={2} />
                  ) : (
                    <ChevronDown color={feedbackColors.textMuted} size={iconSize.xs} strokeWidth={2} />
                  )}
                </View>
                <View
                  accessibilityLabel={`${axis.label} ${axis.score}점, ${axis.maxScore}점 만점`}
                  accessibilityRole="progressbar"
                  accessibilityValue={{max: axis.maxScore, min: 0, now: axis.score}}
                  style={styles.track}>
                  <View style={[styles.fill, {width}]} />
                </View>
              </Pressable>
              {isActive ? (
                <View style={styles.evidencePanel}>
                  <Text style={styles.evidenceLabel}>이 점수가 나온 이유</Text>
                  <Text style={styles.axisReason}>{axis.reason}</Text>
                  {evidence.length > 0 ? (
                    <View style={styles.evidenceList}>
                      <Text style={styles.evidenceLabel}>사진에서 확인한 사실</Text>
                      {evidence.map(item => (
                        <View key={item.id} style={styles.evidenceRow}>
                          <View style={styles.evidenceDot} />
                          <Text style={styles.evidenceText}>
                            <Text style={styles.evidenceTopic}>{item.topicLabel} · </Text>
                            {item.claim}
                          </Text>
                        </View>
                      ))}
                    </View>
                  ) : null}
                </View>
              ) : null}
            </View>
          );
        })}
      </View>

      <Pressable
        accessibilityLabel={`점수 계산 방식 ${isFormulaVisible ? '접기' : '보기'}`}
        accessibilityRole="button"
        accessibilityState={{expanded: isFormulaVisible}}
        onPress={() => setIsFormulaVisible(current => !current)}
        style={({pressed}) => [styles.toggle, pressed ? styles.togglePressed : undefined]}>
        <Text style={styles.toggleText}>
          {isFormulaVisible ? '계산 방식 접기' : '계산 방식 보기'}
        </Text>
        {isFormulaVisible ? (
          <ChevronUp color={feedbackColors.textMuted} size={iconSize.xs} strokeWidth={2} />
        ) : (
          <ChevronDown color={feedbackColors.textMuted} size={iconSize.xs} strokeWidth={2} />
        )}
      </Pressable>

      {isFormulaVisible ? (
        <View style={styles.formulaBox}>
          <Text style={styles.formulaLabel}>점수 계산</Text>
          <Text style={styles.formula}>{breakdown.formula}</Text>
        </View>
      ) : null}

      <Text style={styles.standardNote}>
        하나의 사진 관찰이 관련된 여러 기준에 반영될 수 있어요. 얼굴 생김새는 평가하지 않아요.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  axis: {
    borderColor: feedbackColors.borderSoft,
    borderRadius: radius.md,
    borderWidth: 1,
    overflow: 'hidden',
  },
  axisHeader: {
    alignItems: 'baseline',
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'space-between',
  },
  axisLabel: {
    color: feedbackColors.text,
    flex: 1,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    lineHeight: typography.lineHeight.sm,
  },
  axisLabelRow: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: spacing.xs,
    minWidth: 0,
  },
  axisList: {
    gap: spacing.lg,
  },
  axisMax: {
    color: feedbackColors.textSoft,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
  },
  axisReason: {
    color: feedbackColors.textMuted,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium,
    lineHeight: typography.lineHeight.xs,
  },
  axisScore: {
    color: feedbackColors.text,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
    lineHeight: typography.lineHeight.sm,
  },
  axisToggle: {
    gap: spacing.sm,
    padding: spacing.md,
  },
  card: {
    backgroundColor: feedbackColors.surface,
    borderColor: feedbackColors.borderSoft,
    borderRadius: feedbackRadius.card,
    borderWidth: 1,
    gap: spacing.lg,
    padding: spacing.lg,
    shadowColor: feedbackColors.shadow,
    shadowOffset: shadows.soft.shadowOffset,
    shadowOpacity: shadows.soft.shadowOpacity,
    shadowRadius: shadows.soft.shadowRadius,
  },
  fill: {
    backgroundColor: colors.heart,
    borderRadius: radius.pill,
    height: '100%',
  },
  evidenceDot: {
    backgroundColor: colors.heart,
    borderRadius: radius.pill,
    height: 5,
    marginTop: 6,
    width: 5,
  },
  evidenceLabel: {
    color: feedbackColors.textSoft,
    fontFamily: typography.fontFamily.bold,
    fontSize: 10,
    fontWeight: typography.fontWeight.bold,
    lineHeight: 14,
  },
  evidenceList: {gap: spacing.sm},
  evidencePanel: {
    backgroundColor: feedbackColors.accentSoft,
    borderTopColor: feedbackColors.borderSoft,
    borderTopWidth: 1,
    gap: spacing.sm,
    padding: spacing.md,
  },
  evidenceRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  evidenceText: {
    color: feedbackColors.textMuted,
    flex: 1,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium,
    lineHeight: typography.lineHeight.xs,
  },
  evidenceTopic: {
    color: feedbackColors.text,
    fontFamily: typography.fontFamily.bold,
    fontWeight: typography.fontWeight.bold,
  },
  formula: {
    color: colors.white,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
    lineHeight: typography.lineHeight.sm,
  },
  formulaBox: {
    backgroundColor: colors.textPrimary,
    borderRadius: radius.md,
    gap: spacing.xs,
    padding: spacing.md,
  },
  formulaLabel: {
    color: 'rgba(255, 255, 255, 0.58)',
    fontFamily: typography.fontFamily.semibold,
    fontSize: 10,
    fontWeight: typography.fontWeight.semibold,
    lineHeight: 14,
  },
  header: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'space-between',
  },
  headerCopy: {flex: 1, gap: 2, minWidth: 0},
  priorityBadge: {
    backgroundColor: feedbackColors.accentSoft,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
  },
  priorityBadgeText: {
    color: colors.heart,
    fontFamily: typography.fontFamily.bold,
    fontSize: 9,
    fontWeight: typography.fontWeight.bold,
    lineHeight: 12,
  },
  standardNote: {
    color: feedbackColors.textSoft,
    fontFamily: typography.fontFamily.medium,
    fontSize: 10,
    fontWeight: typography.fontWeight.medium,
    lineHeight: 14,
    textAlign: 'center',
  },
  subtitle: {
    color: feedbackColors.textMuted,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium,
    lineHeight: typography.lineHeight.xs,
  },
  title: {
    color: feedbackColors.text,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
    lineHeight: typography.lineHeight.lg,
  },
  totalBadge: {
    backgroundColor: feedbackColors.accentSoft,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  totalBadgeText: {
    color: feedbackColors.text,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.bold,
    lineHeight: typography.lineHeight.xs,
  },
  toggle: {
    alignItems: 'center',
    borderTopColor: feedbackColors.borderSoft,
    borderTopWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 42,
    paddingTop: spacing.sm,
  },
  togglePressed: {opacity: 0.58},
  toggleText: {
    color: feedbackColors.textMuted,
    flex: 1,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
    lineHeight: typography.lineHeight.xs,
  },
  track: {
    backgroundColor: feedbackColors.accentSoft,
    borderRadius: radius.pill,
    height: 6,
    overflow: 'hidden',
    width: '100%',
  },
});
