import React from 'react';
import {StyleSheet} from 'react-native';
import {Camera, Video} from 'lucide-react-native';
import {Button, XStack} from 'tamagui';

import {colors, iconSize, radius, spacing} from '../../../shared/theme';
import {
  CAMERA_CAPTURE_BUTTON_METRICS,
  CameraCaptureButton,
} from '../../../shared/ui';

export type CaptureMode = 'photo' | 'video';

type ARFilterCaptureControlsProps = {
  captureMode: CaptureMode;
  onCaptureModeChange: (captureMode: CaptureMode) => void;
  onComplete?: () => void;
};

const CAPTURE_BUTTON_METRICS = {
  outerSize: CAMERA_CAPTURE_BUTTON_METRICS.defaultSize,
  innerScale: CAMERA_CAPTURE_BUTTON_METRICS.innerScale,
} as const;

export function getARFilterCaptureButtonMetrics(): typeof CAPTURE_BUTTON_METRICS {
  return CAPTURE_BUTTON_METRICS;
}

export function ARFilterCaptureControls({
  captureMode,
  onCaptureModeChange,
  onComplete,
}: ARFilterCaptureControlsProps) {
  return (
    <XStack style={styles.captureRow}>
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

      <CameraCaptureButton
        accessibilityLabel={
          captureMode === 'photo'
            ? 'AR 사진 촬영 후 홈으로 이동'
            : 'AR 동영상 촬영 후 홈으로 이동'
        }
        onPress={onComplete}
      />
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
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
  },
  captureModeToggle: {
    backgroundColor: colors.black,
    borderRadius: radius.pill,
    gap: spacing.xs,
    left: spacing.xl,
    padding: spacing.xs,
    position: 'absolute',
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
