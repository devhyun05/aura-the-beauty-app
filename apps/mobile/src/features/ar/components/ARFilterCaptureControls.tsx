import React from 'react';
import {StyleSheet} from 'react-native';
import type {CameraType} from 'expo-camera';
import {Camera, Video} from 'lucide-react-native';
import {Button, View, XStack} from 'tamagui';

import {colors, iconSize, radius, spacing} from '../../../shared/theme';
import {
  CAMERA_FACING_TOGGLE_BUTTON_ICON_NAME,
  CAMERA_GALLERY_BUTTON_ICON_NAME,
  CAMERA_CAPTURE_BUTTON_METRICS,
  CameraCaptureButton,
  CameraFacingToggleButton,
  CameraGalleryButton,
} from '../../../shared/ui';

export type CaptureMode = 'photo' | 'video';

type ARFilterCaptureControlsProps = {
  cameraFacing: CameraType;
  captureMode: CaptureMode;
  isGalleryDisabled?: boolean;
  onCameraFacingToggle: () => void;
  onCaptureModeChange: (captureMode: CaptureMode) => void;
  onComplete?: () => void;
  onOpenGallery?: () => void;
};

const CAPTURE_BUTTON_METRICS = {
  outerSize: CAMERA_CAPTURE_BUTTON_METRICS.defaultSize,
  innerScale: CAMERA_CAPTURE_BUTTON_METRICS.innerScale,
} as const;
const CAMERA_SWITCH_BUTTON_SIZE = iconSize.xl + spacing.xxl;
const CAPTURE_MODE_TOGGLE_WIDTH = 38 * 2 + spacing.xs * 3;
const CONTROL_SIDE_SLOT_WIDTH =
  CAMERA_SWITCH_BUTTON_SIZE + spacing.sm + CAPTURE_MODE_TOGGLE_WIDTH;
export const AR_FILTER_CAMERA_BUTTON_SURFACE_VARIANT = 'dark' as const;
export const AR_FILTER_CAMERA_BUTTON_INNER_COLOR = colors.white;
export const AR_FILTER_CAMERA_BUTTON_INNER_TREATMENT = 'solidDot' as const;
export const AR_FILTER_CAMERA_CONTROL_DESIGN_TONE = 'faceCaptureControls' as const;
export const AR_FILTER_CAMERA_GALLERY_BUTTON_PLACEMENT =
  'leftOfCaptureModeToggle' as const;
export const AR_FILTER_CAMERA_GALLERY_ICON_SOURCE = CAMERA_GALLERY_BUTTON_ICON_NAME;
export const AR_FILTER_CAMERA_FACING_TOGGLE_ICON_SOURCE =
  CAMERA_FACING_TOGGLE_BUTTON_ICON_NAME;
export const AR_FILTER_CAMERA_CONTROL_ROW_BOTTOM_LIFT = spacing.md;
export const AR_FILTER_CAMERA_CONTROL_ROW_TOP_PADDING = spacing.xs;
export const AR_FILTER_CAMERA_CONTROL_ROW_HORIZONTAL_PADDING = 0;
export const AR_FILTER_CAMERA_MODE_ACTIVE_BACKGROUND_COLOR = colors.liquidGlassSurface;
export const AR_FILTER_CAMERA_MODE_ACTIVE_ICON_COLOR = colors.black;
export const AR_FILTER_CAMERA_MODE_INACTIVE_ICON_COLOR = colors.white;

export function getARFilterCaptureButtonMetrics(): typeof CAPTURE_BUTTON_METRICS {
  return CAPTURE_BUTTON_METRICS;
}

export function ARFilterCaptureControls({
  cameraFacing,
  captureMode,
  isGalleryDisabled = false,
  onCameraFacingToggle,
  onCaptureModeChange,
  onComplete,
  onOpenGallery,
}: ARFilterCaptureControlsProps) {
  return (
    <XStack style={styles.captureRow}>
      <View style={styles.controlSideLeft}>
        <XStack style={styles.leftControlCluster}>
          <CameraGalleryButton
            accessibilityLabel="갤러리에서 사진 선택"
            disabled={isGalleryDisabled || !onOpenGallery}
            onPress={onOpenGallery}
          />
          <XStack style={styles.captureModeToggle}>
            <IconModeButton
              accessibilityLabel="사진 모드"
              icon={
                <Camera
                  color={
                    captureMode === 'photo'
                      ? AR_FILTER_CAMERA_MODE_ACTIVE_ICON_COLOR
                      : AR_FILTER_CAMERA_MODE_INACTIVE_ICON_COLOR
                  }
                  size={iconSize.sm}
                />
              }
              isActive={captureMode === 'photo'}
              onPress={() => onCaptureModeChange('photo')}
            />
            <IconModeButton
              accessibilityLabel="동영상 모드"
              icon={
                <Video
                  color={
                    captureMode === 'video'
                      ? AR_FILTER_CAMERA_MODE_ACTIVE_ICON_COLOR
                      : AR_FILTER_CAMERA_MODE_INACTIVE_ICON_COLOR
                  }
                  size={iconSize.sm}
                />
              }
              isActive={captureMode === 'video'}
              onPress={() => onCaptureModeChange('video')}
            />
          </XStack>
        </XStack>
      </View>

      <View style={styles.captureButtonSlot}>
        <CameraCaptureButton
          accessibilityLabel={
            captureMode === 'photo'
              ? 'AR 사진 촬영 후 홈으로 이동'
              : 'AR 동영상 촬영 후 홈으로 이동'
          }
          innerColor={AR_FILTER_CAMERA_BUTTON_INNER_COLOR}
          onPress={onComplete}
          variant={AR_FILTER_CAMERA_BUTTON_SURFACE_VARIANT}
        />
      </View>

      <View style={styles.controlSideRight}>
        <CameraFacingToggleButton
          cameraFacing={cameraFacing}
          onPress={onCameraFacingToggle}
          size={CAMERA_SWITCH_BUTTON_SIZE}
          style={styles.cameraSwitchButton}
        />
      </View>
    </XStack>
  );
}

type IconModeButtonProps = {
  accessibilityLabel: string;
  icon: React.ReactNode;
  isActive: boolean;
  onPress: () => void;
};

function IconModeButton({accessibilityLabel, icon, isActive, onPress}: IconModeButtonProps) {
  return (
    <Button
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={{selected: isActive}}
      onPress={onPress}
      pressStyle={{scale: 0.96}}
      style={[styles.modeButton, isActive ? styles.modeButtonActive : undefined]}
      unstyled>
      {icon}
    </Button>
  );
}

const styles = StyleSheet.create({
  captureRow: {
    alignItems: 'center',
    borderTopWidth: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: AR_FILTER_CAMERA_CONTROL_ROW_BOTTOM_LIFT,
    paddingHorizontal: AR_FILTER_CAMERA_CONTROL_ROW_HORIZONTAL_PADDING,
    paddingTop: AR_FILTER_CAMERA_CONTROL_ROW_TOP_PADDING,
  },
  cameraSwitchButton: {
    borderRadius: radius.pill,
  },
  captureButtonSlot: {
    alignItems: 'center',
    justifyContent: 'center',
    width: CAPTURE_BUTTON_METRICS.outerSize,
  },
  captureModeToggle: {
    backgroundColor: colors.glassSurface,
    borderColor: colors.liquidGlassBorder,
    borderRadius: radius.pill,
    borderWidth: 1,
    gap: spacing.xs,
    padding: spacing.xs,
  },
  controlSideLeft: {
    alignItems: 'flex-start',
    justifyContent: 'center',
    width: CONTROL_SIDE_SLOT_WIDTH,
  },
  controlSideRight: {
    alignItems: 'flex-end',
    justifyContent: 'center',
    width: CONTROL_SIDE_SLOT_WIDTH,
  },
  modeButton: {
    alignItems: 'center',
    borderRadius: radius.pill,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  modeButtonActive: {
    backgroundColor: AR_FILTER_CAMERA_MODE_ACTIVE_BACKGROUND_COLOR,
  },
  leftControlCluster: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
});
