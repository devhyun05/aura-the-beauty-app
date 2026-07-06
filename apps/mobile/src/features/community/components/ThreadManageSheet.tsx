import type {ReactNode} from 'react';
import {Modal, Pressable, StyleSheet, View as RNView} from 'react-native';
import {AlertTriangle, Edit3, Trash2, X} from 'lucide-react-native';
import {Text, XStack, YStack} from 'tamagui';

import {colors, communityColors, iconSize, radius, shadows, spacing, typography} from '../../../shared/theme';

export type ThreadManageSheetMode = 'actions' | 'delete';

export function ThreadManageSheet({
  isDeleting = false,
  mode,
  onClose,
  onConfirmDelete,
  onPressDelete,
  onPressEdit,
  visible,
}: {
  isDeleting?: boolean;
  mode: ThreadManageSheetMode;
  onClose: () => void;
  onConfirmDelete: () => void;
  onPressDelete: () => void;
  onPressEdit: () => void;
  visible: boolean;
}) {
  const isDeleteMode = mode === 'delete';

  return (
    <Modal
      animationType="fade"
      onRequestClose={onClose}
      transparent
      visible={visible}>
      <RNView style={styles.modalRoot}>
        <Pressable
          accessibilityLabel="관리 메뉴 닫기"
          accessibilityRole="button"
          onPress={onClose}
          style={styles.scrim}
        />
        <YStack style={styles.sheet}>
          <RNView style={styles.handle} />
          <XStack style={styles.titleRow}>
            <YStack style={styles.titleCopy}>
              <Text style={styles.eyebrow}>{isDeleteMode ? 'DELETE LOOK' : 'MY LOOK'}</Text>
              <Text style={styles.title}>{isDeleteMode ? '정말 삭제할까요?' : '내 룩 관리'}</Text>
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

          {isDeleteMode ? (
            <YStack style={styles.deleteBlock}>
              <YStack style={styles.warningCard}>
                <RNView style={styles.warningIcon}>
                  <AlertTriangle color={colors.danger} size={iconSize.md} strokeWidth={2.2} />
                </RNView>
                <Text style={styles.description}>
                  삭제하면 룩톡에서 다시 보이지 않아요. 남겨둔 좋아요와 댓글도 함께 정리돼요.
                </Text>
              </YStack>
              <XStack style={styles.confirmRow}>
                <Pressable
                  accessibilityRole="button"
                  disabled={isDeleting}
                  onPress={onClose}
                  style={({pressed}) => [styles.secondaryButton, pressed && styles.pressed]}>
                  <Text style={styles.secondaryText}>취소</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  disabled={isDeleting}
                  onPress={onConfirmDelete}
                  style={({pressed}) => [
                    styles.destructiveButton,
                    isDeleting && styles.disabled,
                    pressed && styles.pressed,
                  ]}>
                  <Text style={styles.destructiveText}>{isDeleting ? '삭제 중...' : '삭제하기'}</Text>
                </Pressable>
              </XStack>
            </YStack>
          ) : (
            <YStack style={styles.actionList}>
              <ActionRow
                icon={<Edit3 color={colors.textPrimary} size={iconSize.md} strokeWidth={2.2} />}
                label="수정하기"
                sublabel="사진과 설명을 지금 룩에 맞게 다시 다듬어요"
                onPress={onPressEdit}
              />
              <ActionRow
                destructive
                icon={<Trash2 color={colors.danger} size={iconSize.md} strokeWidth={2.2} />}
                label="삭제하기"
                sublabel="이 룩을 커뮤니티에서 내려요"
                onPress={onPressDelete}
              />
            </YStack>
          )}
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
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({pressed}) => [styles.actionRow, pressed && styles.pressed]}>
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
    height: 42,
    justifyContent: 'center',
    width: 42,
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
    minHeight: 72,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  actionSublabel: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
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
    minHeight: 48,
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
    opacity: 0.52,
  },
  eyebrow: {
    color: communityColors.accent,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xs,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.xs,
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
  scrim: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
    backgroundColor: 'rgba(17, 17, 17, 0.48)',
  },
  secondaryButton: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'center',
    minHeight: 48,
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
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
});
