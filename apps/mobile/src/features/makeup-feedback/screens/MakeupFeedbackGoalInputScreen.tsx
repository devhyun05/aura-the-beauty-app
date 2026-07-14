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
import {
  buildMakeupFeedbackGoalContext,
  classifyMakeupFeedbackGoalText,
} from '../services/makeupFeedbackGoalIntentService';
import {prefetchMakeupFeedbackGeneratedPreviewMessages} from '../services/makeupFeedbackAgentConferenceService';
import {makeupFeedbackLoadingPreviewSource} from '../services/makeupFeedbackLoadingService';
import type {MakeupFeedbackPhotoSelection} from '../types';

type MakeupFeedbackGoalInputScreenProps = {
  selection: MakeupFeedbackPhotoSelection;
  onStartFeedback: (selection: MakeupFeedbackPhotoSelection) => void;
};

const goalTextMaxLength = 180;
const previewPrefetchHeadStartMs = 3500;

async function waitForPreviewPrefetchHeadStart(prefetchPromise: Promise<unknown>) {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  try {
    await Promise.race([
      prefetchPromise.catch(() => undefined),
      new Promise<void>(resolve => {
        timeoutId = setTimeout(resolve, previewPrefetchHeadStartMs);
      }),
    ]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

export function MakeupFeedbackGoalInputScreen({
  selection,
  onStartFeedback,
}: MakeupFeedbackGoalInputScreenProps) {
  const insets = useSafeAreaInsets();
  const [goalText, setGoalText] = useState(selection.feedbackContext?.originalGoalText ?? selection.feedbackContext?.userGoalText ?? '');
  const [isPreparingReviewCrew, setIsPreparingReviewCrew] = useState(false);
  const goalIntent = useMemo(() => classifyMakeupFeedbackGoalText(goalText), [goalText]);
  const isBlockingGoalIntent =
    goalIntent.intentType === 'noise' ||
    goalIntent.intentType === 'needs_detail';
  const shouldShowGoalError = goalText.trim().length > 0 && isBlockingGoalIntent;
  const isStartDisabled = isBlockingGoalIntent || isPreparingReviewCrew;
  const previewSource = useMemo(
    () => (selection.imageUri ? {uri: selection.imageUri} : makeupFeedbackLoadingPreviewSource),
    [selection.imageUri],
  );

  const handleStartFeedback = async () => {
    if (isPreparingReviewCrew) {
      return;
    }

    const nextFeedbackContext = buildMakeupFeedbackGoalContext(
      goalIntent,
      selection.feedbackContext?.profileGender,
    );

    if (!nextFeedbackContext) {
      return;
    }

    const nextSelection = {
      ...selection,
      feedbackContext: {
        ...selection.feedbackContext,
        ...nextFeedbackContext,
      },
    };

    setIsPreparingReviewCrew(true);
    const prefetchPromise = prefetchMakeupFeedbackGeneratedPreviewMessages(nextSelection);
    await waitForPreviewPrefetchHeadStart(prefetchPromise);
    onStartFeedback(nextSelection);
  };

  return (
    <AppScreen
      bottomPadding={0}
      contentGap={0}
      horizontalPadding={0}
      scroll={false}
      topPadding="none">
      <YStack style={styles.screenRoot}>
        <View style={styles.previewFrame}>
          <Image resizeMode="cover" source={previewSource} style={styles.previewImage} />
          <View style={styles.previewOverlay} />
          <XStack style={styles.previewBadge}>
            <Sparkles color={colors.white} size={iconSize.xs} strokeWidth={2.1} />
            <Text style={styles.previewBadgeText}>AI FEEDBACK</Text>
          </XStack>
        </View>

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
          style={styles.keyboardView}>
          <ScrollView
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            style={styles.scrollView}>
            <YStack style={styles.titleBlock}>
              <Text style={styles.screenTitle}>어떤 기준으로 피드백 받을까요?</Text>
              <Text style={styles.screenDescription}>사진을 보면서 상황이나 원하는 분위기를 적어주세요.</Text>
            </YStack>

            <YStack style={styles.formBlock}>
              <XStack style={styles.fieldHeader}>
                <View style={styles.fieldIcon}>
                  <MessageSquareText color={colors.textPrimary} size={iconSize.sm} strokeWidth={2} />
                </View>
                <Text style={styles.fieldLabel}>메이크업 상황/목적</Text>
              </XStack>

              <View style={[styles.inputFrame, shouldShowGoalError && styles.inputFrameError]}>
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
                <XStack style={styles.inputMetaRow}>
                  {shouldShowGoalError ? (
                    <Text style={styles.validationText}>{goalIntent.errorMessage}</Text>
                  ) : (
                    <View style={styles.validationSpacer} />
                  )}
                  <Text style={styles.countText}>
                    {goalText.length}/{goalTextMaxLength}
                  </Text>
                </XStack>
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
              <Text style={styles.primaryButtonText}>
                {isPreparingReviewCrew ? '리뷰 크루 준비 중...' : 'AI 피드백 시작'}
              </Text>
            </Pressable>
          </YStack>
        </KeyboardAvoidingView>
      </YStack>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: spacing.lg,
    paddingBottom: spacing.lg,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
  countText: {
    color: colors.textTertiary,
    flexShrink: 0,
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
  input: {
    color: colors.textPrimary,
    flex: 1,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.md,
    lineHeight: typography.lineHeight.md,
    minHeight: 108,
    padding: 0,
  },
  inputFrame: {
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: spacing.sm,
    minHeight: 146,
    padding: spacing.md,
  },
  inputFrameError: {
    borderColor: colors.heart,
  },
  inputMetaRow: {
    alignItems: 'center',
    gap: spacing.sm,
    justifyContent: 'space-between',
  },
  keyboardView: {
    flex: 1,
    minHeight: 0,
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
    backgroundColor: colors.surfaceMuted,
    borderBottomLeftRadius: radius.lg,
    borderBottomRightRadius: radius.lg,
    height: 210,
    overflow: 'hidden',
    width: '100%',
  },
  previewImage: {
    height: '100%',
    width: '100%',
  },
  previewOverlay: {
    backgroundColor: colors.blackSurface,
    bottom: 0,
    left: 0,
    opacity: 0.16,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: colors.blackSurface,
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
  screenRoot: {
    backgroundColor: colors.background,
    flex: 1,
  },
  screenTitle: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.lg,
    lineHeight: typography.lineHeight.lg,
  },
  scrollView: {
    backgroundColor: colors.background,
    flex: 1,
  },
  titleBlock: {
    gap: spacing.xs,
  },
  validationSpacer: {
    flex: 1,
  },
  validationText: {
    color: colors.heart,
    flex: 1,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
  },
});