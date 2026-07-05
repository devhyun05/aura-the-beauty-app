import React from 'react';
import {Modal, Pressable, StyleSheet} from 'react-native';
import {ArrowRight, Camera, ImagePlus} from 'lucide-react-native';
import {Text, View, YStack} from 'tamagui';

import {colors, iconSize, radius, shadows, spacing, typography} from '../../../shared/theme';

const makeupExtractionActions = [
  {
    id: 'camera',
    label: '카메라 촬영',
    description: '지금 참고할 메이크업을 촬영해요.',
    accessibilityLabel: '카메라 촬영으로 메이크업 추출 시작',
    icon: (color: string) => <Camera color={color} size={iconSize.md} strokeWidth={1.9} />,
  },
  {
    id: 'upload',
    label: '사진 업로드',
    description: '앨범에서 메이크업 참고 사진을 선택해요.',
    accessibilityLabel: '사진 업로드로 메이크업 추출 시작',
    icon: (color: string) => <ImagePlus color={color} size={iconSize.md} strokeWidth={1.9} />,
  },
] as const;

type MakeupExtractionActionSheetProps = {
  isVisible: boolean;
  onClose: () => void;
  onPressCamera: () => void;
  onPressUpload: () => void;
};

export function getHomeMakeupExtractionActionLabels(): readonly string[] {
  return makeupExtractionActions.map(action => action.label);
}

export function MakeupExtractionActionSheet({
  isVisible,
  onClose,
  onPressCamera,
  onPressUpload,
}: MakeupExtractionActionSheetProps) {
  const actionHandlers = {
    camera: onPressCamera,
    upload: onPressUpload,
  } as const;

  return (
    <Modal
      animationType="fade"
      onRequestClose={onClose}
      transparent
      visible={isVisible}>
      <Pressable
        accessibilityLabel="메이크업 추출 선택 닫기"
        accessibilityRole="button"
        onPress={onClose}
        style={styles.sheetBackdrop}>
        <Pressable
          accessibilityRole="menu"
          onPress={() => {}}
          style={styles.actionSheet}>
          <View style={styles.sheetHandle} />
          <YStack style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>메이크업 추출</Text>
            <Text style={styles.sheetDescription}>
              카메라 촬영 또는 사진 업로드로 참고 메이크업을 분석해요.
            </Text>
          </YStack>

          <YStack style={styles.sheetActionList}>
            {makeupExtractionActions.map(action => (
              <Pressable
                accessibilityLabel={action.accessibilityLabel}
                accessibilityRole="menuitem"
                key={action.id}
                onPress={actionHandlers[action.id]}
                style={({pressed}) => [
                  styles.sheetActionButton,
                  pressed && styles.pressed,
                ]}>
                <View style={styles.sheetActionIcon}>
                  {action.icon(colors.textPrimary)}
                </View>
                <YStack style={styles.sheetActionCopy}>
                  <Text style={styles.sheetActionTitle}>{action.label}</Text>
                  <Text style={styles.sheetActionDescription}>
                    {action.description}
                  </Text>
                </YStack>
                <ArrowRight
                  color={colors.textPrimary}
                  size={iconSize.sm}
                  strokeWidth={2}
                />
              </Pressable>
            ))}
          </YStack>

          <Pressable
            accessibilityLabel="메이크업 추출 선택 취소"
            accessibilityRole="button"
            onPress={onClose}
            style={({pressed}) => [styles.sheetCancelButton, pressed && styles.pressed]}>
            <Text style={styles.sheetCancelText}>취소</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  actionSheet: {
    backgroundColor: colors.bottomSheetSurface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    gap: spacing.lg,
    paddingBottom: spacing.xxl,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    shadowColor: shadows.soft.shadowColor,
    shadowOffset: {width: 0, height: -8},
    shadowOpacity: 0.14,
    shadowRadius: 24,
  },
  pressed: {
    opacity: 0.78,
  },
  sheetActionButton: {
    alignItems: 'center',
    backgroundColor: colors.bottomSheetControlSurface,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.lg,
  },
  sheetActionCopy: {
    flex: 1,
    gap: spacing.xs,
    minWidth: 0,
  },
  sheetActionDescription: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.xs,
  },
  sheetActionIcon: {
    alignItems: 'center',
    backgroundColor: colors.bottomSheetMutedSurface,
    borderRadius: radius.pill,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  sheetActionList: {
    gap: spacing.md,
  },
  sheetActionTitle: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.md,
  },
  sheetBackdrop: {
    backgroundColor: 'rgba(0, 0, 0, 0.34)',
    bottom: 0,
    justifyContent: 'flex-end',
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  sheetCancelButton: {
    alignItems: 'center',
    backgroundColor: colors.bottomSheetControlSurface,
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 48,
  },
  sheetCancelText: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.sm,
  },
  sheetDescription: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.sm,
  },
  sheetHandle: {
    alignSelf: 'center',
    backgroundColor: colors.borderStrong,
    borderRadius: radius.pill,
    height: 4,
    width: 42,
  },
  sheetHeader: {
    gap: spacing.xs,
  },
  sheetTitle: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.lg,
  },
});
