import {useEffect, useMemo, useRef, useState} from 'react';
import {Image, StyleSheet} from 'react-native';
import {CheckCircle2, Circle} from 'lucide-react-native';
import Svg, {Circle as SvgCircle} from 'react-native-svg';
import {Text, View, XStack, YStack} from 'tamagui';

import {colors, iconSize, radius, shadows, spacing, typography} from '../../../shared/theme';
import {AppScreen} from '../../../shared/ui';
import {getReferenceMakeupExtractionDataSync} from '../services/makeupExtractionService';
import type {MakeupExtractionProgressUpdate, ReferenceMakeupPhoto} from '../types';

type ReferenceMakeupExtractionLoadingScreenProps = {
  photo: ReferenceMakeupPhoto;
  isAnalysisReady?: boolean;
  progressUpdate?: MakeupExtractionProgressUpdate | null;
  onBack: () => void;
  onComplete: () => void;
};

const PROGRESS_TICK_MS = 320;
const TOTAL_LOADING_MS = 26000;
const RING_SIZE = 132;
const RING_STROKE = 8;
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

const progressCapByPhase: Record<MakeupExtractionProgressUpdate['phase'], number> = {
  queued: 0.08,
  uploading: 0.22,
  uploaded: 0.36,
  analyzing: 0.82,
  products: 0.96,
  complete: 1,
  fallback: 1,
};

const loadingStepDescriptions: Record<string, string> = {
  'reference-read': '업로드한 레퍼런스 사진과 이름을 확인해요.',
  'core-points': '결과서 상단에 들어갈 메이크업 핵심 3가지를 추려요.',
  'area-guides': '피부, 눈, 눈썹, 볼, 입술, 윤곽별 따라 하는 법을 정리해요.',
  'product-criteria': '부위별 추천 제품을 찾기 위한 검색 기준을 만들어요.',
  'ar-filter-ready': '이 레퍼런스 룩을 메이크업 필터로 이어볼 준비를 해요.',
};


export function ReferenceMakeupExtractionLoadingScreen({
  isAnalysisReady = true,
  progressUpdate = null,
  photo,
  onComplete,
}: ReferenceMakeupExtractionLoadingScreenProps) {
  const data = getReferenceMakeupExtractionDataSync();
  const [elapsedMs, setElapsedMs] = useState(0);
  const [displayedProgress, setDisplayedProgress] = useState(0);
  const stepCount = data.loadingSteps.length;
  const timedProgress = Math.min(1, elapsedMs / TOTAL_LOADING_MS);
  const reportedProgress = progressUpdate?.progress ?? 0;
  const progressCap = progressUpdate ? progressCapByPhase[progressUpdate.phase] : 0.95;
  const targetProgress = isAnalysisReady
    ? 1
    : Math.min(Math.max(reportedProgress, timedProgress), progressCap, 0.95);
  const targetProgressRef = useRef(targetProgress);
  const progress = displayedProgress >= 0.995 ? 1 : displayedProgress;
  const progressLabel = `${Math.round(progress * 100)}%`;
  const reportedStepIndex = progressUpdate?.activeStepId
    ? data.loadingSteps.findIndex((step) => step.id === progressUpdate.activeStepId)
    : -1;
  const activeStepIndex = useMemo(() => {
    if (progress >= 1) {
      return stepCount - 1;
    }

    if (reportedStepIndex >= 0) {
      return reportedStepIndex;
    }

    return Math.min(stepCount - 1, Math.floor(progress * stepCount));
  }, [progress, reportedStepIndex, stepCount]);
  const isComplete = progress >= 1 && isAnalysisReady;

  useEffect(() => {
    setElapsedMs(0);
    setDisplayedProgress(0);
  }, [photo.id]);

  useEffect(() => {
    const intervalId = setInterval(() => {
      setElapsedMs((currentElapsedMs) =>
        Math.min(currentElapsedMs + PROGRESS_TICK_MS, TOTAL_LOADING_MS),
      );
    }, PROGRESS_TICK_MS);

    return () => {
      clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    targetProgressRef.current = targetProgress;
  }, [targetProgress]);

  useEffect(() => {
    const intervalId = setInterval(() => {
      setDisplayedProgress((currentProgress) => {
        const nextTarget = Math.max(0, Math.min(targetProgressRef.current, 1));

        if (nextTarget <= currentProgress) {
          return currentProgress;
        }

        const remainingProgress = nextTarget - currentProgress;
        const maxStep = nextTarget >= 1 ? 0.065 : 0.028;
        const easedStep = Math.max(0.006, Math.min(maxStep, remainingProgress * 0.34));
        const nextProgress = currentProgress + Math.min(remainingProgress, easedStep);

        return nextTarget >= 1 && nextProgress >= 0.995 ? 1 : nextProgress;
      });
    }, PROGRESS_TICK_MS);

    return () => {
      clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    if (!isComplete) {
      return;
    }

    const timeoutId = setTimeout(onComplete, 520);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [isComplete, onComplete]);

  return (
    <AppScreen
      bottomPadding={0}
      contentGap={0}
      horizontalPadding={0}
      scroll={false}
      topPadding="none"
    >
      <YStack style={styles.content}>

        <YStack style={styles.analysisCard}>
          <View style={styles.previewFrame}>
            <Image
              resizeMode="cover"
              source={photo.imageSource}
              style={styles.previewImage}
              testID="reference-makeup-loading-preview-image"
            />
            <View style={styles.previewDim} />
            <XStack style={styles.previewBadge}>
              <View style={styles.liveDot} />
              <Text style={styles.previewBadgeText}>결과서 생성 중</Text>
            </XStack>
            <YStack style={styles.previewTitleBlock}>
              <Text style={styles.previewLabel}>REFERENCE</Text>
              <Text numberOfLines={1} style={styles.previewTitle}>{photo.title}</Text>
            </YStack>
          </View>

          <XStack style={styles.progressBlock}>
            <ProgressRing label={progressLabel} progress={progress} />

            <YStack style={styles.stepList}>
              {data.loadingSteps.map((step, stepIndex) => {
                const isDone = isComplete || stepIndex < activeStepIndex;
                const isActive = stepIndex === activeStepIndex && !isComplete;

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
                        numberOfLines={1}
                        style={[
                          styles.stepTitle,
                          isDone || isActive ? styles.stepTitleActive : undefined,
                        ]}>
                        {step.label}
                      </Text>
                      <Text numberOfLines={2} style={styles.stepDescription}>
                        {loadingStepDescriptions[step.id] ?? '레퍼런스 분석 결과를 정리해요.'}
                      </Text>
                    </YStack>
                  </XStack>
                );
              })}
            </YStack>
          </XStack>
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
      accessibilityLabel={`레퍼런스 분석 진행률 ${label}`}
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
    backgroundColor: colors.blackSurface,
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
    alignItems: 'center',
    gap: spacing.lg,
    paddingBottom: spacing.sm,
    paddingHorizontal: spacing.sm,
  },
  progressRing: {
    alignItems: 'center',
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
    gap: spacing.xs,
    minWidth: 0,
  },
  stepDescription: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.regular,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.xs,
  },
  stepList: {
    flex: 1,
    gap: spacing.md,
    minWidth: 0,
  },
  stepRow: {
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  stepTitle: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.xs,
  },
  stepTitleActive: {
    color: colors.textPrimary,
  },

});
