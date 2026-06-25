import React from 'react';
import {Pressable, StyleSheet} from 'react-native';
import {Camera, ChevronRight, X} from 'lucide-react-native';
import {Text, View, YStack} from 'tamagui';

import {
  colors,
  feedbackColors,
  feedbackRadius,
  feedbackSpacing,
  iconSize,
  radius,
  shadows,
  spacing,
  typography,
} from '../../../shared/theme';
import {AppHeader} from '../../../shared/ui';
import {FeedbackScreenScaffold} from '../components/FeedbackScreenScaffold';

type FeedbackEntryScreenProps = {
  onClose: () => void;
  onPressAiFeedback: () => void;
};

const feedbackEntryHeaderPresentation = {
  component: 'AppHeader',
  rightAction: 'close',
  title: '메이크업 피드백',
} as const;

export function getFeedbackEntryHeaderPresentation() {
  return feedbackEntryHeaderPresentation;
}

export function FeedbackEntryScreen({
  onClose,
  onPressAiFeedback,
}: FeedbackEntryScreenProps) {
  return (
    <FeedbackScreenScaffold topPadding="none">
      <AppHeader
        leftSlot={<View />}
        rightSlot={
          <Pressable
            accessibilityLabel="닫기"
            accessibilityRole="button"
            hitSlop={8}
            onPress={onClose}>
            <X color={colors.textPrimary} size={iconSize.lg} strokeWidth={2} />
          </Pressable>
        }
        title={feedbackEntryHeaderPresentation.title}
      />
      <YStack style={styles.screen}>
        <View style={styles.hero}>
          <View style={styles.heroIcon}>
            <Camera color={colors.white} size={iconSize.xl} strokeWidth={1.9} />
          </View>
          <Text style={styles.title}>메이크업 피드백</Text>
          <Text style={styles.subtitle}>오늘의 메이크업 밸런스를 확인해요</Text>
        </View>

        <Pressable
          accessibilityLabel="AI 피드백 시작"
          accessibilityRole="button"
          onPress={onPressAiFeedback}
          style={({pressed}) => [
            styles.aiFeedbackButton,
            {
              opacity: pressed ? 0.82 : 1,
            },
          ]}>
          <View style={styles.buttonCopy}>
            <Text style={styles.buttonLabel}>AI 피드백</Text>
            <Text style={styles.buttonCaption}>사진 촬영 또는 갤러리 선택</Text>
          </View>
          <ChevronRight color={colors.white} size={iconSize.md} strokeWidth={2.2} />
        </Pressable>
      </YStack>
    </FeedbackScreenScaffold>
  );
}

const styles = StyleSheet.create({
  aiFeedbackButton: {
    alignItems: 'center',
    backgroundColor: feedbackColors.accent,
    borderRadius: feedbackRadius.card,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.xxl,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
    shadowColor: feedbackColors.shadow,
    shadowOffset: shadows.soft.shadowOffset,
    shadowOpacity: shadows.soft.shadowOpacity,
    shadowRadius: shadows.soft.shadowRadius,
  },
  buttonCaption: {
    color: colors.white,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.xs,
    opacity: 0.82,
  },
  buttonCopy: {
    gap: spacing.xs,
  },
  buttonLabel: {
    color: colors.white,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.lg,
  },
  hero: {
    backgroundColor: feedbackColors.surface,
    borderColor: feedbackColors.borderSoft,
    borderRadius: feedbackRadius.sheet,
    borderWidth: 1,
    gap: spacing.md,
    marginTop: spacing.xxl,
    padding: spacing.xxl,
    shadowColor: feedbackColors.shadow,
    shadowOffset: shadows.soft.shadowOffset,
    shadowOpacity: shadows.soft.shadowOpacity,
    shadowRadius: shadows.soft.shadowRadius,
  },
  heroIcon: {
    alignItems: 'center',
    backgroundColor: feedbackColors.text,
    borderRadius: radius.pill,
    height: 64,
    justifyContent: 'center',
    width: 64,
  },
  screen: {
    backgroundColor: feedbackColors.background,
    flex: 1,
    paddingHorizontal: feedbackSpacing.screenX,
    paddingTop: spacing.lg,
  },
  subtitle: {
    color: feedbackColors.textMuted,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.medium,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.md,
  },
  title: {
    color: feedbackColors.text,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xxl,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.xxl,
  },
});
