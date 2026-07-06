import React, {useState} from 'react';
import {StyleSheet} from 'react-native';
import {Save, ScanLine, SlidersHorizontal} from 'lucide-react-native';
import {Button, Text, XStack} from 'tamagui';

import {colors, iconSize, radius, spacing, typography} from '../../../shared/theme';
import {isARFilterSaveEnabled} from '../services/arFilterOptionRules';

type ARFilterBottomActionsProps = {
  hasUnsavedMakeupChanges: boolean;
  onOpenDetailEdit?: () => void;
  onOpenShapeAdjust?: () => void;
  onSave?: () => void;
};

export type ARFilterEditActionId = 'detail' | 'shape';

type ARFilterEditActionOption = {
  accessibilityLabel: string;
  id: ARFilterEditActionId;
  label: string;
};

const AR_FILTER_EDIT_ACTION_OPTIONS = [
  {
    accessibilityLabel: '메이크업 상세 수정 화면 열기',
    id: 'detail',
    label: '상세 수정',
  },
  {
    accessibilityLabel: '메이크업 형태 수정 화면 열기',
    id: 'shape',
    label: '형태 수정',
  },
] as const satisfies readonly ARFilterEditActionOption[];

export const AR_FILTER_BOTTOM_ACTION_BUTTON_GAP = spacing.sm;
export const AR_FILTER_BOTTOM_ACTION_ICON_BUTTON_SIZE = 36;
export const AR_FILTER_BOTTOM_ACTION_ICON_BUTTON_BACKGROUND_COLOR =
  colors.arFilterBottomSheetSurface;
export const AR_FILTER_BOTTOM_ACTION_ICON_BUTTON_BORDER_COLOR = colors.border;

export function getARFilterSaveButtonLabel(): string {
  return '저장';
}

export function getARFilterEditActionButtonLabel(): string {
  return '수정';
}

export function getARFilterDetailEditButtonLabel(): string {
  return '상세 수정';
}

export function getARFilterShapeEditButtonLabel(): string {
  return '형태 수정';
}

export function getARFilterEditActionOptions(): readonly ARFilterEditActionOption[] {
  return AR_FILTER_EDIT_ACTION_OPTIONS;
}

export function ARFilterBottomActions({
  hasUnsavedMakeupChanges,
  onOpenDetailEdit,
  onOpenShapeAdjust,
  onSave,
}: ARFilterBottomActionsProps) {
  const [isEditActionMenuVisible, setIsEditActionMenuVisible] = useState(false);
  const isSaveEnabled = isARFilterSaveEnabled({
    hasUnsavedChanges: hasUnsavedMakeupChanges,
  });
  const isEditActionEnabled = Boolean(onOpenDetailEdit || onOpenShapeAdjust);

  const handleEditActionButtonPress = () => {
    if (!isEditActionEnabled) {
      return;
    }

    setIsEditActionMenuVisible(currentValue => !currentValue);
  };

  const handleEditActionOptionPress = (optionId: ARFilterEditActionId) => {
    setIsEditActionMenuVisible(false);

    if (optionId === 'detail') {
      onOpenDetailEdit?.();
      return;
    }

    onOpenShapeAdjust?.();
  };

  return (
    <XStack style={styles.bottomActionHost}>
      {isEditActionMenuVisible ? (
        <XStack style={styles.editActionMenu}>
          {AR_FILTER_EDIT_ACTION_OPTIONS.map(option => {
            const isOptionEnabled =
              option.id === 'detail' ? Boolean(onOpenDetailEdit) : Boolean(onOpenShapeAdjust);

            return (
              <Button
                key={option.id}
                accessibilityLabel={option.accessibilityLabel}
                accessibilityRole="button"
                accessibilityState={{disabled: !isOptionEnabled}}
                disabled={!isOptionEnabled}
                onPress={() => handleEditActionOptionPress(option.id)}
                pressStyle={{scale: 0.98}}
                style={[
                  styles.editActionMenuButton,
                  !isOptionEnabled ? styles.editActionMenuButtonDisabled : undefined,
                ]}
                unstyled>
                {option.id === 'detail' ? (
                  <SlidersHorizontal
                    color={isOptionEnabled ? colors.textPrimary : colors.textTertiary}
                    size={iconSize.xs}
                    strokeWidth={2}
                  />
                ) : (
                  <ScanLine
                    color={isOptionEnabled ? colors.textPrimary : colors.textTertiary}
                    size={iconSize.xs}
                    strokeWidth={2}
                  />
                )}
                <Text
                  style={[
                    styles.editActionMenuButtonText,
                    !isOptionEnabled ? styles.editActionMenuButtonTextDisabled : undefined,
                  ]}>
                  {option.label}
                </Text>
              </Button>
            );
          })}
        </XStack>
      ) : null}

      <XStack style={styles.makeupActionRow}>
        <Button
          accessibilityLabel="메이크업 수정 방식 선택"
          accessibilityRole="button"
          accessibilityState={{
            disabled: !isEditActionEnabled,
            expanded: isEditActionMenuVisible,
          }}
          disabled={!isEditActionEnabled}
          onPress={handleEditActionButtonPress}
          pressStyle={{scale: 0.96}}
          style={[
            styles.iconActionButton,
            !isEditActionEnabled ? styles.iconActionButtonDisabled : undefined,
          ]}
          unstyled>
          <SlidersHorizontal
            color={isEditActionEnabled ? colors.textPrimary : colors.textTertiary}
            size={iconSize.sm}
            strokeWidth={2}
          />
        </Button>

        <Button
          accessibilityLabel="현재 메이크업 필터 저장하기"
          accessibilityRole="button"
          accessibilityState={{disabled: !isSaveEnabled}}
          disabled={!isSaveEnabled}
          onPress={onSave}
          pressStyle={{scale: 0.96}}
          style={[
            styles.iconActionButton,
            !isSaveEnabled ? styles.iconActionButtonDisabled : undefined,
          ]}
          unstyled>
          <Save
            color={isSaveEnabled ? colors.textPrimary : colors.textTertiary}
            size={iconSize.sm}
            strokeWidth={2}
          />
        </Button>
      </XStack>
    </XStack>
  );
}

const styles = StyleSheet.create({
  bottomActionHost: {
    alignItems: 'flex-end',
    flex: 1,
    justifyContent: 'center',
    minHeight: AR_FILTER_BOTTOM_ACTION_ICON_BUTTON_SIZE,
    position: 'relative',
  },
  makeupActionRow: {
    gap: AR_FILTER_BOTTOM_ACTION_BUTTON_GAP,
    justifyContent: 'flex-end',
  },
  iconActionButton: {
    alignItems: 'center',
    backgroundColor: AR_FILTER_BOTTOM_ACTION_ICON_BUTTON_BACKGROUND_COLOR,
    borderColor: AR_FILTER_BOTTOM_ACTION_ICON_BUTTON_BORDER_COLOR,
    borderRadius: radius.pill,
    borderWidth: 1,
    height: AR_FILTER_BOTTOM_ACTION_ICON_BUTTON_SIZE,
    justifyContent: 'center',
    width: AR_FILTER_BOTTOM_ACTION_ICON_BUTTON_SIZE,
  },
  iconActionButtonDisabled: {
    opacity: 0.46,
  },
  editActionMenu: {
    alignItems: 'center',
    backgroundColor: colors.arFilterBottomSheetSurface,
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: 1,
    bottom: AR_FILTER_BOTTOM_ACTION_ICON_BUTTON_SIZE + spacing.xs,
    gap: spacing.xs,
    padding: spacing.xs,
    position: 'absolute',
    right: 0,
  },
  editActionMenuButton: {
    alignItems: 'center',
    backgroundColor: colors.liquidGlassSurface,
    borderRadius: radius.pill,
    flexDirection: 'row',
    gap: spacing.xs,
    height: 32,
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
  },
  editActionMenuButtonDisabled: {
    opacity: 0.46,
  },
  editActionMenuButtonText: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.xs,
  },
  editActionMenuButtonTextDisabled: {
    color: colors.textTertiary,
  },
});
