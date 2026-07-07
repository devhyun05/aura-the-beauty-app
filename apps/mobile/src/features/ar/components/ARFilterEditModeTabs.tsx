import React from 'react';
import {StyleSheet} from 'react-native';
import {ChevronLeft, Save} from 'lucide-react-native';
import {View, XStack, YStack} from 'tamagui';

import {colors, iconSize, radius, spacing, typography} from '../../../shared/theme';
import {
  FULLSCREEN_OVERLAY_ICON_BUTTON_SIZE,
  OverlayIconButton,
  OverlaySegmentButton,
} from '../../../shared/ui';
import {AR_FILTER_GUIDE_MODE_CONTROL_WIDTH} from './ARFilterModeTabs';

export type ARFilterEditMode = 'product' | 'fit';

type ARFilterEditModeTabsProps = {
  activeMode: ARFilterEditMode;
  onBack?: () => void;
  onModeChange: (mode: ARFilterEditMode) => void;
  onSave?: () => void;
  topInset: number;
};

const EDIT_MODE_TAB_HEIGHT = 24;
const EDIT_MODE_TAB_CONTAINER_PADDING = spacing.xs / 2;
const EDIT_MODE_TAB_CONTAINER_BORDER_WIDTH = 1;

const AR_FILTER_EDIT_MODE_LABELS: Record<ARFilterEditMode, string> = {
  product: '제품 수정',
  fit: '핏 수정',
};

export function getARFilterEditModeTabLabels(): readonly string[] {
  return [
    AR_FILTER_EDIT_MODE_LABELS.product,
    AR_FILTER_EDIT_MODE_LABELS.fit,
  ];
}

export function getARFilterEditModeTabHeight(): number {
  return EDIT_MODE_TAB_HEIGHT;
}

export function ARFilterEditModeTabs({
  activeMode,
  onBack,
  onModeChange,
  onSave,
  topInset,
}: ARFilterEditModeTabsProps) {
  return (
    <YStack style={[styles.topArea, {paddingTop: topInset + spacing.md}]}>
      <XStack style={styles.header}>
        <View style={[styles.headerSideSlot, styles.headerLeadingSlot]}>
          <OverlayIconButton
            accessibilityLabel="메이크업 필터 화면으로 돌아가기"
            onPress={onBack}>
            <ChevronLeft color={colors.white} size={iconSize.md} strokeWidth={2} />
          </OverlayIconButton>
        </View>

        <XStack style={styles.segmentedControl}>
          <OverlaySegmentButton
            height={EDIT_MODE_TAB_HEIGHT}
            isActive={activeMode === 'product'}
            label={AR_FILTER_EDIT_MODE_LABELS.product}
            minHeight={EDIT_MODE_TAB_HEIGHT}
            onPress={() => onModeChange('product')}
            textStyle={styles.modeTabText}
          />
          <OverlaySegmentButton
            height={EDIT_MODE_TAB_HEIGHT}
            isActive={activeMode === 'fit'}
            label={AR_FILTER_EDIT_MODE_LABELS.fit}
            minHeight={EDIT_MODE_TAB_HEIGHT}
            onPress={() => onModeChange('fit')}
            textStyle={styles.modeTabText}
          />
        </XStack>

        <View style={[styles.headerSideSlot, styles.headerTrailingSlot]}>
          {onSave ? (
            <OverlayIconButton
              accessibilityLabel="현재 수정 내용 저장"
              onPress={onSave}>
              <Save color={colors.white} size={iconSize.sm} strokeWidth={2} />
            </OverlayIconButton>
          ) : null}
        </View>
      </XStack>
    </YStack>
  );
}

const styles = StyleSheet.create({
  topArea: {
    gap: spacing.md,
    paddingBottom: spacing.md,
    paddingHorizontal: spacing.xl,
    zIndex: 3,
  },
  header: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: FULLSCREEN_OVERLAY_ICON_BUTTON_SIZE,
    position: 'relative',
    width: '100%',
  },
  headerSideSlot: {
    alignItems: 'flex-start',
    justifyContent: 'center',
    width: FULLSCREEN_OVERLAY_ICON_BUTTON_SIZE,
  },
  headerLeadingSlot: {
    left: 0,
    position: 'absolute',
    zIndex: 1,
  },
  headerTrailingSlot: {
    alignItems: 'flex-end',
    position: 'absolute',
    right: 0,
  },
  segmentedControl: {
    alignSelf: 'center',
    backgroundColor: colors.glassSurface,
    borderColor: colors.white,
    borderRadius: radius.pill,
    borderWidth: EDIT_MODE_TAB_CONTAINER_BORDER_WIDTH,
    padding: EDIT_MODE_TAB_CONTAINER_PADDING,
    width: AR_FILTER_GUIDE_MODE_CONTROL_WIDTH,
  },
  modeTabText: {
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
  },
});
