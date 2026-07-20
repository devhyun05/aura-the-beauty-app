import React from 'react';
import {ImageBackground, Pressable, StyleSheet} from 'react-native';
import {Text, View, XStack, YStack} from 'tamagui';

import {colors, radius, shadows, spacing, typography} from '../../../shared/theme';
import {AppScreen} from '../../../shared/ui';
import {
  FACE_ANALYSIS_CAPTURE_DURATION_COPY,
  FACE_ANALYSIS_CAPTURE_PLAN,
} from '../services/faceAnalysisCaptureGuidance';
import {FACE_ANALYSIS_CAPTURE_CHECKLIST} from '../services/faceAnalysisCaptureChecklist';

type FaceAnalysisIntroScreenProps = {
  onStartAnalysisGuide?: () => void;
};

const faceAnalysisHeroImage = require('../../../assets/images/face-analysis-intro.png');

const faceAnalysisIntroContent = {
  title: '맞춤 스타일링을 위한\n얼굴 분석',
  captureDuration: FACE_ANALYSIS_CAPTURE_DURATION_COPY,
  primaryActionLabel: '촬영 가이드 보기',
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
  onStartAnalysisGuide,
}: FaceAnalysisIntroScreenProps) {
  return (
    <AppScreen
      backgroundColor={colors.background}
      bottomPadding="safeArea"
      contentGap={spacing.xl}
      topPadding="belowShellHeader">
      <ImageBackground
        imageStyle={styles.heroImage}
        resizeMode="contain"
        source={faceAnalysisHeroImage}
        style={styles.hero}>
        <YStack style={styles.heroCopy}>
          <Text style={styles.title}>{faceAnalysisIntroContent.title}</Text>
        </YStack>

        <XStack style={styles.heroMeta}>
          <Text style={styles.heroMetaLabel}>1회 촬영</Text>
          <View style={styles.heroMetaDivider} />
          <Text style={styles.heroMetaValue}>{faceAnalysisIntroContent.captureDuration}</Text>
        </XStack>
      </ImageBackground>

      <YStack style={styles.content}>
        <YStack style={styles.checkHeader}>
          <Text style={styles.sectionEyebrow}>READY</Text>
          <Text style={styles.sectionTitle}>촬영 전 체크리스트</Text>
        </YStack>

        <YStack style={styles.checkList}>
          {FACE_ANALYSIS_CAPTURE_CHECKLIST.map((step, index) => (
            <XStack key={step.id} style={styles.checkRow}>
              <Text style={styles.checkIndex}>{String(index + 1).padStart(2, '0')}</Text>
              <YStack style={styles.checkCopy}>
                <Text style={styles.checkTitle}>{step.title}</Text>
                <Text style={styles.checkDescription}>{step.description}</Text>
              </YStack>
            </XStack>
          ))}
        </YStack>
      </YStack>

      <View style={styles.footerSpacer} />

      <Pressable
        accessibilityLabel={faceAnalysisIntroContent.primaryActionLabel}
        accessibilityRole="button"
        onPress={onStartAnalysisGuide}
        style={({pressed}) => [styles.primaryButton, pressed && styles.pressed]}>
        <Text style={styles.primaryButtonText}>
          {faceAnalysisIntroContent.primaryActionLabel}
        </Text>
      </Pressable>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  checkCopy: {
    flex: 1,
    gap: 4,
    minWidth: 0,
  },
  checkDescription: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    lineHeight: typography.lineHeight.sm,
  },
  checkHeader: {
    gap: spacing.xs,
  },
  checkIndex: {
    color: colors.textTertiary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 0.8,
    lineHeight: typography.lineHeight.sm,
    width: 40,
  },
  checkList: {
    borderTopColor: colors.border,
    borderTopWidth: 1,
  },
  checkRow: {
    alignItems: 'flex-start',
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    gap: spacing.md,
    paddingVertical: spacing.lg,
  },
  checkTitle: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
    lineHeight: typography.lineHeight.lg,
  },
  content: {
    gap: spacing.lg,
    paddingHorizontal: spacing.screenX,
  },
  footerSpacer: {
    flex: 1,
  },
  hero: {
    borderRadius: 28,
    height: 480,
    justifyContent: 'space-between',
    overflow: 'hidden',
    paddingBottom: spacing.lg,
    paddingHorizontal: spacing.screenX,
    paddingTop: spacing.xl,
  },
  heroCopy: {
    gap: spacing.sm,
  },
  heroImage: {
    borderRadius: 28,
  },
  heroMeta: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255, 255, 255, 0.78)',
    borderColor: 'rgba(255, 255, 255, 0.92)',
    borderRadius: radius.pill,
    borderWidth: 1,
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  heroMetaDivider: {
    backgroundColor: colors.border,
    height: 14,
    width: 1,
  },
  heroMetaLabel: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.bold,
    lineHeight: typography.lineHeight.xs,
  },
  heroMetaValue: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium,
    lineHeight: typography.lineHeight.xs,
  },
  pressed: {
    opacity: 0.78,
    transform: [{scale: 0.99}],
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: colors.blackSurface,
    borderRadius: radius.pill,
    justifyContent: 'center',
    minHeight: 58,
    paddingHorizontal: spacing.xl,
    shadowColor: shadows.soft.shadowColor,
    shadowOffset: shadows.soft.shadowOffset,
    shadowOpacity: 0.12,
    shadowRadius: shadows.soft.shadowRadius,
  },
  primaryButtonText: {
    color: colors.white,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.bold,
    lineHeight: typography.lineHeight.md,
  },
  sectionEyebrow: {
    color: colors.textTertiary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 1,
    lineHeight: typography.lineHeight.xs,
  },
  sectionTitle: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.bold,
    lineHeight: typography.lineHeight.xl,
  },
  title: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: 34,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: -0.8,
    lineHeight: 40,
  },
});
