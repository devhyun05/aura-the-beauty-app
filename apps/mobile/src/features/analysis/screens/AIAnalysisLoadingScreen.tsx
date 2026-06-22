import React, {useEffect, useMemo, useState} from 'react';
import {StyleSheet} from 'react-native';
import {ChevronLeft} from 'lucide-react-native';
import {Button, Spinner, Text, View, XStack, YStack} from 'tamagui';
import {useSafeAreaInsets} from 'react-native-safe-area-context';

import {colors, iconSize, radius, shadows, spacing, typography} from '../../../shared/theme';
import {
  ANALYSIS_LOADING_TOTAL_MS,
  analysisLoadingTip,
  getAnalysisProgressState,
  mockAnalysisLoadingSteps,
} from '../services/analysisLoadingService';

type AIAnalysisLoadingScreenProps = {
  onBack?: () => void;
  onComplete?: () => void;
};

const PROGRESS_TICK_MS = 320;

export function AIAnalysisLoadingScreen({
  onBack,
  onComplete,
}: AIAnalysisLoadingScreenProps) {
  const insets = useSafeAreaInsets();
  const [elapsedMs, setElapsedMs] = useState(0);
  const progressState = useMemo(() => getAnalysisProgressState(elapsedMs), [elapsedMs]);

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

        <YStack style={styles.headerCopy}>
          <Text style={styles.eyebrow}>AI FACIAL ANALYSIS</Text>
          <Text style={styles.headerTitle}>얼굴 분석 중</Text>
        </YStack>
      </XStack>

      <YStack style={styles.content}>
        <YStack style={styles.previewCard}>
          <View style={styles.facePreview}>
            <View style={styles.faceGuide} />
            <View style={styles.scanLine} />
          </View>

          <YStack style={styles.previewCopy}>
            <Spinner color={colors.textPrimary} size="large" />
            <Text accessibilityLiveRegion="polite" style={styles.activeStepTitle}>
              {progressState.activeStep.title}
            </Text>
            <Text style={styles.activeStepDescription}>
              {progressState.activeStep.description}
            </Text>
          </YStack>
        </YStack>

        <YStack style={styles.progressSection}>
          <XStack style={styles.progressMeta}>
            <Text style={styles.progressLabel}>분석 진행률</Text>
            <Text style={styles.progressValue}>{progressState.progressLabel}</Text>
          </XStack>

          <View style={styles.progressTrack}>
            <View
              style={[
                styles.progressFill,
                {
                  width: `${progressState.progress * 100}%`,
                },
              ]}
            />
          </View>

          <XStack style={styles.stepList}>
            {mockAnalysisLoadingSteps.map(step => {
              const isActive = step.id === progressState.activeStep.id;

              return (
                <View
                  key={step.id}
                  accessibilityLabel={`${step.title} 단계`}
                  style={[styles.stepDot, isActive ? styles.stepDotActive : undefined]}
                />
              );
            })}
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

const styles = StyleSheet.create({
  screen: {
    backgroundColor: colors.background,
    flex: 1,
  },
  header: {
    alignItems: 'center',
    backgroundColor: colors.background,
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
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
    shadowColor: shadows.soft.shadowColor,
    shadowOffset: shadows.soft.shadowOffset,
    shadowOpacity: shadows.soft.shadowOpacity,
    shadowRadius: shadows.soft.shadowRadius,
    width: iconSize.xl + spacing.md,
  },
  headerCopy: {
    flex: 1,
    gap: spacing.xs,
    minWidth: 0,
  },
  eyebrow: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
    letterSpacing: 1.2,
    lineHeight: typography.lineHeight.xs,
  },
  headerTitle: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.lg,
  },
  content: {
    flex: 1,
    gap: spacing.xl,
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xxl,
  },
  previewCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.xl,
    padding: spacing.xl,
    shadowColor: shadows.soft.shadowColor,
    shadowOffset: shadows.soft.shadowOffset,
    shadowOpacity: shadows.soft.shadowOpacity,
    shadowRadius: shadows.soft.shadowRadius,
  },
  facePreview: {
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: colors.black,
    borderRadius: radius.lg,
    height: 286,
    justifyContent: 'center',
    overflow: 'hidden',
    width: '100%',
  },
  faceGuide: {
    borderColor: colors.white,
    borderRadius: radius.pill,
    borderWidth: 2,
    height: 174,
    opacity: 0.86,
    transform: [{scaleY: 1.18}],
    width: 136,
  },
  scanLine: {
    backgroundColor: colors.white,
    height: 2,
    left: spacing.xxl,
    opacity: 0.5,
    position: 'absolute',
    right: spacing.xxl,
    top: 128,
  },
  previewCopy: {
    alignItems: 'center',
    gap: spacing.md,
  },
  activeStepTitle: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.xl,
    textAlign: 'center',
  },
  activeStepDescription: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.regular,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.sm,
    textAlign: 'center',
  },
  progressSection: {
    gap: spacing.md,
  },
  progressMeta: {
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  progressLabel: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.sm,
  },
  progressValue: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.md,
  },
  progressTrack: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.pill,
    height: spacing.sm,
    overflow: 'hidden',
  },
  progressFill: {
    backgroundColor: colors.black,
    borderRadius: radius.pill,
    height: '100%',
  },
  stepList: {
    alignSelf: 'center',
    gap: spacing.sm,
  },
  stepDot: {
    backgroundColor: colors.borderStrong,
    borderRadius: radius.pill,
    height: spacing.sm,
    width: spacing.sm,
  },
  stepDotActive: {
    backgroundColor: colors.black,
    width: spacing.xxl,
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
