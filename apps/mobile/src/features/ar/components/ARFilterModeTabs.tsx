import React from 'react';
import {StyleSheet} from 'react-native';
import {ChevronLeft} from 'lucide-react-native';
import {Button, Text, View, XStack, YStack} from 'tamagui';

import {colors, iconSize, radius, spacing, typography} from '../../../shared/theme';
import type {
  ARMakeupGuideData,
  ComparisonMode,
  GuideMode,
} from '../../../shared/types/makeupGuide';
import {
  FULLSCREEN_OVERLAY_ICON_BUTTON_SIZE,
  FULLSCREEN_OVERLAY_SEGMENT_ACTIVE_OPACITY,
  OverlayIconButton,
  OverlaySegmentButton,
} from '../../../shared/ui';

type ARFilterModeTabsProps = {
  arGuideData: ARMakeupGuideData;
  guideMode: GuideMode;
  onBack?: () => void;
  onComparisonModeChange: (mode: ComparisonMode) => void;
  onGuideModeChange: (mode: GuideMode) => void;
  selectedComparisonMode: ComparisonMode;
  topInset: number;
};

const MODE_TAB_HEIGHT = 24;
export const AR_FILTER_GUIDE_MODE_CONTROL_WIDTH = spacing.xxl * 8;
const MODE_TAB_CONTAINER_PADDING = spacing.xs / 2;
const MODE_TAB_CONTAINER_BORDER_WIDTH = 1;
const MODE_TAB_CONTROL_HEIGHT =
  MODE_TAB_HEIGHT +
  MODE_TAB_CONTAINER_PADDING * 2 +
  MODE_TAB_CONTAINER_BORDER_WIDTH * 2;
const SELECTED_TAB_BACKGROUND_OPACITY = FULLSCREEN_OVERLAY_SEGMENT_ACTIVE_OPACITY;
export const AR_FILTER_GUIDE_MODE_PLACEMENT = 'headerCenter' as const;
export const AR_FILTER_GUIDE_MODE_CONTROL_BOTTOM_OFFSET =
  spacing.md + (FULLSCREEN_OVERLAY_ICON_BUTTON_SIZE + MODE_TAB_CONTROL_HEIGHT) / 2;
export const AR_FILTER_COMPARISON_MODE_CONTROL_STYLE = 'plainTextToggle' as const;
export const AR_FILTER_COMPARISON_MODE_ACTIVE_INDICATOR = 'underline' as const;
export const AR_FILTER_COMPARISON_MODE_CONTAINER_CHROME = 'none' as const;
export const AR_FILTER_COMPARISON_MODE_VERTICAL_OFFSET = -spacing.xs;
export const AR_FILTER_COMPARISON_MODE_INDICATOR_GAP = spacing.xs / 2;
export const AR_FILTER_COMPARISON_MODE_INDICATOR_HEIGHT = 2;
export const AR_FILTER_COMPARISON_MODE_INDICATOR_OPACITY = 1;
export const AR_FILTER_COMPARISON_MODE_INDICATOR_WIDTH = spacing.xxl;

export function getARFilterModeTabHeight(): number {
  return MODE_TAB_HEIGHT;
}

export function getARFilterGuideModeControlBottomOffset(topInset: number): number {
  return topInset + AR_FILTER_GUIDE_MODE_CONTROL_BOTTOM_OFFSET;
}

export function getARFilterSelectedTabOpacity(): number {
  return SELECTED_TAB_BACKGROUND_OPACITY;
}

export function getARFilterComparisonTabs(
  arGuideData: ARMakeupGuideData,
): readonly string[] {
  return arGuideData.comparisonModes.map(mode => mode.label);
}

export function ARFilterModeTabs({
  arGuideData,
  guideMode,
  onBack,
  onComparisonModeChange,
  onGuideModeChange,
  selectedComparisonMode,
  topInset,
}: ARFilterModeTabsProps) {
  return (
    <YStack style={[styles.topArea, {paddingTop: topInset + spacing.md}]}>
      <XStack style={styles.header}>
        <View style={[styles.headerSideSlot, styles.headerLeadingSlot]}>
          <OverlayIconButton
            accessibilityLabel="생성 결과 화면으로 돌아가기"
            onPress={onBack}
          >
            <ChevronLeft color={colors.white} size={iconSize.md} strokeWidth={2} />
          </OverlayIconButton>
        </View>

        <XStack style={styles.segmentedControl}>
          <OverlaySegmentButton
            height={MODE_TAB_HEIGHT}
            isActive={guideMode === 'basic'}
            label="기본"
            minHeight={MODE_TAB_HEIGHT}
            onPress={() => onGuideModeChange('basic')}
            textStyle={styles.modeTabText}
          />
          <OverlaySegmentButton
            height={MODE_TAB_HEIGHT}
            isActive={guideMode === 'half'}
            label="반반 가이드"
            minHeight={MODE_TAB_HEIGHT}
            onPress={() => onGuideModeChange('half')}
            textStyle={styles.modeTabText}
          />
        </XStack>

        <View style={[styles.headerSideSlot, styles.headerTrailingSlot]} />
      </XStack>

      {guideMode === 'half' ? (
        <XStack style={styles.comparisonBar}>
          {arGuideData.comparisonModes.map(mode => (
            <ComparisonModeTextButton
              key={mode.id}
              isActive={mode.id === selectedComparisonMode}
              label={mode.label}
              onPress={() => onComparisonModeChange(mode.id)}
            />
          ))}
        </XStack>
      ) : null}
    </YStack>
  );
}

type ComparisonModeTextButtonProps = {
  isActive: boolean;
  label: string;
  onPress: () => void;
};

function ComparisonModeTextButton({
  isActive,
  label,
  onPress,
}: ComparisonModeTextButtonProps) {
  return (
    <Button
      accessibilityLabel={`${label} 비교 화면 선택`}
      accessibilityRole="button"
      accessibilityState={{selected: isActive}}
      onPress={onPress}
      pressStyle={{opacity: 0.72}}
      style={styles.comparisonTextButton}
      unstyled>
      <Text
        style={[
          styles.comparisonTextButtonText,
          isActive ? styles.comparisonTextButtonTextActive : undefined,
        ]}>
        {label}
      </Text>
      <View
        style={[
          styles.comparisonTextIndicator,
          !isActive ? styles.comparisonTextIndicatorInactive : undefined,
        ]}
      />
    </Button>
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
    position: 'absolute',
    right: 0,
  },
  segmentedControl: {
    alignSelf: 'center',
    backgroundColor: colors.glassSurface,
    borderColor: colors.white,
    borderRadius: radius.pill,
    borderWidth: MODE_TAB_CONTAINER_BORDER_WIDTH,
    padding: MODE_TAB_CONTAINER_PADDING,
    width: AR_FILTER_GUIDE_MODE_CONTROL_WIDTH,
  },
  comparisonBar: {
    alignSelf: 'center',
    backgroundColor: 'transparent',
    borderWidth: 0,
    gap: spacing.xl,
    padding: 0,
    transform: [{translateY: AR_FILTER_COMPARISON_MODE_VERTICAL_OFFSET}],
  },
  modeTabText: {
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
  },
  comparisonTextButton: {
    alignItems: 'center',
    gap: AR_FILTER_COMPARISON_MODE_INDICATOR_GAP,
    justifyContent: 'center',
    minHeight: MODE_TAB_HEIGHT,
    paddingHorizontal: spacing.xs,
  },
  comparisonTextButtonText: {
    color: colors.white,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.xs,
    opacity: 0.58,
    textAlign: 'center',
  },
  comparisonTextButtonTextActive: {
    fontFamily: typography.fontFamily.bold,
    fontWeight: typography.fontWeight.bold,
    opacity: 1,
  },
  comparisonTextIndicator: {
    backgroundColor: colors.white,
    borderRadius: radius.pill,
    height: AR_FILTER_COMPARISON_MODE_INDICATOR_HEIGHT,
    opacity: AR_FILTER_COMPARISON_MODE_INDICATOR_OPACITY,
    width: AR_FILTER_COMPARISON_MODE_INDICATOR_WIDTH,
  },
  comparisonTextIndicatorInactive: {
    opacity: 0,
  },
});
