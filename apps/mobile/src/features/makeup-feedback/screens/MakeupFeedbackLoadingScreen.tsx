import React, {useEffect, useMemo, useState} from 'react';
import {Image, StyleSheet} from 'react-native';
import {CheckCircle2, Circle} from 'lucide-react-native';
import Svg, {Circle as SvgCircle} from 'react-native-svg';
import {Text, View, XStack, YStack} from 'tamagui';

import {colors, iconSize, radius, shadows, spacing, typography} from '../../../shared/theme';
import {AppScreen} from '../../../shared/ui';
import {
  MAKEUP_FEEDBACK_LOADING_TOTAL_MS,
  getMakeupFeedbackProgressState,
  makeupFeedbackLoadingPreviewSource,
  makeupFeedbackLoadingSteps,
  makeupFeedbackLoadingTip,
} from '../services/makeupFeedbackLoadingService';
import {analyzeMakeupForFeedback} from '../services/makeupFeedbackService';
import type {MakeupFeedbackPhotoSelection, MakeupFeedbackResult} from '../types';

const PROGRESS_TICK_MS = 320;
const RING_SIZE = 132;
const RING_STROKE = 8;
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

type MakeupFeedbackLoadingScreenProps = {
  headerTitle?: string;
  selection: MakeupFeedbackPhotoSelection;
  onBack?: () => void;
  onComplete: (result: MakeupFeedbackResult) => void;
};

export function resolveMakeupFeedbackLoadingPreviewSource(
  selection: MakeupFeedbackPhotoSelection,
) {
  return selection.imageUri ? {uri: selection.imageUri} : makeupFeedbackLoadingPreviewSource;
}

function getSelectionTitle(selection: MakeupFeedbackPhotoSelection) {
  if (selection.photoTitle?.trim()) {
    return selection.photoTitle.trim();
  }

  return selection.photoSource === 'gallery' ? '앨범 사진' : '촬영 사진';
}

export function MakeupFeedbackLoadingScreen({
  selection,
  onComplete,
}: MakeupFeedbackLoadingScreenProps) {
  const [elapsedMs, setElapsedMs] = useState(0);
  const [analysisResult, setAnalysisResult] = useState<MakeupFeedbackResult | null>(null);
  const progressState = useMemo(
    () => getMakeupFeedbackProgressState(elapsedMs),
    [elapsedMs],
  );
  const displayedProgressState = useMemo(() => {
    if (analysisResult) {
      return {
        ...progressState,
        activeStep: makeupFeedbackLoadingSteps[makeupFeedbackLoadingSteps.length - 1],
        progress: 1,
        progressLabel: '100%',
        isComplete: true,
      };
    }

    if (progressState.progress < 0.95) {
      return progressState;
    }

    return {
      ...progressState,
      progress: 0.95,
      progressLabel: '95%',
      isComplete: false,
    };
  }, [analysisResult, progressState]);
  const activeStepIndex = makeupFeedbackLoadingSteps.findIndex(
    step => step.id === displayedProgressState.activeStep.id,
  );

  useEffect(() => {
    const intervalId = setInterval(() => {
      setElapsedMs(currentElapsedMs =>
        Math.min(currentElapsedMs + PROGRESS_TICK_MS, MAKEUP_FEEDBACK_LOADING_TOTAL_MS),
      );
    }, PROGRESS_TICK_MS);

    return () => {
      clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    setElapsedMs(0);
    setAnalysisResult(null);

    analyzeMakeupForFeedback(selection).then((result) => {
      if (isMounted) {
        setAnalysisResult(result);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [selection]);

  useEffect(() => {
    if (!analysisResult || !displayedProgressState.isComplete) {
      return;
    }

    const timeoutId = setTimeout(() => {
      onComplete(analysisResult);
    }, 420);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [analysisResult, displayedProgressState.isComplete, onComplete]);

  return (
    <AppScreen
      bottomPadding={0}
      contentGap={0}
      horizontalPadding={0}
      scroll={false}
      topPadding="none">
      <YStack style={styles.content}>
        <YStack style={styles.heroCopy}>
          <Text style={styles.heroTitle}>AI가 피드백을 준비하고 있어요</Text>
        </YStack>

        <YStack style={styles.analysisCard}>
          <View style={styles.previewFrame}>
            <Image
              resizeMode="cover"
              source={resolveMakeupFeedbackLoadingPreviewSource(selection)}
              style={styles.previewImage}
              testID="makeup-feedback-loading-preview-image"
            />
            <View style={styles.previewDim} />
            <XStack style={styles.previewBadge}>
              <View style={styles.liveDot} />
              <Text style={styles.previewBadgeText}>분석 중</Text>
            </XStack>
            <YStack style={styles.previewTitleBlock}>
              <Text style={styles.previewLabel}>AI FEEDBACK</Text>
              <Text numberOfLines={1} style={styles.previewTitle}>
                {getSelectionTitle(selection)}
              </Text>
            </YStack>
          </View>

          <XStack style={styles.progressBlock}>
            <ProgressRing
              label={displayedProgressState.progressLabel}
              progress={displayedProgressState.progress}
            />

            <YStack style={styles.stepList}>
              {makeupFeedbackLoadingSteps.map((step, stepIndex) => {
                const isDone = displayedProgressState.isComplete || stepIndex < activeStepIndex;
                const isActive =
                  stepIndex === activeStepIndex && !displayedProgressState.isComplete;

                return (
                  <XStack key={step.id} style={styles.stepRow}>
                    {isDone || isActive ? (
                      <CheckCircle2
                        color={colors.textPrimary}
                        size={iconSize.xs}
                        strokeWidth={2}
                      />
                    ) : (
                      <Circle color={colors.borderStrong} size={iconSize.xs} strokeWidth={2} />
                    )}
                    <YStack style={styles.stepCopy}>
                      <Text
                        style={[
                          styles.stepTitle,
                          isDone || isActive ? styles.stepTitleActive : undefined,
                        ]}>
                        {step.title}
                      </Text>
                      <Text style={styles.stepDescription}>
                        {step.description}
                      </Text>
                    </YStack>
                  </XStack>
                );
              })}
            </YStack>
          </XStack>
        </YStack>

        <YStack style={styles.tipCard}>
          <Text style={styles.tipLabel}>TIP</Text>
          <Text style={styles.tipText}>{makeupFeedbackLoadingTip}</Text>
        </YStack>
      </YStack>
    </AppScreen>
  );
}

type ProgressRingProps = {
  label: string;
  progress: number;
};

function ProgressRing({label, progress}: ProgressRingProps) {
  return (
    <View
      accessibilityLabel={`AI 피드백 분석 진행률 ${label}`}
      accessibilityLiveRegion="polite"
      style={styles.progressRing}>
      <Svg height={RING_SIZE} width={RING_SIZE}>
        <SvgCircle
          cx={RING_SIZE / 2}
          cy={RING_SIZE / 2}
          fill="none"
          r={RING_RADIUS}
          stroke={colors.surfaceMuted}
          strokeWidth={RING_STROKE}
        />
        <SvgCircle
          cx={RING_SIZE / 2}
          cy={RING_SIZE / 2}
          fill="none"
          r={RING_RADIUS}
          stroke={colors.black}
          strokeDasharray={`${RING_CIRCUMFERENCE} ${RING_CIRCUMFERENCE}`}
          strokeDashoffset={RING_CIRCUMFERENCE * (1 - progress)}
          strokeLinecap="round"
          strokeWidth={RING_STROKE}
          transform={`rotate(-90 ${RING_SIZE / 2} ${RING_SIZE / 2})`}
        />
      </Svg>
      <Text style={styles.progressValue}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  analysisCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.xl,
    padding: spacing.md,
    shadowColor: shadows.soft.shadowColor,
    shadowOffset: shadows.soft.shadowOffset,
    shadowOpacity: shadows.soft.shadowOpacity,
    shadowRadius: shadows.soft.shadowRadius,
  },
  content: {
    flex: 1,
    gap: spacing.xxl,
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xxl,
  },
  heroCopy: {
    alignItems: 'center',
    gap: spacing.sm,
  },
  heroTitle: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.xl,
    textAlign: 'center',
  },
  liveDot: {
    backgroundColor: colors.white,
    borderRadius: radius.pill,
    height: spacing.sm,
    width: spacing.sm,
  },
  previewBadge: {
    alignItems: 'center',
    backgroundColor: colors.glassSurface,
    borderColor: colors.white,
    borderRadius: radius.pill,
    borderWidth: 1,
    gap: spacing.xs,
    left: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    position: 'absolute',
    top: spacing.md,
  },
  previewBadgeText: {
    color: colors.white,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.xs,
  },
  previewDim: {
    backgroundColor: colors.black,
    bottom: 0,
    left: 0,
    opacity: 0.12,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  previewFrame: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.lg,
    height: 214,
    overflow: 'hidden',
    width: '100%',
  },
  previewImage: {
    height: '100%',
    width: '100%',
  },
  previewLabel: {
    color: colors.white,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 1.2,
    lineHeight: typography.lineHeight.xs,
  },
  previewTitle: {
    color: colors.white,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.lg,
    textShadowColor: 'rgba(0, 0, 0, 0.42)',
    textShadowOffset: {width: 0, height: 1},
    textShadowRadius: 5,
  },
  previewTitleBlock: {
    bottom: spacing.md,
    gap: spacing.xs,
    left: spacing.md,
    position: 'absolute',
    right: spacing.md,
  },
  progressBlock: {
    alignItems: 'flex-start',
    gap: spacing.lg,
    paddingBottom: spacing.sm,
    paddingHorizontal: spacing.sm,
  },
  progressRing: {
    alignItems: 'center',
    flexShrink: 0,
    height: RING_SIZE,
    justifyContent: 'center',
    width: RING_SIZE,
  },
  progressValue: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.xl,
    position: 'absolute',
  },
  stepCopy: {
    flex: 1,
    flexShrink: 1,
    gap: spacing.xs,
    minWidth: 0,
  },
  stepDescription: {
    color: colors.textSecondary,
    flexShrink: 1,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.regular,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.xs,
  },
  stepList: {
    flex: 1,
    flexShrink: 1,
    gap: spacing.md,
    minWidth: 0,
  },
  stepRow: {
    alignItems: 'flex-start',
    gap: spacing.sm,
    width: '100%',
  },
  stepTitle: {
    color: colors.textSecondary,
    flexShrink: 1,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.xs,
  },
  stepTitleActive: {
    color: colors.textPrimary,
  },
  tipCard: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.lg,
  },
  tipLabel: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 1.2,
    lineHeight: typography.lineHeight.xs,
  },
  tipText: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.regular,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.sm,
  },
});