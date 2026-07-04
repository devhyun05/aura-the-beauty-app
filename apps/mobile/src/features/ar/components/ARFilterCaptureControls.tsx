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
                color={captureMode === 'photo' ? colors.black : colors.white}
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
                color={captureMode === 'video' ? colors.black : colors.white}
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
          onPress={onComplete}
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
          <SwitchCamera color={colors.white} size={iconSize.sm} />
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
    borderTopColor: colors.divider,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  cameraSwitchButton: {
    alignItems: 'center',
    backgroundColor: colors.black,
    borderRadius: radius.pill,
    height: CAMERA_SWITCH_BUTTON_SIZE,
    justifyContent: 'center',
    width: CAMERA_SWITCH_BUTTON_SIZE,
  },
  captureButtonSlot: {
    alignItems: 'center',
    justifyContent: 'center',
    width: CAPTURE_BUTTON_METRICS.outerSize,
  },
  captureModeToggle: {
    backgroundColor: colors.black,
    borderRadius: radius.pill,
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
    backgroundColor: colors.white,
  },
});
