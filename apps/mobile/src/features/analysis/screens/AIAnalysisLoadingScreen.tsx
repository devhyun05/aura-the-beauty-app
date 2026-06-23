import React, {useEffect, useMemo, useState} from 'react';
import {Image, StyleSheet} from 'react-native';
import {CheckCircle2, ChevronLeft, Circle} from 'lucide-react-native';
import Svg, {Circle as SvgCircle} from 'react-native-svg';
import {Button, Text, View, XStack, YStack} from 'tamagui';
import {useSafeAreaInsets} from 'react-native-safe-area-context';

import {colors, iconSize, radius, shadows, spacing, typography} from '../../../shared/theme';
import {
  ANALYSIS_LOADING_TOTAL_MS,
  analysisLoadingPreviewSource,
  analysisLoadingTip,
  getAnalysisProgressState,
  mockAnalysisLoadingSteps,
} from '../services/analysisLoadingService';

type AIAnalysisLoadingScreenProps = {
  onBack?: () => void;
  onComplete?: () => void;
};

const PROGRESS_TICK_MS = 320;
const RING_SIZE = 132;
const RING_STROKE = 8;
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

export function AIAnalysisLoadingScreen({
  onBack,
  onComplete,
}: AIAnalysisLoadingScreenProps) {
  const insets = useSafeAreaInsets();
  const [elapsedMs, setElapsedMs] = useState(0);
  const progressState = useMemo(() => getAnalysisProgressState(elapsedMs), [elapsedMs]);
  const activeStepIndex = mockAnalysisLoadingSteps.findIndex(
    step => step.id === progressState.activeStep.id,
  );

  useEffect(() => {
    const intervalId = setInterval(() => {
      setElapsedMs(currentElapsedMs =>
        Math.min(currentElapsedMs + PROGRESS_TICK_MS, ANALYSIS_LOADING_TOTAL_MS),
      );
    }, PROGRESS_TICK_MS);

    return () => {
      clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    if (!progressState.isComplete) {
      return;
    }

    const timeoutId = setTimeout(() => {
      onComplete?.();
    }, spacing.xxl * 10);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [onComplete, progressState.isComplete]);

  return (
    <View style={styles.screen}>
      <XStack style={[styles.header, {paddingTop: insets.top + spacing.md}]}>
        <Button
          accessibilityLabel="촬영 화면으로 돌아가기"
          accessibilityRole="button"
          hitSlop={8}
          onPress={onBack}
          pressStyle={{scale: 0.97}}
          style={styles.backButton}
          unstyled>
          <ChevronLeft color={colors.textPrimary} size={iconSize.md} strokeWidth={2} />
        </Button>

        <Text numberOfLines={1} style={styles.headerTitle}>
          메이크업 분석
        </Text>

        <View style={styles.headerSpacer} />
      </XStack>

      <YStack style={styles.content}>
        <YStack style={styles.heroCopy}>
          <Text style={styles.heroTitle}>AI가 메이크업을 분석하고 있어요</Text>
          <Text style={styles.heroDescription}>
            촬영 이미지를 기준으로 톤, 균형, 추천 포인트를 정리합니다.
          </Text>
        </YStack>

        <YStack style={styles.analysisCard}>
          <View style={styles.previewFrame}>
            <Image
              resizeMode="cover"
              source={analysisLoadingPreviewSource}
              style={styles.previewImage}
            />
            <View style={styles.previewDim} />
            <View style={styles.scanLine} />
            <XStack style={styles.previewBadge}>
              <View style={styles.liveDot} />
              <Text style={styles.previewBadgeText}>진단 사진 분석 중</Text>
            </XStack>
          </View>

          <XStack style={styles.progressBlock}>
            <ProgressRing
              label={progressState.progressLabel}
              progress={progressState.progress}
            />

            <YStack style={styles.stepList}>
              {mockAnalysisLoadingSteps.map((step, stepIndex) => {
                const isDone = progressState.isComplete || stepIndex < activeStepIndex;
                const isActive = stepIndex === activeStepIndex && !progressState.isComplete;

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

        <YStack style={styles.tipCard}>
          <Text style={styles.tipLabel}>TIP</Text>
          <Text style={styles.tipText}>{analysisLoadingTip}</Text>
        </YStack>
      </YStack>
    </View>
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
  screen: {
    backgroundColor: colors.background,
    flex: 1,
  },
  header: {
    alignItems: 'center',
    backgroundColor: colors.background,
    gap: spacing.md,
    paddingBottom: spacing.md,
    paddingHorizontal: spacing.xl,
  },
  backButton: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.borderStrong,
    borderRadius: radius.pill,
    borderWidth: 1,
    height: iconSize.xl + spacing.md,
    justifyContent: 'center',
    padding: 0,
    width: iconSize.xl + spacing.md,
  },
  headerTitle: {
    color: colors.textPrimary,
    flex: 1,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.md,
    textAlign: 'center',
  },
  headerSpacer: {
    height: iconSize.xl + spacing.md,
    width: iconSize.xl + spacing.md,
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
  scanLine: {
    backgroundColor: colors.white,
    height: 2,
    left: spacing.xl,
    opacity: 0.82,
    position: 'absolute',
    right: spacing.xl,
    top: 116,
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
