import React from 'react';
import {Image, StyleSheet, type ViewStyle} from 'react-native';
import type {CameraType} from 'expo-camera';
import {Text, View} from 'tamagui';

import {colors, radius, spacing, typography} from '../../../shared/theme';
import type {ComparisonMode, GuideMode} from '../../../shared/types/makeupGuide';
import {FullscreenOverlayLayer, LiveCameraLayer} from '../../../shared/ui';
import {
  useUnityMakeupNativeViewReady,
  UnityMakeupNativeView,
} from './UnityMakeupNativeView';
import {AR_FILTER_GUIDE_MODE_CONTROL_BOTTOM_OFFSET} from './ARFilterModeTabs';

type MakeupPreviewColorOverlayLayer = {
  id: string;
  style: ViewStyle;
};

type ARFilterCameraPreviewProps = {
  active?: boolean;
  cameraFacing: CameraType;
  guideMode: GuideMode;
  comparisonDividerTopOffset?: number;
  previewColorHex: string;
  selectedComparisonMode: ComparisonMode;
  sourceImageUri?: string | null;
};

export function getMakeupPreviewColorOverlayLayers(): readonly MakeupPreviewColorOverlayLayer[] {
  return [];
}

export function getMakeupPreviewBadgeContent(): null {
  return null;
}

export function getARFilterCameraMode(): 'live-camera' {
  return 'live-camera';
}

export const AR_FILTER_COMPARISON_DIVIDER_WIDTH = StyleSheet.hairlineWidth;
export const AR_FILTER_COMPARISON_DIVIDER_VERTICAL_SPAN =
  'guideModeControlToBottom' as const;
export const AR_FILTER_COMPARISON_DIVIDER_TOP =
  AR_FILTER_GUIDE_MODE_CONTROL_BOTTOM_OFFSET;
export const AR_FILTER_COMPARISON_DIVIDER_BOTTOM = 0;
export const AR_FILTER_MOCK_MAKEUP_OVERLAY_VISIBILITY = 'hidden' as const;
export const AR_FILTER_HALF_GUIDE_SIDE_SHADE_VISIBILITY = 'hidden' as const;
export const AR_FILTER_SOURCE_IMAGE_PREVIEW_MODE =
  'gallery-image-over-camera' as const;

export function shouldShowARFilterHeaderCopy(): false {
  return false;
}

export function shouldShowARFilterMockMakeupOverlays(): false {
  return false;
}

export function shouldShowARFilterComparisonSideShade(): false {
  return false;
}

export function ARFilterCameraPreview({
  active = true,
  cameraFacing,
  comparisonDividerTopOffset = AR_FILTER_COMPARISON_DIVIDER_TOP,
  guideMode,
  selectedComparisonMode,
  sourceImageUri,
}: ARFilterCameraPreviewProps) {
  const previewColorOverlayLayers = getMakeupPreviewColorOverlayLayers();
  const shouldUseUnityPreview = useUnityMakeupNativeViewReady();
  const shouldUseSourceImagePreview = Boolean(sourceImageUri);
  const leftComparisonLabel = selectedComparisonMode === 'left' ? 'After' : 'Before';
  const rightComparisonLabel = selectedComparisonMode === 'left' ? 'Before' : 'After';

  return (
    <FullscreenOverlayLayer>
      {shouldUseUnityPreview && active && !shouldUseSourceImagePreview ? (
        <UnityMakeupNativeView />
      ) : (
        <>
          {sourceImageUri ? (
            <Image
              resizeMode="cover"
              source={{uri: sourceImageUri}}
              style={styles.sourceImagePreview}
            />
          ) : (
            <LiveCameraLayer active={active} facing={cameraFacing} />
          )}
          <View style={styles.previewDim} />
          {previewColorOverlayLayers.map(layer => (
            <View
              key={layer.id}
              style={layer.style}
            />
          ))}
        </>
      )}
      {guideMode === 'half' ? (
        <>
          <View
            style={[
              styles.comparisonDivider,
              {top: comparisonDividerTopOffset},
            ]}
          />
          <Text style={[styles.comparisonLabel, styles.comparisonLabelBefore]}>
            {leftComparisonLabel}
          </Text>
          <Text style={[styles.comparisonLabel, styles.comparisonLabelAfter]}>
            {rightComparisonLabel}
          </Text>
        </>
      ) : null}
    </FullscreenOverlayLayer>
  );
}

const styles = StyleSheet.create({
  previewDim: {
    backgroundColor: colors.blackSurface,
    bottom: 0,
    left: 0,
    opacity: 0.08,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  sourceImagePreview: {
    height: '100%',
    width: '100%',
  },
  comparisonDivider: {
    backgroundColor: colors.white,
    bottom: AR_FILTER_COMPARISON_DIVIDER_BOTTOM,
    left: '50%',
    opacity: 0.72,
    position: 'absolute',
    top: AR_FILTER_COMPARISON_DIVIDER_TOP,
    width: AR_FILTER_COMPARISON_DIVIDER_WIDTH,
  },
  comparisonLabel: {
    backgroundColor: colors.glassSurface,
    borderRadius: radius.pill,
    bottom: '31%',
    color: colors.white,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    position: 'absolute',
  },
  comparisonLabelBefore: {
    left: spacing.xl,
  },
  comparisonLabelAfter: {
    right: spacing.xl,
  },
});
