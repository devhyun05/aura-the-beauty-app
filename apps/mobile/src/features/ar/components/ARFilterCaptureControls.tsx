import React from 'react';
import {StyleSheet} from 'react-native';
import type {CameraType} from 'expo-camera';
import {Camera, SwitchCamera, Video} from 'lucide-react-native';
import {Button, View, XStack} from 'tamagui';

import {colors, iconSize, radius, spacing} from '../../../shared/theme';
import {
  CAMERA_CAPTURE_BUTTON_METRICS,
  CameraCaptureButton,
} from '../../../shared/ui';

export type CaptureMode = 'photo' | 'video';

type ARFilterCaptureControlsProps = {
  cameraFacing: CameraType;
  captureMode: CaptureMode;
  onCameraFacingToggle: () => void;
  onCaptureModeChange: (captureMode: CaptureMode) => void;
  onComplete?: () => void;
};

const CAPTURE_BUTTON_METRICS = {
  outerSize: CAMERA_CAPTURE_BUTTON_METRICS.defaultSize,
  innerScale: CAMERA_CAPTURE_BUTTON_METRICS.innerScale,
} as const;
const CONTROL_SIDE_SLOT_WIDTH = CAPTURE_BUTTON_METRICS.outerSize + spacing.xxl * 2;
const CAMERA_SWITCH_BUTTON_SIZE = iconSize.xl + spacing.md;
export const AR_FILTER_CAMERA_BUTTON_SURFACE_VARIANT = 'liquidGlass' as const;
export const AR_FILTER_CAMERA_BUTTON_INNER_COLOR = 'transparent';
export const AR_FILTER_CAMERA_BUTTON_INNER_TREATMENT = 'transparent' as const;
export const AR_FILTER_CAMERA_CONTROL_DESIGN_TONE = 'bottomSheetGlass' as const;
export const AR_FILTER_CAMERA_CONTROL_ROW_BOTTOM_LIFT = spacing.md;
export const AR_FILTER_CAMERA_CONTROL_ROW_TOP_PADDING = spacing.xs;
export const AR_FILTER_CAMERA_CONTROL_ROW_HORIZONTAL_PADDING = 0;
export const AR_FILTER_CAMERA_MODE_ACTIVE_BACKGROUND_COLOR = colors.textSecondary;
export const AR_FILTER_CAMERA_MODE_ACTIVE_ICON_COLOR = colors.white;
export const AR_FILTER_CAMERA_MODE_INACTIVE_ICON_COLOR = colors.textSecondary;

export function getARFilterCaptureButtonMetrics(): typeof CAPTURE_BUTTON_METRICS {
  return CAPTURE_BUTTON_METRICS;
}

export function ARFilterCaptureControls({
  cameraFacing,
  captureMode,
  onCameraFacingToggle,
  onCaptureModeChange,
  onComplete,
}: ARFilterCaptureControlsProps) {
  const cameraToggleAccessibilityLabel =
    cameraFacing === 'front' ? '후면 카메라로 전환' : '전면 카메라로 전환';

  return (
    <XStack style={styles.captureRow}>
      <View style={styles.controlSideLeft}>
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
        <Button
          accessibilityLabel={cameraToggleAccessibilityLabel}
          accessibilityRole="button"
          onPress={onCameraFacingToggle}
          pressStyle={{scale: 0.96}}
          style={styles.cameraSwitchButton}
          unstyled>
          <SwitchCamera color={colors.textPrimary} size={iconSize.sm} />
        </Button>
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
    borderTopColor: colors.white,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: AR_FILTER_CAMERA_CONTROL_ROW_BOTTOM_LIFT,
    paddingHorizontal: AR_FILTER_CAMERA_CONTROL_ROW_HORIZONTAL_PADDING,
    paddingTop: AR_FILTER_CAMERA_CONTROL_ROW_TOP_PADDING,
  },
  cameraSwitchButton: {
    alignItems: 'center',
    backgroundColor: colors.bottomSheetControlSurface,
    borderColor: colors.white,
    borderRadius: radius.pill,
    borderWidth: 1,
    height: CAMERA_SWITCH_BUTTON_SIZE,
    justifyContent: 'center',
    shadowColor: colors.white,
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.16,
    shadowRadius: 12,
    width: CAMERA_SWITCH_BUTTON_SIZE,
  },
  captureButtonSlot: {
    alignItems: 'center',
    justifyContent: 'center',
    width: CAPTURE_BUTTON_METRICS.outerSize,
  },
  captureModeToggle: {
    backgroundColor: colors.bottomSheetControlSurface,
    borderColor: colors.white,
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
});
