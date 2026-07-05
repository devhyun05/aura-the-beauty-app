import React from 'react';
import {StyleSheet} from 'react-native';
import {Button, Text, XStack} from 'tamagui';

import {colors, radius, spacing, typography} from '../../../shared/theme';
import {isARFilterSaveEnabled} from '../services/arFilterOptionRules';

type ARFilterBottomActionsProps = {
  hasUnsavedMakeupChanges: boolean;
  onOpenShapeAdjust?: () => void;
  onSave?: () => void;
};

export const AR_FILTER_BOTTOM_ACTION_BUTTON_GAP = spacing.sm;

export function getARFilterSaveButtonLabel(): string {
  return '저장';
}

export function getARFilterShapeEditButtonLabel(): string {
  return '형태 수정';
}

export function ARFilterBottomActions({
  hasUnsavedMakeupChanges,
  onOpenShapeAdjust,
  onSave,
}: ARFilterBottomActionsProps) {
  const isSaveEnabled = isARFilterSaveEnabled({
    hasUnsavedChanges: hasUnsavedMakeupChanges,
  });

  return (
    <XStack style={styles.makeupActionRow}>
      <Button
        accessibilityLabel="메이크업 형태 수정 화면 열기"
        accessibilityRole="button"
        onPress={onOpenShapeAdjust}
        pressStyle={{scale: 0.98}}
        style={styles.shapeEditButton}
        unstyled>
        <Text style={styles.shapeEditButtonText}>{getARFilterShapeEditButtonLabel()}</Text>
      </Button>
      <Button
        accessibilityLabel="현재 메이크업 필터 저장하기"
        accessibilityRole="button"
        accessibilityState={{disabled: !isSaveEnabled}}
        disabled={!isSaveEnabled}
        onPress={onSave}
        pressStyle={{scale: 0.98}}
        style={[
          styles.saveMakeupButton,
          !isSaveEnabled ? styles.saveMakeupButtonDisabled : undefined,
        ]}
        unstyled>
        <Text
          style={[
            styles.saveMakeupButtonText,
            !isSaveEnabled ? styles.saveMakeupButtonTextDisabled : undefined,
          ]}>
          {getARFilterSaveButtonLabel()}
        </Text>
      </Button>
    </XStack>
  );
}

const styles = StyleSheet.create({
  makeupActionRow: {
    gap: AR_FILTER_BOTTOM_ACTION_BUTTON_GAP,
  },
  shapeEditButton: {
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    flex: 1,
    height: 44,
    justifyContent: 'center',
  },
  shapeEditButtonText: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.sm,
  },
  saveMakeupButton: {
    alignItems: 'center',
    backgroundColor: colors.black,
    borderColor: colors.black,
    borderRadius: radius.md,
    borderWidth: 1,
    flex: 1,
    height: 44,
    justifyContent: 'center',
  },
  saveMakeupButtonDisabled: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
  },
  saveMakeupButtonText: {
    color: colors.white,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.sm,
  },
  saveMakeupButtonTextDisabled: {
    color: colors.textTertiary,
  },
});
