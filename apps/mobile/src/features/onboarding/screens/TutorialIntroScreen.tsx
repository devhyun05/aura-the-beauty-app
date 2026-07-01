import {useState} from 'react';
import {StyleSheet, useWindowDimensions} from 'react-native';
import {Button, Text, View, YStack} from 'tamagui';

import {colors, iconSize, radius, spacing, typography} from '../../../shared/theme';
import {AppScreen, AuraLogo} from '../../../shared/ui';
import {FaceCaptureTutorialScreen} from './FaceCaptureTutorialScreen';

type TutorialIntroScreenProps = {
  onCloseToHome?: () => void;
  onStartDiagnosis?: () => void;
  onStartCapture?: () => void;
  onSwitchAccount?: () => void;
};

type TutorialIntroHeroContent = {
  brand: 'AURA';
  title: string;
  subtitle: string;
  primaryActionLabel: string;
};

const tutorialIntroHeroContent = {
  brand: 'AURA',
  title: '얼굴 진단을 시작합니다.',
  subtitle: '내 얼굴에 맞는 메이크업을 추천받고,\n나만의 룩으로 자연스럽게 완성해보세요.',
  primaryActionLabel: '진단 시작',
} as const satisfies TutorialIntroHeroContent;

export function getTutorialIntroHeroContent() {
  return tutorialIntroHeroContent;
}

export function TutorialIntroScreen({
  onCloseToHome,
  onStartCapture,
  onStartDiagnosis,
  onSwitchAccount,
}: TutorialIntroScreenProps) {
  const [isFaceCaptureTutorialVisible, setIsFaceCaptureTutorialVisible] = useState(false);
  const {height} = useWindowDimensions();
  const isCompactHeight = height < 760;
  const content = getTutorialIntroHeroContent();
  const screenPaddingTop = isCompactHeight ? spacing.xxl : 72;
  const screenPaddingBottom = isCompactHeight ? spacing.xl : 44;

  const handleStartDiagnosis = () => {
    onStartDiagnosis?.();
    setIsFaceCaptureTutorialVisible(true);
  };

  if (isFaceCaptureTutorialVisible) {
    return (
      <FaceCaptureTutorialScreen
        onBackToIntro={() => setIsFaceCaptureTutorialVisible(false)}
        onCloseToHome={onCloseToHome}
        onStartCapture={onStartCapture}
      />
    );
  }

  return (
    <AppScreen
      backgroundColor={colors.background}
      bottomPadding="safeArea"
      contentGap={0}
      horizontalPadding={0}
      scroll={false}
      topPadding="safeArea">
      <YStack
        style={[
          styles.screen,
          {
            paddingBottom: screenPaddingBottom,
            paddingTop: screenPaddingTop,
          },
        ]}>
        <View style={styles.heroSpacer} />

        <YStack style={styles.copyArea}>
          <AuraLogo variant="intro" />
          <Text style={styles.title}>{content.title}</Text>
          <Text style={styles.subtitle}>{content.subtitle}</Text>
        </YStack>

        <View style={styles.footerSpacer} />

        <YStack style={styles.actionArea}>
          <Button
            accessibilityLabel={content.primaryActionLabel}
            accessibilityRole="button"
            onPress={handleStartDiagnosis}
            pressStyle={{opacity: 0.78}}
            style={styles.primaryButton}
            unstyled>
            <Text style={styles.primaryButtonText}>{content.primaryActionLabel}</Text>
          </Button>

          {onSwitchAccount ? (
            <Button
              accessibilityLabel="다른 이메일로 로그인"
              accessibilityRole="button"
              onPress={onSwitchAccount}
              pressStyle={{opacity: 0.72}}
              style={styles.secondaryButton}
              unstyled>
              <Text style={styles.secondaryButtonText}>다른 이메일로 로그인</Text>
            </Button>
          ) : null}
        </YStack>
      </YStack>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  actionArea: {
    gap: spacing.md,
    width: '100%',
  },
  copyArea: {
    alignItems: 'center',
    gap: spacing.lg,
    paddingHorizontal: spacing.sm,
    width: '100%',
  },
  footerSpacer: {
    flex: 1,
  },
  heroSpacer: {
    flex: 0.42,
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: colors.black,
    borderRadius: radius.pill,
    height: iconSize.xl + spacing.xxl,
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    width: '100%',
  },
  primaryButtonText: {
    color: colors.white,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.md,
  },
  screen: {
    alignItems: 'center',
    backgroundColor: colors.background,
    flex: 1,
    paddingHorizontal: spacing.xl,
  },
  secondaryButton: {
    alignItems: 'center',
    height: 42,
    justifyContent: 'center',
    width: '100%',
  },
  secondaryButtonText: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.sm,
    textAlign: 'center',
  },
  subtitle: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.regular,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.md,
    textAlign: 'center',
  },
  title: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.lg,
    textAlign: 'center',
  },
});
