import type {ReactNode} from 'react';
import {Modal, Pressable, StyleSheet, TextInput, View as RNView} from 'react-native';
import {AlertTriangle, Edit3, Trash2, X} from 'lucide-react-native';
import {Text, XStack, YStack} from 'tamagui';

import {colors, communityColors, iconSize, radius, shadows, spacing, typography} from '../../../shared/theme';
import type {CommunityReply} from '../types';

export type ReplyManageSheetMode = 'actions' | 'edit' | 'delete';

export function ReplyManageSheet({
  draftText,
  isOwnReply,
  isSaving = false,
  mode,
  onChangeDraftText,
  onClose,
  onConfirmDelete,
  onConfirmEdit,
  onPressDelete,
  onPressEdit,
  reply,
  visible,
}: {
  draftText: string;
  isOwnReply: boolean;
  isSaving?: boolean;
  mode: ReplyManageSheetMode;
  onChangeDraftText: (text: string) => void;
  onClose: () => void;
  onConfirmDelete: () => void;
  onConfirmEdit: () => void;
  onPressDelete: () => void;
  onPressEdit: () => void;
  reply: CommunityReply | null;
  visible: boolean;
}) {
  const trimmedDraft = draftText.trim();
  const canSave = trimmedDraft.length > 0 && trimmedDraft.length <= 1000 && !isSaving;

  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible={visible}>
      <RNView style={styles.modalRoot}>
        <Pressable accessibilityLabel="답글 메뉴 닫기" accessibilityRole="button" onPress={onClose} style={styles.scrim} />
        <YStack style={styles.sheet}>
          <RNView style={styles.handle} />
          <XStack style={styles.titleRow}>
            <YStack style={styles.titleCopy}>
              <Text style={styles.eyebrow}>{mode === 'edit' ? 'EDIT REPLY' : mode === 'delete' ? 'DELETE REPLY' : 'REPLY'}</Text>
              <Text style={styles.title}>{mode === 'edit' ? '답글 수정' : mode === 'delete' ? '답글을 삭제할까요?' : '답글 관리'}</Text>
            </YStack>
            <Pressable
              accessibilityLabel="닫기"
              accessibilityRole="button"
              hitSlop={10}
              onPress={onClose}
              style={({pressed}) => [styles.closeButton, pressed && styles.pressed]}>
              <X color={colors.textPrimary} size={iconSize.sm} strokeWidth={2.2} />
            </Pressable>
          </XStack>
          {reply ? <Text numberOfLines={2} style={styles.replyPreview}>{reply.body}</Text> : null}

          {mode === 'actions' ? (
            <YStack style={styles.actionList}>
              {isOwnReply ? (
                <>
                  <ActionRow
                    icon={<Edit3 color={colors.textPrimary} size={iconSize.md} strokeWidth={2.2} />}
                    label="수정하기"
                    sublabel="방금 남긴 답글을 자연스럽게 고쳐요"
                    onPress={onPressEdit}
                  />
                  <ActionRow
                    destructive
                    icon={<Trash2 color={colors.danger} size={iconSize.md} strokeWidth={2.2} />}
                    label="삭제하기"
                    sublabel="이 답글을 대화에서 지워요"
                    onPress={onPressDelete}
                  />
                </>
              ) : null}
            </YStack>
          ) : null}

          {mode === 'edit' ? (
            <YStack style={styles.editBlock}>
              <TextInput
                autoFocus
                maxLength={1000}
                multiline
                onChangeText={onChangeDraftText}
                placeholder="답글을 수정해 주세요"
                placeholderTextColor={colors.textTertiary}
                style={styles.editInput}
                value={draftText}
              />
              <XStack style={styles.footerRow}>
                <Text style={styles.counter}>{draftText.length}/1000</Text>
                <XStack style={styles.buttonRow}>
                  <Pressable
                    accessibilityRole="button"
                    disabled={isSaving}
                    onPress={onClose}
                    style={({pressed}) => [styles.secondaryButton, pressed && styles.pressed]}>
                    <Text style={styles.secondaryText}>취소</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    disabled={!canSave}
                    onPress={onConfirmEdit}
                    style={({pressed}) => [styles.primaryButton, !canSave && styles.disabled, pressed && styles.pressed]}>
                    <Text style={styles.primaryText}>{isSaving ? '저장 중...' : '저장'}</Text>
                  </Pressable>
                </XStack>
              </XStack>
            </YStack>
          ) : null}

          {mode === 'delete' ? (
            <YStack style={styles.deleteBlock}>
              <YStack style={styles.warningCard}>
                <RNView style={styles.warningIcon}>
                  <AlertTriangle color={colors.danger} size={iconSize.md} strokeWidth={2.2} />
                </RNView>
                <Text style={styles.description}>
                  삭제하면 이 대화에서 다시 보이지 않아요. 답글 흐름은 그대로 유지돼요.
                </Text>
              </YStack>
              <XStack style={styles.confirmRow}>
                <Pressable
                  accessibilityRole="button"
                  disabled={isSaving}
                  onPress={onClose}
                  style={({pressed}) => [styles.secondaryButton, pressed && styles.pressed]}>
                  <Text style={styles.secondaryText}>취소</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  disabled={isSaving}
                  onPress={onConfirmDelete}
                  style={({pressed}) => [styles.destructiveButton, isSaving && styles.disabled, pressed && styles.pressed]}>
                  <Text style={styles.destructiveText}>{isSaving ? '삭제 중...' : '삭제'}</Text>
                </Pressable>
              </XStack>
            </YStack>
          ) : null}
        </YStack>
      </RNView>
    </Modal>
  );
}

function ActionRow({
  destructive = false,
  icon,
  label,
  onPress,
  sublabel,
}: {
  destructive?: boolean;
  icon: ReactNode;
  label: string;
  onPress: () => void;
  sublabel: string;
}) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({pressed}) => [styles.actionRow, pressed && styles.pressed]}>
      <RNView style={[styles.actionIcon, destructive && styles.destructiveIcon]}>{icon}</RNView>
      <YStack style={styles.actionCopy}>
        <Text style={[styles.actionLabel, destructive && styles.destructiveLabel]}>{label}</Text>
        <Text style={styles.actionSublabel}>{sublabel}</Text>
      </YStack>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  actionCopy: {
    flex: 1,
    gap: 2,
  },
  actionIcon: {
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.pill,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  actionLabel: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.md,
    lineHeight: typography.lineHeight.md,
  },
  actionList: {
    gap: spacing.sm,
  },
  actionRow: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.md,
    minHeight: 70,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  actionSublabel: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  closeButton: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: 1,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  confirmRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  counter: {
    color: colors.textTertiary,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
  },
  deleteBlock: {
    gap: spacing.md,
  },
  description: {
    color: colors.textPrimary,
    flex: 1,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
  destructiveButton: {
    alignItems: 'center',
    backgroundColor: colors.danger,
    borderRadius: radius.pill,
    flex: 1,
    justifyContent: 'center',
    minHeight: 46,
  },
  destructiveIcon: {
    backgroundColor: 'rgba(220, 38, 38, 0.10)',
  },
  destructiveLabel: {
    color: colors.danger,
  },
  destructiveText: {
    color: colors.white,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
  disabled: {
    opacity: 0.42,
  },
  editBlock: {
    gap: spacing.sm,
  },
  editInput: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
    minHeight: 116,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    textAlignVertical: 'top',
  },
  eyebrow: {
    color: communityColors.accent,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xs,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.xs,
  },
  footerRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  handle: {
    alignSelf: 'center',
    backgroundColor: colors.border,
    borderRadius: radius.pill,
    height: 4,
    marginBottom: spacing.md,
    width: 38,
  },
  modalRoot: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  pressed: {
    opacity: 0.72,
    transform: [{scale: 0.99}],
  },
  replyPreview: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: colors.textPrimary,
    borderRadius: radius.pill,
    justifyContent: 'center',
    minHeight: 42,
    paddingHorizontal: spacing.lg,
  },
  primaryText: {
    color: colors.white,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
  scrim: {
    backgroundColor: 'rgba(17, 17, 17, 0.48)',
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  secondaryButton: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 42,
    paddingHorizontal: spacing.lg,
  },
  secondaryText: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
  sheet: {
    backgroundColor: communityColors.surfaceWarm,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    gap: spacing.lg,
    paddingBottom: spacing.xl,
    paddingHorizontal: spacing.screenX,
    paddingTop: spacing.md,
    ...shadows.soft,
  },
  title: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xl,
    lineHeight: typography.lineHeight.xl,
  },
  titleCopy: {
    flex: 1,
    gap: 2,
  },
  titleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
    justifyContent: 'space-between',
  },
  warningCard: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.md,
  },
  warningIcon: {
    alignItems: 'center',
    backgroundColor: 'rgba(220, 38, 38, 0.10)',
    borderRadius: radius.pill,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
});