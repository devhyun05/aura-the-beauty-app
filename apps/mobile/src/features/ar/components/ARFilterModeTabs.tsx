import React from 'react';
import {StyleSheet} from 'react-native';
import {ChevronLeft} from 'lucide-react-native';
import {XStack, YStack} from 'tamagui';

import {colors, iconSize, radius, spacing, typography} from '../../../shared/theme';
import type {
  ARMakeupGuideData,
  ComparisonMode,
  GuideMode,
} from '../../../shared/types/makeupGuide';
import {
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
const MODE_TAB_CONTAINER_PADDING = spacing.xs / 2;
const SELECTED_TAB_BACKGROUND_OPACITY = FULLSCREEN_OVERLAY_SEGMENT_ACTIVE_OPACITY;

export function getARFilterModeTabHeight(): number {
  return MODE_TAB_HEIGHT;
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
        <OverlayIconButton
          accessibilityLabel="생성 결과 화면으로 돌아가기"
          onPress={onBack}
        >
          <ChevronLeft color={colors.white} size={iconSize.md} strokeWidth={2} />
        </OverlayIconButton>
      </XStack>

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

      {guideMode === 'half' ? (
        <XStack style={styles.comparisonBar}>
          {arGuideData.comparisonModes.map(mode => (
            <OverlaySegmentButton
              key={mode.id}
              height={MODE_TAB_HEIGHT}
              isActive={mode.id === selectedComparisonMode}
              label={mode.label}
              minHeight={MODE_TAB_HEIGHT}
              onPress={() => onComparisonModeChange(mode.id)}
              style={styles.comparisonButton}
              textStyle={styles.comparisonButtonText}
            />
          ))}
        </XStack>
      ) : null}
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
    gap: spacing.md,
    justifyContent: 'space-between',
  },
  segmentedControl: {
    backgroundColor: colors.glassSurface,
    borderColor: colors.white,
    borderRadius: radius.pill,
    borderWidth: 1,
    padding: MODE_TAB_CONTAINER_PADDING,
  },
  comparisonBar: {
    backgroundColor: colors.glassSurface,
    borderColor: colors.white,
    borderRadius: radius.pill,
    borderWidth: 1,
    gap: spacing.xs,
    padding: MODE_TAB_CONTAINER_PADDING,
  },
  modeTabText: {
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
  },
  comparisonButton: {
    alignItems: 'center',
    borderRadius: radius.pill,
    flex: 1,
    justifyContent: 'center',
    minHeight: MODE_TAB_HEIGHT,
    paddingHorizontal: spacing.sm,
  },
  comparisonButtonText: {
    color: colors.white,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.xs,
    textAlign: 'center',
  },
});
