import {Send, X} from 'lucide-react-native';
import type {RefObject} from 'react';
import {Pressable, StyleSheet, TextInput} from 'react-native';
import {Text, XStack, YStack} from 'tamagui';

import {colors, communityColors, iconSize, radius, spacing, typography} from '../../../shared/theme';


export function ReplyComposer({
  disabled = false,
  inputRef,
  onCancelReplyTo,
  onChangeText,
  onFocus,
  onSubmit,
  replyingToNickname,
  value,
}: {
  disabled?: boolean;
  inputRef?: RefObject<TextInput | null>;
  onCancelReplyTo?: () => void;
  onChangeText: (value: string) => void;
  onFocus?: () => void;
  onSubmit: () => void;
  replyingToNickname?: string | null;
  value: string;
}) {
  const canSubmit = value.trim().length > 0 && !disabled;


  return (
    <YStack style={styles.dock}>

      {replyingToNickname ? (
        <XStack style={styles.replyTargetRow}>
          <Text style={styles.replyTargetText}>@{replyingToNickname}에게 답글</Text>
          <Pressable
            accessibilityLabel="답글 대상 해제"
            accessibilityRole="button"
            hitSlop={8}
            onPress={onCancelReplyTo}
            style={({pressed}) => pressed && styles.pressed}>
            <X color={communityColors.accent} size={iconSize.xs} strokeWidth={2.2} />
          </Pressable>
        </XStack>
      ) : null}

      <XStack style={styles.composer}>
        <TextInput
          multiline
          onChangeText={onChangeText}
          onFocus={onFocus}
          placeholder="이 룩에 답글…"
          placeholderTextColor={colors.textTertiary}
          ref={inputRef}
          style={styles.input}
          value={value}
        />
        <Pressable
          accessibilityLabel="답글 작성"
          accessibilityRole="button"
          disabled={!canSubmit}
          onPress={onSubmit}
          style={({pressed}) => [
            styles.submitButton,
            !canSubmit && styles.disabledButton,
            pressed && styles.pressed,
          ]}>
          <Send color={colors.white} size={iconSize.sm} strokeWidth={2} />
        </Pressable>
      </XStack>
    </YStack>
  );
}

const styles = StyleSheet.create({
  composer: {
    alignItems: 'flex-end',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.sm,
  },
  disabledButton: {
    opacity: 0.36,
  },
  dock: {
    backgroundColor: communityColors.surfaceWarm,
    borderTopColor: colors.divider,
    borderTopWidth: 1,
    gap: spacing.sm,
    paddingHorizontal: spacing.screenX,
    paddingTop: spacing.sm,
  },
  input: {
    color: colors.textPrimary,
    flex: 1,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
    // 스펙: 멀티라인 최대 5줄(~120px)까지 확장 후 내부 스크롤.
    maxHeight: 120,
    minHeight: 40,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    textAlignVertical: 'top',
  },
  pressed: {
    opacity: 0.72,
  },
  replyTargetRow: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: communityColors.accentSoft,
    borderRadius: radius.sm,
    flexDirection: 'row',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  replyTargetText: {
    color: communityColors.accent,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
  },
  submitButton: {
    alignItems: 'center',
    backgroundColor: colors.textPrimary,
    borderRadius: radius.pill,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
});
