import {useEffect, useMemo, useRef, useState} from 'react';
import {Image, Pressable, StyleSheet} from 'react-native';
import {CheckCircle2, ChevronLeft, Circle} from 'lucide-react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import Svg, {Circle as SvgCircle} from 'react-native-svg';
import {Text, View, XStack, YStack} from 'tamagui';

import {colors, iconSize, radius, shadows, spacing, typography} from '../../../shared/theme';
import {AppScreen} from '../../../shared/ui';
import {getReferenceMakeupExtractionDataSync} from '../services/makeupExtractionService';
import type {MakeupExtractionProgressUpdate, ReferenceMakeupPhoto} from '../types';

type ReferenceMakeupExtractionLoadingScreenProps = {
  analysisAttemptKey: number;
  analysisErrorMessage?: string | null;
  photo: ReferenceMakeupPhoto;
  isAnalysisReady?: boolean;
  progressUpdate?: MakeupExtractionProgressUpdate | null;
  onBack: () => void;
  onChooseDifferentPhoto?: () => void;
  onComplete: () => void;
  onOpenReportList?: () => void;
  onRetry?: () => void;
};

const PROGRESS_TICK_MS = 120;
// 완료 전에는 경과 시간에 선형 비례해 "일정한 속도"로 채운다(예전 점근 곡선의 감속 제거).
// 핵심: FILL_MS를 실제 소요(~55~70s)보다 넉넉히(85s) 잡아, 정상 구간에서는 상한에
// 닿기 전에 분석이 끝나 곧바로 마무리되게 한다. 그래도 상한에 닿으면 95%가 아니라
// NEAR_DONE(99%)이라 '거의 완료'로 읽히고, 도달 후에도 완전히 멈추지 않는다.
const FILL_MS = 85000;
const NEAR_DONE = 0.99;
const ELAPSED_CAP_MS = 180000;
// 분석 완료 후 100%까지 채우는 균일 속도(초당). 틱과 무관하게 실제 속도 일정.
const FINISH_PER_SEC = 0.18;
const FINISH_STEP = FINISH_PER_SEC * (PROGRESS_TICK_MS / 1000);
const RING_SIZE = 132;
const RING_STROKE = 8;
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

const loadingStepDescriptions: Record<string, string> = {
  'reference-read': '업로드한 레퍼런스 사진과 이름을 확인해요.',
  'core-points': '결과서 상단에 들어갈 메이크업 핵심 3가지를 추려요.',
  'area-guides': '피부, 눈, 눈썹, 볼, 입술, 윤곽별 따라 하는 법을 정리해요.',
  'product-criteria': '부위별 추천 제품을 찾기 위한 검색 기준을 만들어요.',
  'ar-filter-ready': '이 레퍼런스 룩을 메이크업 필터로 이어볼 준비를 해요.',
};


export function ReferenceMakeupExtractionLoadingScreen({
  analysisAttemptKey,
  analysisErrorMessage = null,
  isAnalysisReady = true,
  progressUpdate = null,
  photo,
  onBack,
  onChooseDifferentPhoto,
  onComplete,
  onOpenReportList,
  onRetry,
}: ReferenceMakeupExtractionLoadingScreenProps) {
  const insets = useSafeAreaInsets();
  const data = getReferenceMakeupExtractionDataSync();
  const [elapsedMs, setElapsedMs] = useState(0);
  const [displayedProgress, setDisplayedProgress] = useState(0);
  const stepCount = data.loadingSteps.length;
  const hasAnalysisError = Boolean(analysisErrorMessage);
  // 경과 시간에 선형 비례(일정 속도). 분석이 끝나면 100%로 마무리.
  const timedLinear = Math.min(NEAR_DONE, elapsedMs * (NEAR_DONE / FILL_MS));
  const targetProgress = hasAnalysisError
    ? displayedProgress
    : isAnalysisReady
      ? 1
      : timedLinear;
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
  const isComplete = progress >= 1 && isAnalysisReady && !hasAnalysisError;

  useEffect(() => {
    setElapsedMs(0);
    setDisplayedProgress(0);
  }, [analysisAttemptKey, photo.id]);

  useEffect(() => {
    const intervalId = setInterval(() => {
      setElapsedMs((currentElapsedMs) =>
        Math.min(currentElapsedMs + PROGRESS_TICK_MS, ELAPSED_CAP_MS),
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
      <Pressable
        accessibilityLabel="뒤로가기"
        accessibilityRole="button"
        hitSlop={12}
        onPress={onBack}
        style={[styles.backButton, {top: insets.top + spacing.xs}]}>
        <ChevronLeft color={colors.textPrimary} size={iconSize.sm} strokeWidth={2} />
      </Pressable>
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
              <Text style={styles.previewBadgeText}>
                {hasAnalysisError ? '분석 중단' : '결과서 생성 중'}
              </Text>
            </XStack>
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

        {hasAnalysisError ? (
          <YStack accessibilityRole="alert" style={styles.errorCard}>
            <Text style={styles.errorTitle}>메이크업 추출을 완료하지 못했어요</Text>
            <Text style={styles.errorDescription}>{analysisErrorMessage}</Text>
            <YStack style={styles.errorActions}>
              <Pressable
                accessibilityLabel="메이크업 추출 다시 시도"
                accessibilityRole="button"
                onPress={onRetry}
                style={({pressed}) => [styles.primaryAction, pressed && styles.actionPressed]}>
                <Text style={styles.primaryActionText}>다시 시도하기</Text>
              </Pressable>
              <Pressable
                accessibilityLabel="다른 사진 선택"
                accessibilityRole="button"
                onPress={onChooseDifferentPhoto}
                style={({pressed}) => [styles.secondaryAction, pressed && styles.actionPressed]}>
                <Text style={styles.secondaryActionText}>다른 사진 선택</Text>
              </Pressable>
              <Pressable
                accessibilityLabel="메이크업 추출 보고서 목록 보기"
                accessibilityRole="button"
                onPress={onOpenReportList}
                style={({pressed}) => [styles.secondaryAction, pressed && styles.actionPressed]}>
                <Text style={styles.secondaryActionText}>보고서 목록 보기</Text>
              </Pressable>
            </YStack>
          </YStack>
        ) : null}

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
  actionPressed: {
    opacity: 0.72,
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
  backButton: {
    alignItems: 'center',
    backgroundColor: colors.headerOverlaySurface,
    borderColor: colors.headerOverlayBorder,
    borderRadius: radius.pill,
    borderWidth: 1,
    height: 40,
    justifyContent: 'center',
    left: spacing.lg,
    position: 'absolute',
    width: 40,
    zIndex: 10,
  },
  content: {
    flex: 1,
    gap: spacing.xxl,
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xxl,
  },
  errorActions: {
    gap: spacing.sm,
    width: '100%',
  },
  errorCard: {
    alignItems: 'center',
    backgroundColor: colors.surface,
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
    lineHeight: typography.lineHeight.sm,
    textAlign: 'center',
  },
  errorTitle: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
    lineHeight: typography.lineHeight.lg,
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
  primaryAction: {
    alignItems: 'center',
    backgroundColor: colors.blackSurface,
    borderRadius: radius.pill,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: spacing.lg,
  },
  primaryActionText: {
    color: colors.white,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
    lineHeight: typography.lineHeight.sm,
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
  secondaryAction: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.borderStrong,
    borderRadius: radius.pill,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: spacing.lg,
  },
  secondaryActionText: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
    lineHeight: typography.lineHeight.sm,
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
