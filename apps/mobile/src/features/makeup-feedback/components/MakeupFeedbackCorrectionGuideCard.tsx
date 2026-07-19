import {useEffect, useState} from 'react';
import {Pressable, StyleSheet} from 'react-native';
import {CheckCircle2, ChevronDown, ChevronUp, Target} from 'lucide-react-native';
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
  MakeupFeedbackCorrectionGuide,
  MakeupFeedbackCorrectionPoint,
} from '../types';

const CORRECTION_BLUE = '#5B78A6';

export function MakeupFeedbackPriorityCorrectionCard({
  point,
}: {
  point: MakeupFeedbackCorrectionPoint;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const guide = point.correctionGuide;
  const steps = guide?.steps ?? point.actionSteps;

  useEffect(() => setIsExpanded(false), [point.id]);

  return (
    <View style={styles.section} testID="makeup-feedback-priority-correction">
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>가장 먼저 할 것</Text>
        <View style={styles.priorityBadge}>
          <Text style={styles.priorityText}>추천 1순위</Text>
        </View>
      </View>

      <View style={styles.card}>
        <PointHeading point={point} />
        <Text style={styles.description}>{guide?.why ?? point.description}</Text>

        {guide ? (
          <>
            {steps[0] ? (
              <View style={styles.firstStep}>
                <Text style={styles.firstStepLabel}>먼저 할 일</Text>
                <Text style={styles.firstStepText}>{steps[0]}</Text>
              </View>
            ) : null}
            <Pressable
              accessibilityLabel={`전체 수정 순서와 멈춤 기준 ${isExpanded ? '접기' : '보기'}`}
              accessibilityRole="button"
              accessibilityState={{expanded: isExpanded}}
              onPress={() => setIsExpanded(current => !current)}
              style={({pressed}) => [styles.toggle, pressed ? styles.pressed : undefined]}>
              <Text style={styles.toggleText}>
                {isExpanded ? '상세 방법 접기' : '도구·사용량·전체 순서 보기'}
              </Text>
              {isExpanded ? (
                <ChevronUp color={feedbackColors.text} size={iconSize.xs} strokeWidth={2} />
              ) : (
                <ChevronDown color={feedbackColors.text} size={iconSize.xs} strokeWidth={2} />
              )}
            </Pressable>
            {isExpanded ? (
              <View style={styles.expandedGuide}>
                <GuideSpecGrid guide={guide} />
                <GuideSteps guide={guide} />
              </View>
            ) : null}
          </>
        ) : steps.length > 0 ? (
          <LegacySteps steps={steps} />
        ) : null}
      </View>
    </View>
  );
}

export function MakeupFeedbackCorrectionGuideDetails({
  guide,
}: {
  guide: MakeupFeedbackCorrectionGuide;
}) {
  return (
    <View style={styles.inlineGuide}>
      <Text style={styles.inlineTitle}>정확한 수정 방법</Text>
      <GuideSpecGrid guide={guide} />
      <GuideSteps guide={guide} />
    </View>
  );
}

function PointHeading({point}: {point: MakeupFeedbackCorrectionPoint}) {
  return (
    <View style={styles.pointHeader}>
      <View style={styles.pointIcon}>
        <Target color={colors.white} size={iconSize.sm} strokeWidth={2.2} />
      </View>
      <View style={styles.pointCopy}>
        <Text style={styles.topic}>{point.topicLabel}</Text>
        <Text style={styles.pointTitle}>{point.title}</Text>
      </View>
    </View>
  );
}

function GuideSpecGrid({guide}: {guide: MakeupFeedbackCorrectionGuide}) {
  return (
    <View style={styles.specGrid}>
      <GuideSpec label="도구" value={guide.tool} />
      <GuideSpec label="사용량" value={guide.amount} />
      <GuideSpec label="바를 위치" value={guide.targetArea} />
      <GuideSpec label="칠할 범위" value={guide.coverage} />
    </View>
  );
}

function GuideSpec({label, value}: {label: string; value: string}) {
  return (
    <View style={styles.spec}>
      <Text style={styles.specLabel}>{label}</Text>
      <Text style={styles.specValue}>{value}</Text>
    </View>
  );
}

function GuideSteps({guide}: {guide: MakeupFeedbackCorrectionGuide}) {
  return (
    <View style={styles.guideSteps}>
      <Text style={styles.stepsTitle}>수정 순서</Text>
      {guide.steps.map((step, index) => (
        <Step key={`${index}-${step}`} index={index} text={step} />
      ))}
      <View style={styles.stopBox}>
        <CheckCircle2 color={CORRECTION_BLUE} size={iconSize.xs} strokeWidth={2} />
        <View style={styles.stopCopy}>
          <Text style={styles.stopLabel}>여기서 멈추세요</Text>
          <Text style={styles.stopText}>{guide.stopCondition}</Text>
        </View>
      </View>
    </View>
  );
}

function LegacySteps({steps}: {steps: readonly string[]}) {
  return (
    <View style={styles.legacySteps}>
      <Text style={styles.stepsTitle}>추천 수정 순서</Text>
      {steps.map((step, index) => (
        <Step key={`${index}-${step}`} index={index} text={step} />
      ))}
    </View>
  );
}

function Step({index, text}: {index: number; text: string}) {
  return (
    <View style={styles.step}>
      <View style={styles.stepNumber}>
        <Text style={styles.stepNumberText}>{index + 1}</Text>
      </View>
      <Text style={styles.stepText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
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
  description: {
    color: feedbackColors.textMuted,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    lineHeight: typography.lineHeight.sm,
  },
  expandedGuide: {gap: spacing.lg},
  firstStep: {
    borderColor: colors.heart,
    borderLeftWidth: 3,
    gap: 2,
    paddingLeft: spacing.md,
  },
  firstStepLabel: {
    color: colors.heart,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.bold,
    lineHeight: typography.lineHeight.xs,
  },
  firstStepText: {
    color: feedbackColors.text,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    lineHeight: typography.lineHeight.sm,
  },
  guideSteps: {gap: spacing.md},
  inlineGuide: {
    borderTopColor: feedbackColors.borderSoft,
    borderTopWidth: 1,
    gap: spacing.md,
    marginTop: spacing.sm,
    paddingTop: spacing.md,
  },
  inlineTitle: {
    color: feedbackColors.text,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.bold,
    lineHeight: typography.lineHeight.xs,
  },
  legacySteps: {
    backgroundColor: feedbackColors.accentSoft,
    borderRadius: radius.md,
    gap: spacing.md,
    padding: spacing.md,
  },
  pointCopy: {flex: 1, gap: 2, minWidth: 0},
  pointHeader: {alignItems: 'center', flexDirection: 'row', gap: spacing.md},
  pointIcon: {
    alignItems: 'center',
    backgroundColor: colors.heart,
    borderRadius: radius.pill,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  pointTitle: {
    color: feedbackColors.text,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.bold,
    lineHeight: typography.lineHeight.md,
  },
  pressed: {opacity: 0.62},
  priorityBadge: {
    backgroundColor: colors.heart,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  priorityText: {
    color: colors.white,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.bold,
    lineHeight: typography.lineHeight.xs,
  },
  section: {gap: spacing.sm},
  sectionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    color: feedbackColors.text,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
    lineHeight: typography.lineHeight.lg,
  },
  spec: {
    backgroundColor: feedbackColors.accentSoft,
    borderRadius: radius.sm,
    flexBasis: '47%',
    flexGrow: 1,
    gap: 2,
    minHeight: 68,
    padding: spacing.md,
  },
  specGrid: {flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm},
  specLabel: {
    color: feedbackColors.textSoft,
    fontFamily: typography.fontFamily.bold,
    fontSize: 10,
    fontWeight: typography.fontWeight.bold,
    lineHeight: 14,
  },
  specValue: {
    color: feedbackColors.text,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
    lineHeight: typography.lineHeight.xs,
  },
  step: {alignItems: 'flex-start', flexDirection: 'row', gap: spacing.sm},
  stepNumber: {
    alignItems: 'center',
    backgroundColor: colors.textPrimary,
    borderRadius: radius.pill,
    height: 22,
    justifyContent: 'center',
    width: 22,
  },
  stepNumberText: {
    color: colors.white,
    fontFamily: typography.fontFamily.bold,
    fontSize: 10,
    fontWeight: typography.fontWeight.bold,
  },
  stepsTitle: {
    color: feedbackColors.text,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.bold,
    lineHeight: typography.lineHeight.xs,
  },
  stepText: {
    color: feedbackColors.text,
    flex: 1,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium,
    lineHeight: typography.lineHeight.xs,
  },
  stopBox: {
    alignItems: 'flex-start',
    backgroundColor: 'rgba(91, 120, 166, 0.10)',
    borderRadius: radius.sm,
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.md,
  },
  stopCopy: {flex: 1, gap: 2},
  stopLabel: {
    color: CORRECTION_BLUE,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.bold,
    lineHeight: typography.lineHeight.xs,
  },
  stopText: {
    color: feedbackColors.textMuted,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium,
    lineHeight: typography.lineHeight.xs,
  },
  toggle: {
    alignItems: 'center',
    borderColor: colors.borderStrong,
    borderRadius: radius.pill,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 46,
    paddingHorizontal: spacing.lg,
  },
  toggleText: {
    color: feedbackColors.text,
    flex: 1,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.bold,
    lineHeight: typography.lineHeight.xs,
  },
  topic: {
    color: feedbackColors.textSoft,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.bold,
    lineHeight: typography.lineHeight.xs,
  },
});
