import React, {useEffect, useState} from 'react';
import {AccessibilityInfo, Pressable, StyleSheet} from 'react-native';
import {LinearGradient} from 'expo-linear-gradient';
import {useVideoPlayer, VideoView} from 'expo-video';
import {Text, View, XStack, YStack} from 'tamagui';

import {colors, radius, spacing, typography} from '../../../shared/theme';
import {AppScreen} from '../../../shared/ui';

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

export const faceAnalysisLoadingVideoSource = require(
  '../../../assets/videos/face-analysis-glass-pingpong.mp4',
) as number;

const COMPLETE_TRANSITION_DELAY_MS = 240;

export function FaceAnalysisLoadingScreen({
  analysisErrorMessage = null,
  isAnalysisReady = true,
  onBack,
  onComplete,
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
                  onPress={onBack}
                  style={styles.retakeButton}>
                  <Text style={styles.retakeButtonText}>다시 촬영</Text>
                </Pressable>
              </XStack>
            </YStack>
          ) : (
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
          )}
        </YStack>
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
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
