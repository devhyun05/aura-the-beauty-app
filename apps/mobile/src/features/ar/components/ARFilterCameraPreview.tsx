import React from 'react';
import {StyleSheet, type ViewStyle} from 'react-native';
import type {CameraType} from 'expo-camera';
import {Text, View} from 'tamagui';

import {colors, radius, spacing, typography} from '../../../shared/theme';
import type {ComparisonMode, GuideMode} from '../../../shared/types/makeupGuide';
import {FullscreenOverlayLayer, LiveCameraLayer} from '../../../shared/ui';
import {
  useUnityMakeupNativeViewReady,
  UnityMakeupNativeView,
} from './UnityMakeupNativeView';

type MakeupPreviewColorOverlayLayer = {
  id: string;
  style: ViewStyle;
};

type ARFilterCameraPreviewProps = {
  active?: boolean;
  cameraFacing: CameraType;
  guideMode: GuideMode;
  previewColorHex: string;
  selectedComparisonMode: ComparisonMode;
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

export function shouldShowARFilterHeaderCopy(): false {
  return false;
}

export function ARFilterCameraPreview({
  active = true,
  cameraFacing,
  guideMode,
  previewColorHex,
  selectedComparisonMode,
}: ARFilterCameraPreviewProps) {
  const previewColorOverlayLayers = getMakeupPreviewColorOverlayLayers();
  const shouldUseUnityPreview = useUnityMakeupNativeViewReady();
  const shouldShowLeftCheekOverlay =
    guideMode !== 'half' || selectedComparisonMode !== 'right';
  const shouldShowRightCheekOverlay =
    guideMode !== 'half' || selectedComparisonMode !== 'left';
  const leftComparisonLabel = selectedComparisonMode === 'left' ? 'After' : 'Before';
  const rightComparisonLabel = selectedComparisonMode === 'left' ? 'Before' : 'After';

  return (
    <FullscreenOverlayLayer>
      {shouldUseUnityPreview && active ? (
        <UnityMakeupNativeView />
      ) : (
        <>
          <LiveCameraLayer active={active} facing={cameraFacing} />
          <View style={styles.previewDim} />
          <View style={[styles.eyePreviewOverlay, {backgroundColor: previewColorHex}]} />
          {shouldShowLeftCheekOverlay ? (
            <View
              style={[
                styles.cheekPreviewOverlayLeft,
                {backgroundColor: previewColorHex},
              ]}
            />
          ) : null}
          {shouldShowRightCheekOverlay ? (
            <View
              style={[
                styles.cheekPreviewOverlayRight,
                {backgroundColor: previewColorHex},
              ]}
            />
          ) : null}
          <View style={[styles.lipPreviewOverlay, {backgroundColor: previewColorHex}]} />
          {previewColorOverlayLayers.map(layer => (
            <View
              key={layer.id}
              style={[layer.style, {backgroundColor: previewColorHex}]}
            />
          ))}
        </>
      )}
      {guideMode === 'half' ? (
        <>
          {selectedComparisonMode !== 'full' ? (
            <View
              style={[
                styles.comparisonShade,
                selectedComparisonMode === 'left'
                  ? styles.comparisonShadeRight
                  : styles.comparisonShadeLeft,
              ]}
            />
          ) : null}
          <View style={styles.comparisonDivider} />
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
    backgroundColor: colors.black,
    bottom: 0,
    left: 0,
    opacity: 0.08,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  eyePreviewOverlay: {
    borderRadius: radius.pill,
    height: 34,
    left: '27%',
    opacity: 0.16,
    position: 'absolute',
    right: '27%',
    top: '38%',
  },
  cheekPreviewOverlayLeft: {
    borderRadius: radius.pill,
    height: 54,
    left: '20%',
    opacity: 0.18,
    position: 'absolute',
    top: '52%',
    transform: [{rotate: '-14deg'}],
    width: 92,
  },
  cheekPreviewOverlayRight: {
    borderRadius: radius.pill,
    height: 54,
    opacity: 0.18,
    position: 'absolute',
    right: '20%',
    top: '52%',
    transform: [{rotate: '14deg'}],
    width: 92,
  },
  lipPreviewOverlay: {
    borderRadius: radius.pill,
    bottom: '24%',
    height: 24,
    left: '39%',
    opacity: 0.4,
    position: 'absolute',
    width: 82,
  },
  comparisonShade: {
    backgroundColor: colors.black,
    bottom: 0,
    opacity: 0.34,
    position: 'absolute',
    top: 0,
    width: '50%',
  },
  comparisonShadeLeft: {
    left: 0,
  },
  comparisonShadeRight: {
    right: 0,
  },
  comparisonDivider: {
    backgroundColor: colors.white,
    bottom: '28%',
    left: '50%',
    opacity: 0.86,
    position: 'absolute',
    top: '24%',
    width: 2,
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
