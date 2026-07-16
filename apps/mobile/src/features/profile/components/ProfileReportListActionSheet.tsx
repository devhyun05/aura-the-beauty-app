import React from 'react';
import {Modal, Pressable, StyleSheet} from 'react-native';
import {
  ArrowRight,
  MessageCircle,
  ScanFace,
  ScanSearch,
  Sparkles,
} from 'lucide-react-native';
import {Text, View, YStack} from 'tamagui';

import {
  colors,
  iconSize,
  radius,
  shadows,
  spacing,
  typography,
} from '../../../shared/theme';

const reportListActions = [
  {
    description: '얼굴형과 피부톤 분석 결과를 확인해요.',
    icon: ScanFace,
    id: 'faceAnalysis',
    label: '얼굴 분석',
  },
  {
    description: '나에게 맞춰 생성된 메이크업을 확인해요.',
    icon: Sparkles,
    id: 'makeupRecommendation',
    label: '메이크업 추천',
  },
  {
    description: '사진에서 추출한 메이크업 분석을 확인해요.',
    icon: ScanSearch,
    id: 'makeupExtraction',
    label: '메이크업 추출',
  },
  {
    description: '메이크업 평가와 보완 포인트를 확인해요.',
    icon: MessageCircle,
    id: 'makeupFeedback',
    label: '메이크업 피드백',
  },
] as const;

type ReportListActionId = (typeof reportListActions)[number]['id'];

type ProfileReportListActionSheetProps = {
  isVisible: boolean;
  onClose: () => void;
  onPressFaceAnalysis?: () => void;
  onPressMakeupExtraction?: () => void;
  onPressMakeupFeedback?: () => void;
  onPressMakeupRecommendation?: () => void;
};

export function ProfileReportListActionSheet({
  isVisible,
  onClose,
  onPressFaceAnalysis,
  onPressMakeupExtraction,
  onPressMakeupFeedback,
  onPressMakeupRecommendation,
}: ProfileReportListActionSheetProps) {
  const actionHandlers: Record<ReportListActionId, (() => void) | undefined> = {
    faceAnalysis: onPressFaceAnalysis,
    makeupExtraction: onPressMakeupExtraction,
    makeupFeedback: onPressMakeupFeedback,
    makeupRecommendation: onPressMakeupRecommendation,
  };

  const handlePressAction = (actionId: ReportListActionId) => {
    const action = actionHandlers[actionId];

    if (!action) {
      return;
    }

    onClose();
    requestAnimationFrame(action);
  };

  return (
    <Modal
      animationType="fade"
      onRequestClose={onClose}
      transparent
      visible={isVisible}>
      <Pressable
        accessibilityLabel="보고서 목록 선택 닫기"
        accessibilityRole="button"
        onPress={onClose}
        style={styles.backdrop}>
        <Pressable
          accessibilityRole="menu"
          onPress={() => {}}
          style={styles.sheet}>
          <View style={styles.handle} />
          <YStack style={styles.header}>
            <Text style={styles.title}>보고서 전체보기</Text>
          </YStack>

          <YStack style={styles.actionList}>
            {reportListActions.map(action => {
              const Icon = action.icon;
              const isDisabled = !actionHandlers[action.id];

              return (
                <Pressable
                  accessibilityLabel={`${action.label} 전체 목록 열기`}
                  accessibilityRole="menuitem"
                  disabled={isDisabled}
                  key={action.id}
                  onPress={() => handlePressAction(action.id)}
                  style={({pressed}) => [
                    styles.actionButton,
                    pressed && styles.pressed,
                    isDisabled && styles.disabled,
                  ]}>
                  <View style={styles.actionIcon}>
                    <Icon
                      color={colors.textPrimary}
                      size={iconSize.md}
                      strokeWidth={1.9}
                    />
                  </View>
                  <YStack style={styles.actionCopy}>
                    <Text style={styles.actionTitle}>{action.label}</Text>
                    <Text style={styles.actionDescription}>
                      {action.description}
                    </Text>
                  </YStack>
                  <ArrowRight
                    color={colors.textPrimary}
                    size={iconSize.sm}
                    strokeWidth={2}
                  />
                </Pressable>
              );
            })}
          </YStack>

          <Pressable
            accessibilityLabel="보고서 목록 선택 취소"
            accessibilityRole="button"
            onPress={onClose}
            style={({pressed}) => [
              styles.cancelButton,
              pressed && styles.pressed,
            ]}>
            <Text style={styles.cancelText}>취소</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  actionButton: {
    alignItems: 'center',
    backgroundColor: colors.bottomSheetControlSurface,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.md,
  },
  actionCopy: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  actionDescription: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium,
    lineHeight: typography.lineHeight.xs,
  },
  actionIcon: {
    alignItems: 'center',
    backgroundColor: colors.bottomSheetMutedSurface,
    borderRadius: radius.pill,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  actionList: {
    gap: spacing.sm,
  },
  actionTitle: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.bold,
    lineHeight: typography.lineHeight.md,
  },
  backdrop: {
    backgroundColor: 'rgba(0, 0, 0, 0.34)',
    bottom: 0,
    justifyContent: 'flex-end',
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  cancelButton: {
    alignItems: 'center',
    backgroundColor: colors.bottomSheetControlSurface,
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 48,
  },
  cancelText: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
    lineHeight: typography.lineHeight.sm,
  },
  disabled: {
    opacity: 0.45,
  },
  handle: {
    alignSelf: 'center',
    backgroundColor: colors.borderStrong,
    borderRadius: radius.pill,
    height: 4,
    width: 42,
  },
  header: {
    gap: spacing.xs,
  },
  pressed: {
    opacity: 0.78,
  },
  sheet: {
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
  title: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
    lineHeight: typography.lineHeight.lg,
  },
});
