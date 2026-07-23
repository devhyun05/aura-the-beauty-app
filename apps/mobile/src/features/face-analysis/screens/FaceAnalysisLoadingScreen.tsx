import React, {useEffect, useMemo, useRef, useState} from 'react';
import {Image, Pressable, StyleSheet} from 'react-native';
import {CheckCircle2, Circle} from 'lucide-react-native';
import Svg, {Circle as SvgCircle} from 'react-native-svg';
import {Text, View, XStack, YStack} from 'tamagui';

import {colors, iconSize, radius, shadows, spacing, typography} from '../../../shared/theme';
import {AppScreen} from '../../../shared/ui';
import {
  FACE_ANALYSIS_LOADING_TOTAL_MS,
  getFaceAnalysisProgressState,
  faceAnalysisLoadingPreviewSource,
  faceAnalysisLoadingTip,
  faceAnalysisLoadingSteps,
} from '../services/faceAnalysisLoadingService';

type FaceAnalysisLoadingScreenProps = {
  analysisErrorMessage?: string | null;
  capturedPhotoUri?: string;
  headerTitle?: string;
  isAnalysisReady?: boolean;
  onBack?: () => void;
  onComplete?: () => void;
  onRetry?: () => void;
  progressStartedAtMs?: number;
};

const PROGRESS_TICK_MS = 120;
// 완료 전엔 경과 시간에 선형 비례(일정 속도)해 NEAR_DONE까지 오르고, 분석이 끝나면
// 100%까지 일정 속도로 마무리한다. 예전 0.95 하드 캡의 정체+점프를 없앤다.
const NEAR_DONE = 0.99;
const FINISH_PER_SEC = 0.18;
const FINISH_STEP = FINISH_PER_SEC * (PROGRESS_TICK_MS / 1000);
const RING_SIZE = 132;
const RING_STROKE = 8;
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

export function resolveFaceAnalysisLoadingPreviewSource(capturedPhotoUri?: string) {
  return capturedPhotoUri ? {uri: capturedPhotoUri} : faceAnalysisLoadingPreviewSource;
}

export function FaceAnalysisLoadingScreen({
  analysisErrorMessage = null,
  capturedPhotoUri,
  isAnalysisReady = true,
  onBack,
  onComplete,
  onRetry,
  progressStartedAtMs,
}: FaceAnalysisLoadingScreenProps) {
  const progressStartedAtMsRef = useRef(progressStartedAtMs ?? Date.now());
  const [elapsedMs, setElapsedMs] = useState(() =>
    Math.min(
      FACE_ANALYSIS_LOADING_TOTAL_MS,
      Math.max(0, Date.now() - progressStartedAtMsRef.current),
    ),
  );
  const [displayedProgress, setDisplayedProgress] = useState(0);
  const progressState = useMemo(
    () => getFaceAnalysisProgressState(elapsedMs),
    [elapsedMs],
  );
  // 경과 시간에 선형 비례(일정 속도)한 목표. NEAR_DONE 이내로 두고, 분석이 끝나면 100%로.
  const timedLinear = Math.min(NEAR_DONE, elapsedMs / FACE_ANALYSIS_LOADING_TOTAL_MS);
  const targetProgress = isAnalysisReady ? 1 : timedLinear;
  const targetProgressRef = useRef(targetProgress);
  const progress = displayedProgress >= 0.995 ? 1 : displayedProgress;
  const progressLabel = `${Math.round(progress * 100)}%`;
  const isComplete = progress >= 1 && isAnalysisReady;
  const activeStepIndex = isComplete
    ? faceAnalysisLoadingSteps.length - 1
    : Math.max(
        0,
        faceAnalysisLoadingSteps.findIndex(step => step.id === progressState.activeStep.id),
      );
  const hasAnalysisError = Boolean(analysisErrorMessage);

  useEffect(() => {
    const intervalId = setInterval(() => {
      setElapsedMs(
        Math.min(
          Math.max(0, Date.now() - progressStartedAtMsRef.current),
          FACE_ANALYSIS_LOADING_TOTAL_MS,
        ),
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
        const finishing = targetProgressRef.current >= 1;

        // 분석 완료: 현재 위치에서 100%까지 일정 속도로 마무리(감속·점프 없음).
        if (finishing) {
          const nextProgress = currentProgress + FINISH_STEP;
          return nextProgress >= 0.995 ? 1 : Math.min(nextProgress, 1);
        }

        // 진행 중: 시간 선형 목표(NEAR_DONE 이내)를 그대로 따라가 균일 속도 유지.
        const nextTarget = Math.min(targetProgressRef.current, NEAR_DONE);
        return Math.max(currentProgress, nextTarget);
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

    const timeoutId = setTimeout(() => {
      onComplete?.();
    }, spacing.xxl * 10);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [isComplete, onComplete]);

  return (
    <AppScreen
      bottomPadding={0}
      contentGap={0}
      horizontalPadding={0}
      topPadding="none"
    >
      <YStack style={styles.content}>
        <YStack style={styles.heroCopy}>
          <Text style={styles.heroTitle}>얼굴을 분석하고 있어요</Text>
          <Text style={styles.heroDescription}>
            사진과 측정값을 함께 확인해 얼굴형·이목구비·스타일 제안을 만들고 있어요.
          </Text>
        </YStack>

        <YStack style={styles.analysisCard}>
          <View style={styles.previewFrame}>
            <Image
              resizeMode="cover"
              source={resolveFaceAnalysisLoadingPreviewSource(capturedPhotoUri)}
              style={styles.previewImage}
              testID="face-analysis-loading-preview-image"
            />
            <View style={styles.previewDim} />
            <XStack style={styles.previewBadge}>
              <View style={styles.liveDot} />
              <Text style={styles.previewBadgeText}>
                {hasAnalysisError ? '확인 필요' : '얼굴 분석 중'}
              </Text>
            </XStack>
          </View>

          <XStack style={styles.progressBlock}>
            <ProgressRing
              label={progressLabel}
              progress={progress}
            />

            <YStack style={styles.stepList}>
              {faceAnalysisLoadingSteps.map((step, stepIndex) => {
                const isDone = isComplete || stepIndex < activeStepIndex;
                const isActive =
                  stepIndex === activeStepIndex && !isComplete;

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
                        {step.title}
                      </Text>
                      <Text numberOfLines={2} style={styles.stepDescription}>
                        {step.description}
                      </Text>
                    </YStack>
                  </XStack>
                );
              })}
            </YStack>
          </XStack>
        </YStack>

        {hasAnalysisError ? (
          <YStack style={styles.errorCard}>
            <Text style={styles.errorTitle}>얼굴 분석을 완료하지 못했어요</Text>
            <Text style={styles.errorDescription}>{analysisErrorMessage}</Text>
            <XStack style={styles.errorActionRow}>
              <Pressable
                accessibilityLabel="분석 다시 시도"
                accessibilityRole="button"
                onPress={onRetry}
                style={styles.retryButton}>
                <Text style={styles.retryButtonText}>다시 시도</Text>
              </Pressable>
              <Pressable
                accessibilityLabel="다시 촬영"
                accessibilityRole="button"
                onPress={onBack}
                style={styles.retakeButton}>
                <Text style={styles.retakeButtonText}>다시 촬영</Text>
              </Pressable>
            </XStack>
          </YStack>
        ) : (
          <YStack style={styles.tipCard}>
            <Text style={styles.tipLabel}>TIP</Text>
            <Text style={styles.tipText}>{faceAnalysisLoadingTip}</Text>
          </YStack>
        )}
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
      accessibilityLabel={`분석 진행률 ${label}`}
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
  content: {
    flexGrow: 1,
    gap: spacing.xxl,
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xxl,
  },
  errorActionRow: {
    gap: spacing.sm,
  },
  errorCard: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.lg,
  },
  errorDescription: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.regular,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.sm,
  },
  errorTitle: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.sm,
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
  heroDescription: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.regular,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.sm,
    textAlign: 'center',
  },
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
  previewDim: {
    backgroundColor: colors.blackSurface,
    bottom: 0,
    left: 0,
    opacity: 0.12,
    position: 'absolute',
    right: 0,
    top: 0,
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
  liveDot: {
    backgroundColor: colors.white,
    borderRadius: radius.pill,
    height: spacing.sm,
    width: spacing.sm,
  },
  previewBadgeText: {
    color: colors.white,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.xs,
  },
  progressBlock: {
    alignItems: 'center',
    gap: spacing.lg,
    paddingHorizontal: spacing.sm,
    paddingBottom: spacing.sm,
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
  retryButton: {
    alignItems: 'center',
    backgroundColor: colors.blackSurface,
    borderRadius: radius.pill,
    flex: 1,
    justifyContent: 'center',
    minHeight: 42,
    paddingHorizontal: spacing.md,
  },
  retryButtonText: {
    color: colors.white,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.sm,
  },
  retakeButton: {
    alignItems: 'center',
    borderColor: colors.borderStrong,
    borderRadius: radius.pill,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'center',
    minHeight: 42,
    paddingHorizontal: spacing.md,
  },
  retakeButtonText: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.sm,
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
  stepCopy: {
    flex: 1,
    gap: spacing.xs,
    minWidth: 0,
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
  stepDescription: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.regular,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.xs,
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
