import React from 'react';
import {Pressable, StyleSheet} from 'react-native';
import {ClipboardList, ScanFace, Sparkles} from 'lucide-react-native';
import {Text, View, XStack, YStack} from 'tamagui';

import {colors, iconSize, radius, shadows, spacing, typography} from '../../../shared/theme';
import {AppScreen} from '../../../shared/ui';

type FaceAnalysisIntroScreenProps = {
  onStartAnalysisGuide?: () => void;
};

const faceAnalysisIntroContent = {
  eyebrow: 'FACE ANALYSIS',
  title: '얼굴 분석으로\n나에게 맞는 룩을 찾아요',
  description:
    '톤, 윤곽, 분위기를 함께 확인해 추천 필터와 제품을 더 정확하게 맞춰드려요.',
  primaryActionLabel: '시작하기',
} as const;

const faceAnalysisIntroSteps = [
  {
    id: 'survey',
    title: '취향 설문',
    description: '선호 무드와 평소 메이크업 습관을 반영해요.',
    icon: (color: string) => (
      <ClipboardList color={color} size={iconSize.md} strokeWidth={1.9} />
    ),
  },
  {
    id: 'capture',
    title: '사진 촬영',
    description: '가이드에 맞춰 촬영하면 분석 정확도가 높아져요.',
    icon: (color: string) => <ScanFace color={color} size={iconSize.md} strokeWidth={1.9} />,
  },
  {
    id: 'recommendation',
    title: '맞춤 추천',
    description: '분석 결과를 바탕으로 필터와 제품을 제안해요.',
    icon: (color: string) => <Sparkles color={color} size={iconSize.md} strokeWidth={1.9} />,
  },
] as const;

export function getFaceAnalysisIntroContent() {
  return faceAnalysisIntroContent;
}

export function getFaceAnalysisIntroStepTitles() {
  return faceAnalysisIntroSteps.map(step => step.title);
}

export function FaceAnalysisIntroScreen({
  onStartAnalysisGuide,
}: FaceAnalysisIntroScreenProps) {
  return (
    <AppScreen
      bottomPadding="safeArea"
      contentGap={spacing.xxl}
      topPadding="belowShellHeader">
      <YStack style={styles.hero}>
        <View style={styles.heroIcon}>
          <ScanFace color={colors.white} size={iconSize.xl} strokeWidth={1.8} />
        </View>
        <YStack style={styles.heroCopy}>
          <Text style={styles.eyebrow}>{faceAnalysisIntroContent.eyebrow}</Text>
          <Text style={styles.title}>{faceAnalysisIntroContent.title}</Text>
          <Text style={styles.description}>{faceAnalysisIntroContent.description}</Text>
        </YStack>
      </YStack>

      <YStack style={styles.stepList}>
        {faceAnalysisIntroSteps.map(step => (
          <XStack key={step.id} style={styles.stepRow}>
            <View style={styles.stepIcon}>{step.icon(colors.textPrimary)}</View>
            <YStack style={styles.stepCopy}>
              <Text style={styles.stepTitle}>{step.title}</Text>
              <Text style={styles.stepDescription}>{step.description}</Text>
            </YStack>
          </XStack>
        ))}
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
  description: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.medium,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.md,
  },
  eyebrow: {
    color: colors.textTertiary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.xs,
  },
  footerSpacer: {
    flex: 1,
  },
  hero: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.xl,
    padding: spacing.xl,
    shadowColor: shadows.soft.shadowColor,
    shadowOffset: shadows.soft.shadowOffset,
    shadowOpacity: 0.08,
    shadowRadius: shadows.soft.shadowRadius,
  },
  heroCopy: {
    gap: spacing.sm,
  },
  heroIcon: {
    alignItems: 'center',
    backgroundColor: colors.blackSurface,
    borderRadius: radius.pill,
    height: 64,
    justifyContent: 'center',
    width: 64,
  },
  pressed: {
    opacity: 0.78,
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: colors.blackSurface,
    borderRadius: radius.pill,
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'center',
    minHeight: 58,
    paddingHorizontal: spacing.xl,
  },
  primaryButtonText: {
    color: colors.white,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.md,
  },
  stepCopy: {
    flex: 1,
    gap: spacing.xs,
    minWidth: 0,
  },
  stepDescription: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.sm,
  },
  stepIcon: {
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: 1,
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  stepList: {
    gap: spacing.md,
  },
  stepRow: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.lg,
  },
  stepTitle: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.md,
  },
  title: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xxl,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.xxl,
  },
});
