import React from 'react';
import {ImageBackground, Pressable, StyleSheet} from 'react-native';
import {LinearGradient} from 'expo-linear-gradient';
import {Text, YStack} from 'tamagui';

import {colors, radius, shadows, spacing, typography} from '../../../shared/theme';
import {AppScreen} from '../../../shared/ui';
import {
  FACE_ANALYSIS_CAPTURE_DURATION_COPY,
  FACE_ANALYSIS_CAPTURE_PLAN,
} from '../services/faceAnalysisCaptureGuidance';
import {FACE_ANALYSIS_CAPTURE_CHECKLIST} from '../services/faceAnalysisCaptureChecklist';

type FaceAnalysisIntroScreenProps = {
  onStartAnalysis?: () => void;
  onOpenCaptureTips?: () => void;
};

const faceAnalysisHeroImage = require('../../../assets/images/face-analysis-intro.png');

const faceAnalysisIntroContent = {
  title: '맞춤 스타일링 얼굴 분석',
  captureDuration: FACE_ANALYSIS_CAPTURE_DURATION_COPY,
  primaryActionLabel: '얼굴 분석 시작',
  captureGuideLabel: '촬영 가이드',
  privacyNotice:
    '지원 기기에서는 TrueDepth로 만든 골든마스크를 보고서와 함께 비공개 저장해요. 보고서 또는 계정을 삭제하면 함께 삭제됩니다.',
} as const;


export function getFaceAnalysisIntroContent() {
  return faceAnalysisIntroContent;
}

export function getFaceAnalysisIntroStepTitles() {
  return FACE_ANALYSIS_CAPTURE_CHECKLIST.map(step => step.title);
}

export function getFaceAnalysisCapturePlanTitles() {
  return FACE_ANALYSIS_CAPTURE_PLAN.map(step => step.title);
}

export function FaceAnalysisIntroScreen({
  onStartAnalysis,
  onOpenCaptureTips,
}: FaceAnalysisIntroScreenProps) {
  return (
    <AppScreen
      backgroundColor={colors.background}
      bottomPadding="safeArea"
      contentGap={spacing.xl}
      topPadding="belowShellHeader">
      <ImageBackground
        imageStyle={styles.heroImage}
        resizeMode="cover"
        source={faceAnalysisHeroImage}
        style={styles.hero}>
        <LinearGradient
          colors={['rgba(17, 17, 17, 0)', 'rgba(17, 17, 17, 0.45)', 'rgba(17, 17, 17, 0.9)']}
          locations={[0, 0.46, 1]}
          pointerEvents="none"
          style={styles.heroScrim}
        />
        <YStack style={styles.heroContent}>
          <Text
            adjustsFontSizeToFit
            minimumFontScale={0.7}
            numberOfLines={1}
            style={styles.title}>
            {faceAnalysisIntroContent.title}
          </Text>
          <Text
            adjustsFontSizeToFit
            minimumFontScale={0.5}
            numberOfLines={1}
            style={styles.heroCaption}>
            <Text style={styles.heroCaptionStrong}>1회 촬영</Text>
            {`   ·   ${faceAnalysisIntroContent.captureDuration}`}
          </Text>
          <Text style={styles.privacyNotice}>
            {faceAnalysisIntroContent.privacyNotice}
          </Text>

          <Pressable
            accessibilityLabel={faceAnalysisIntroContent.primaryActionLabel}
            accessibilityRole="button"
            onPress={onStartAnalysis}
            style={({pressed}) => [styles.primaryButton, pressed && styles.pressed]}>
            <Text style={styles.primaryButtonText}>
              {faceAnalysisIntroContent.primaryActionLabel}
            </Text>
          </Pressable>

          <Pressable
            accessibilityLabel={faceAnalysisIntroContent.captureGuideLabel}
            accessibilityRole="button"
            onPress={onOpenCaptureTips}
            style={({pressed}) => [styles.secondaryButton, pressed && styles.pressed]}>
            <Text style={styles.secondaryButtonText}>
              {faceAnalysisIntroContent.captureGuideLabel}
            </Text>
          </Pressable>
        </YStack>
      </ImageBackground>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  hero: {
    borderRadius: 28,
    flex: 1,
    justifyContent: 'flex-end',
    minHeight: 480,
    overflow: 'hidden',
  },
  heroCaption: {
    color: 'rgba(255, 255, 255, 0.82)',
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    lineHeight: typography.lineHeight.sm,
  },
  heroCaptionStrong: {
    color: colors.white,
    fontFamily: typography.fontFamily.bold,
    fontWeight: typography.fontWeight.bold,
  },
  heroContent: {
    gap: spacing.sm,
    paddingBottom: spacing.xl,
    paddingHorizontal: spacing.screenX,
  },
  heroImage: {
    borderRadius: 28,
  },
  heroScrim: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  pressed: {
    opacity: 0.85,
    transform: [{scale: 0.99}],
  },
  privacyNotice: {
    color: 'rgba(255, 255, 255, 0.74)',
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: colors.white,
    borderRadius: radius.pill,
    justifyContent: 'center',
    marginTop: spacing.md,
    minHeight: 56,
    paddingHorizontal: spacing.xl,
    shadowColor: shadows.soft.shadowColor,
    shadowOffset: shadows.soft.shadowOffset,
    shadowOpacity: 0.18,
    shadowRadius: shadows.soft.shadowRadius,
  },
  primaryButtonText: {
    color: colors.blackSurface,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.bold,
    lineHeight: typography.lineHeight.md,
  },
  secondaryButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    borderColor: 'rgba(255, 255, 255, 0.75)',
    borderRadius: radius.pill,
    borderWidth: 1.5,
    justifyContent: 'center',
    marginTop: spacing.sm,
    minHeight: 56,
    paddingHorizontal: spacing.xl,
  },
  secondaryButtonText: {
    color: colors.white,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.bold,
    lineHeight: typography.lineHeight.md,
  },
  title: {
    color: colors.white,
    fontFamily: typography.fontFamily.bold,
    fontSize: 34,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: -0.8,
    lineHeight: 40,
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: {width: 0, height: 1},
    textShadowRadius: 12,
  },
});
