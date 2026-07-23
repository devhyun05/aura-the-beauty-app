import React, {useEffect, useState} from 'react';
import {AccessibilityInfo, Pressable, StyleSheet} from 'react-native';
import {LinearGradient} from 'expo-linear-gradient';
import {useVideoPlayer, VideoView} from 'expo-video';
import {Text, View, XStack, YStack} from 'tamagui';

import {colors, radius, spacing, typography} from '../../../shared/theme';
import {AppScreen} from '../../../shared/ui';

type AnchorPreview = {
  faceShape: string;
  recommendedMood?: string;
  skinType?: string;
};

type FaceAnalysisLoadingScreenProps = {
  analysisErrorMessage?: string | null;
  anchorPreview?: AnchorPreview | null;
  capturedPhotoUri?: string;
  headerTitle?: string;
  isAnalysisReady?: boolean;
  onBack?: () => void;
  onComplete?: () => void;
  onOpenReports?: () => void;
  onRetake?: () => void;
  onRetry?: () => void;
  progressStartedAtMs?: number;
};

export const faceAnalysisLoadingVideoSource = require(
  '../../../assets/videos/face-analysis-glass-pingpong.mp4',
) as number;

const COMPLETE_TRANSITION_DELAY_MS = 240;

export function FaceAnalysisLoadingScreen({
  analysisErrorMessage = null,
  anchorPreview = null,
  isAnalysisReady = true,
  onBack,
  onComplete,
  onOpenReports,
  onRetake,
  onRetry,
}: FaceAnalysisLoadingScreenProps) {
  const [reduceMotionEnabled, setReduceMotionEnabled] = useState(false);
  const hasAnalysisError = Boolean(analysisErrorMessage);
  const player = useVideoPlayer(faceAnalysisLoadingVideoSource, videoPlayer => {
    videoPlayer.loop = true;
    videoPlayer.muted = true;
    videoPlayer.play();
  });

  useEffect(() => {
    let isMounted = true;
    void AccessibilityInfo.isReduceMotionEnabled().then(enabled => {
      if (isMounted) {
        setReduceMotionEnabled(enabled);
      }
    });
    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      setReduceMotionEnabled,
    );

    return () => {
      isMounted = false;
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    if (hasAnalysisError || reduceMotionEnabled) {
      player.pause();
      return;
    }
    player.play();
  }, [hasAnalysisError, player, reduceMotionEnabled]);

  useEffect(() => {
    if (!isAnalysisReady) {
      return;
    }

    const timeoutId = setTimeout(() => {
      onComplete?.();
    }, COMPLETE_TRANSITION_DELAY_MS);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [isAnalysisReady, onComplete]);

  return (
    <AppScreen
      bottomPadding={0}
      contentGap={0}
      horizontalPadding={0}
      scroll={false}
      topPadding="none"
    >
      <View style={styles.screen}>
        <VideoView
          accessibilityElementsHidden
          allowsPictureInPicture={false}
          allowsVideoFrameAnalysis={false}
          contentFit="cover"
          nativeControls={false}
          player={player}
          style={StyleSheet.absoluteFill}
          testID="face-analysis-loading-video"
        />
        <LinearGradient
          colors={[
            'rgba(246,250,252,0.02)',
            'rgba(246,250,252,0.08)',
            'rgba(246,250,252,0.94)',
          ]}
          locations={[0, 0.56, 1]}
          pointerEvents="none"
          style={StyleSheet.absoluteFill}
        />

        <YStack style={styles.content}>
          {hasAnalysisError ? (
            <YStack style={styles.errorCard}>
              <Text style={styles.errorTitle}>
                얼굴 분석을 완료하지 못했어요
              </Text>
              <Text style={styles.errorDescription}>
                {analysisErrorMessage}
              </Text>
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
                  onPress={onRetake ?? onBack}
                  style={styles.retakeButton}>
                  <Text style={styles.retakeButtonText}>다시 촬영</Text>
                </Pressable>
              </XStack>
              {onOpenReports ? (
                <Pressable
                  accessibilityLabel="얼굴 분석 보고서 목록 보기"
                  accessibilityRole="button"
                  onPress={onOpenReports}
                  style={styles.reportsButton}>
                  <Text style={styles.reportsButtonText}>분석 보고서 목록 보기</Text>
                </Pressable>
              ) : null}
            </YStack>
          ) : (
            <>
              {anchorPreview && !isAnalysisReady ? (
                <YStack style={styles.anchorCard}>
                  <Text style={styles.anchorHeaderText}>
                    핵심 분석 완료 · 상세 리포트를 생성하고 있어요
                  </Text>
                  <XStack style={styles.anchorRow}>
                    {(
                      [
                        ['얼굴형', anchorPreview.faceShape],
                        ['피부', anchorPreview.skinType],
                        ['무드', anchorPreview.recommendedMood],
                      ] as const
                    ).map(([label, value]) => (
                      <YStack key={label} style={styles.anchorItem}>
                        <Text style={styles.anchorLabel}>{label}</Text>
                        <Text numberOfLines={2} style={styles.anchorValue}>
                          {value ?? '분석 중'}
                        </Text>
                      </YStack>
                    ))}
                  </XStack>
                </YStack>
              ) : null}
              <YStack
                accessibilityLiveRegion="polite"
                style={styles.loadingCopy}>
                <Text style={styles.loadingTitle}>
                  나만의 얼굴 리포트를 만들고 있어요
                </Text>
                <XStack style={styles.statusRow}>
                  <View style={styles.statusDot} />
                  <Text style={styles.statusText}>
                    얼굴의 균형과 특징을 정리하는 중
                  </Text>
                </XStack>
                <Text style={styles.loadingDescription}>
                  준비되는 즉시 자동으로 열려요
                </Text>
              </YStack>
            </>
          )}
        </YStack>
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  anchorCard: {
    backgroundColor: 'rgba(255,255,255,0.94)',
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.md,
    marginBottom: spacing.xl,
    padding: spacing.lg,
  },
  anchorHeaderText: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
    lineHeight: typography.lineHeight.sm,
  },
  anchorItem: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
    flex: 1,
    gap: spacing.xs,
    padding: spacing.md,
  },
  anchorLabel: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.regular,
    lineHeight: typography.lineHeight.xs,
  },
  anchorRow: {
    gap: spacing.sm,
  },
  anchorValue: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
    lineHeight: typography.lineHeight.sm,
  },
  content: {
    flex: 1,
    justifyContent: 'flex-end',
    paddingBottom: spacing.xxl * 2,
    paddingHorizontal: spacing.xl,
  },
  errorActionRow: {
    gap: spacing.sm,
  },
  errorCard: {
    backgroundColor: 'rgba(255,255,255,0.94)',
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
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.md,
  },
  loadingCopy: {
    alignItems: 'center',
    gap: spacing.sm,
  },
  loadingDescription: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.regular,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.sm,
    marginTop: spacing.xs,
    textAlign: 'center',
  },
  loadingTitle: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: -0.3,
    lineHeight: typography.lineHeight.xl,
    textAlign: 'center',
  },
  retryButton: {
    alignItems: 'center',
    backgroundColor: colors.blackSurface,
    borderRadius: radius.pill,
    flex: 1,
    justifyContent: 'center',
    minHeight: 48,
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
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'center',
    minHeight: 48,
  },
  retakeButtonText: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.sm,
  },
  reportsButton: {
    alignItems: 'center',
    borderRadius: radius.pill,
    justifyContent: 'center',
    minHeight: 42,
    paddingHorizontal: spacing.md,
  },
  reportsButtonText: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
    lineHeight: typography.lineHeight.sm,
    textDecorationLine: 'underline',
  },
  screen: {
    backgroundColor: colors.background,
    flex: 1,
    overflow: 'hidden',
  },
  statusDot: {
    backgroundColor: '#22AEDD',
    borderRadius: radius.pill,
    height: 7,
    width: 7,
  },
  statusRow: {
    alignItems: 'center',
    gap: spacing.sm,
  },
  statusText: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.sm,
  },
});
