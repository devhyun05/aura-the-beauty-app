import React, {useMemo, useState} from 'react';
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
} from 'react-native';
import {MessageSquareText, Sparkles} from 'lucide-react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {Text, View, XStack, YStack} from 'tamagui';

import {colors, iconSize, radius, shadows, spacing, typography} from '../../../shared/theme';
import {AppScreen} from '../../../shared/ui';
import {makeupFeedbackLoadingPreviewSource} from '../services/makeupFeedbackLoadingService';
import type {MakeupFeedbackPhotoSelection} from '../types';

type MakeupFeedbackGoalInputScreenProps = {
  selection: MakeupFeedbackPhotoSelection;
  onStartFeedback: (selection: MakeupFeedbackPhotoSelection) => void;
};

const goalTextMaxLength = 180;
const minGoalTextLength = 4;

function getPhotoTitle(selection: MakeupFeedbackPhotoSelection) {
  if (selection.photoTitle?.trim()) {
    return selection.photoTitle.trim();
  }

  return selection.photoSource === 'gallery' ? '앨범 사진' : '촬영 사진';
}

export function MakeupFeedbackGoalInputScreen({
  selection,
  onStartFeedback,
}: MakeupFeedbackGoalInputScreenProps) {
  const insets = useSafeAreaInsets();
  const [goalText, setGoalText] = useState(selection.feedbackContext?.userGoalText ?? '');
  const normalizedGoalText = goalText.trim();
  const isStartDisabled = normalizedGoalText.length < minGoalTextLength;
  const previewSource = useMemo(
    () => (selection.imageUri ? {uri: selection.imageUri} : makeupFeedbackLoadingPreviewSource),
    [selection.imageUri],
  );

  const handleStartFeedback = () => {
    if (isStartDisabled) {
      return;
    }

    onStartFeedback({
      ...selection,
      feedbackContext: {
        ...selection.feedbackContext,
        userGoalText: normalizedGoalText,
      },
    });
  };

  return (
    <AppScreen
      bottomPadding={0}
      contentGap={0}
      horizontalPadding={0}
      scroll={false}
      topPadding="none">
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardView}>
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          style={styles.scrollView}>
          <YStack style={styles.heroBlock}>
            <View style={styles.previewFrame}>
              <Image resizeMode="cover" source={previewSource} style={styles.previewImage} />
              <View style={styles.previewOverlay} />
              <XStack style={styles.previewBadge}>
                <Sparkles color={colors.white} size={iconSize.xs} strokeWidth={2.1} />
                <Text style={styles.previewBadgeText}>AI FEEDBACK</Text>
              </XStack>
              <Text numberOfLines={1} style={styles.previewTitle}>
                {getPhotoTitle(selection)}
              </Text>
            </View>

            <YStack style={styles.titleBlock}>
              <Text style={styles.screenTitle}>어떤 기준으로 피드백 받을까요?</Text>
              <Text style={styles.screenDescription}>상황과 원하는 분위기를 적어주세요.</Text>
            </YStack>
          </YStack>

          <YStack style={styles.formBlock}>
            <XStack style={styles.fieldHeader}>
              <View style={styles.fieldIcon}>
                <MessageSquareText color={colors.textPrimary} size={iconSize.sm} strokeWidth={2} />
              </View>
              <Text style={styles.fieldLabel}>메이크업 상황/목적</Text>
            </XStack>

            <View style={styles.inputFrame}>
              <TextInput
                maxLength={goalTextMaxLength}
                multiline
                onChangeText={setGoalText}
                placeholder="예: 데일리 메이크업인데 티 안 나게 자연스러운지 보고 싶어요."
                placeholderTextColor={colors.textTertiary}
                style={styles.input}
                textAlignVertical="top"
                value={goalText}
              />
              <Text style={styles.countText}>
                {goalText.length}/{goalTextMaxLength}
              </Text>
            </View>
          </YStack>
        </ScrollView>

        <YStack style={[styles.footer, {paddingBottom: insets.bottom + spacing.md}]}> 
          <Pressable
            accessibilityLabel="AI 피드백 시작"
            accessibilityRole="button"
            accessibilityState={{disabled: isStartDisabled}}
            disabled={isStartDisabled}
            onPress={handleStartFeedback}
            style={({pressed}) => [
              styles.primaryButton,
              isStartDisabled && styles.primaryButtonDisabled,
              pressed && !isStartDisabled && styles.pressed,
            ]}>
            <Text style={styles.primaryButtonText}>AI 피드백 시작</Text>
          </Pressable>
        </YStack>
      </KeyboardAvoidingView>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: spacing.xl,
    paddingBottom: 112,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
  countText: {
    alignSelf: 'flex-end',
    color: colors.textTertiary,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
  },
  fieldHeader: {
    alignItems: 'center',
    gap: spacing.md,
  },
  fieldIcon: {
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.pill,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  fieldLabel: {
    color: colors.textPrimary,
    flex: 1,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.md,
    lineHeight: typography.lineHeight.md,
    minWidth: 0,
  },
  footer: {
    backgroundColor: colors.background,
    borderTopColor: colors.border,
    borderTopWidth: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  formBlock: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.lg,
    padding: spacing.lg,
    shadowColor: shadows.soft.shadowColor,
    shadowOffset: shadows.soft.shadowOffset,
    shadowOpacity: 0.06,
    shadowRadius: shadows.soft.shadowRadius,
  },
  heroBlock: {
    gap: spacing.lg,
  },
  input: {
    color: colors.textPrimary,
    flex: 1,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.md,
    lineHeight: typography.lineHeight.md,
    minHeight: 118,
    padding: 0,
  },
  inputFrame: {
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: spacing.sm,
    minHeight: 158,
    padding: spacing.md,
  },
  keyboardView: {
    flex: 1,
  },
  pressed: {
    opacity: 0.76,
  },
  previewBadge: {
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.32)',
    borderColor: 'rgba(255, 255, 255, 0.72)',
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
    letterSpacing: 1,
    lineHeight: typography.lineHeight.xs,
  },
  previewFrame: {
    aspectRatio: 1.18,
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.lg,
    overflow: 'hidden',
    width: '100%',
  },
  previewImage: {
    height: '100%',
    width: '100%',
  },
  previewOverlay: {
    backgroundColor: colors.black,
    bottom: 0,
    left: 0,
    opacity: 0.16,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  previewTitle: {
    bottom: spacing.md,
    color: colors.white,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.lg,
    left: spacing.md,
    lineHeight: typography.lineHeight.lg,
    position: 'absolute',
    right: spacing.md,
    textShadowColor: 'rgba(0, 0, 0, 0.42)',
    textShadowOffset: {width: 0, height: 1},
    textShadowRadius: 5,
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: colors.textPrimary,
    borderRadius: radius.pill,
    justifyContent: 'center',
    minHeight: 58,
  },
  primaryButtonDisabled: {
    opacity: 0.42,
  },
  primaryButtonText: {
    color: colors.white,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.md,
    lineHeight: typography.lineHeight.md,
  },
  screenDescription: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
  screenTitle: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xl,
    lineHeight: typography.lineHeight.xl,
  },
  scrollView: {
    backgroundColor: colors.background,
    flex: 1,
  },
  titleBlock: {
    gap: spacing.sm,
  },
});