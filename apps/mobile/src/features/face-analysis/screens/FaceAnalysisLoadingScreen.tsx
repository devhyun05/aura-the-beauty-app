import React, {useEffect, useMemo, useState} from 'react';
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
};

const PROGRESS_TICK_MS = 320;
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
}: FaceAnalysisLoadingScreenProps) {
  const [elapsedMs, setElapsedMs] = useState(0);
  const progressState = useMemo(
    () => getFaceAnalysisProgressState(elapsedMs),
    [elapsedMs],
  );
  const displayedProgressState = useMemo(() => {
    if (isAnalysisReady) {
      return {
        ...progressState,
        activeStep: faceAnalysisLoadingSteps[faceAnalysisLoadingSteps.length - 1],
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
  }, [isAnalysisReady, progressState]);
  const activeStepIndex = faceAnalysisLoadingSteps.findIndex(
    step => step.id === displayedProgressState.activeStep.id,
  );
  const hasAnalysisError = Boolean(analysisErrorMessage);

  useEffect(() => {
    const intervalId = setInterval(() => {
      setElapsedMs(currentElapsedMs =>
        Math.min(currentElapsedMs + PROGRESS_TICK_MS, FACE_ANALYSIS_LOADING_TOTAL_MS),
      );
    }, PROGRESS_TICK_MS);

    return () => {
      clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    if (!displayedProgressState.isComplete) {
      return;
    }

    const timeoutId = setTimeout(() => {
      onComplete?.();
    }, spacing.xxl * 10);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [displayedProgressState.isComplete, onComplete]);

  return (
    <AppScreen
      bottomPadding={0}
      contentGap={0}
      horizontalPadding={0}
      scroll={false}
      topPadding="none"
    >
      <YStack style={styles.content}>
        <YStack style={styles.heroCopy}>
          <Text style={styles.heroTitle}>AI가 얼굴을 분석하고 있어요</Text>
          <Text style={styles.heroDescription}>
            촬영 이미지를 기준으로 톤, 균형, 맞춤 필터 조건을 정리합니다.
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
              label={displayedProgressState.progressLabel}
              progress={displayedProgressState.progress}
            />

            <YStack style={styles.stepList}>
              {faceAnalysisLoadingSteps.map((step, stepIndex) => {
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
            <Text style={styles.errorTitle}>분석을 완료하지 못했어요</Text>
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
    flex: 1,
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
    backgroundColor: colors.black,
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
    backgroundColor: colors.black,
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
