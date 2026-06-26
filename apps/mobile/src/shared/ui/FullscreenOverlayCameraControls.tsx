import type {ReactNode} from 'react';
import {StyleSheet, type StyleProp, type ViewStyle} from 'react-native';
import {Button, Text, View, XStack} from 'tamagui';

import {colors, feedbackColors, iconSize, radius, spacing, typography} from '../theme';

const CAMERA_CONTROL_BUTTON_SIZE = iconSize.xl + spacing.xxl;

type CameraUtilityButtonProps = {
  accessibilityLabel: string;
  children: ReactNode;
  disabled?: boolean;
  onPress?: () => void;
  size?: number;
  style?: StyleProp<ViewStyle>;
};

export function CameraUtilityButton({
  accessibilityLabel,
  children,
  disabled = false,
  onPress,
  size = CAMERA_CONTROL_BUTTON_SIZE,
  style,
}: CameraUtilityButtonProps) {
  return (
    <Button
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      disabled={disabled}
      hitSlop={12}
      onPress={onPress}
      pressStyle={{scale: 0.96}}
      style={[
        styles.cameraUtilityButton,
        {
          height: size,
          opacity: disabled ? 0.46 : 1,
          width: size,
        },
        style,
      ]}
      unstyled>
      {children}
    </Button>
  );
}

type CameraCaptureControlRowProps = {
  bottom: number;
  centerSlot: ReactNode;
  horizontalPadding?: number;
  leftSlot?: ReactNode;
  rightSlot?: ReactNode;
  sideSlotSize?: number;
  style?: StyleProp<ViewStyle>;
};

export function CameraCaptureControlRow({
  bottom,
  centerSlot,
  horizontalPadding = spacing.xxl + spacing.sm,
  leftSlot,
  rightSlot,
  sideSlotSize = CAMERA_CONTROL_BUTTON_SIZE,
  style,
}: CameraCaptureControlRowProps) {
  const sideStyle = {width: sideSlotSize};

  return (
    <XStack
      style={[
        styles.cameraControlRow,
        {
          bottom,
          paddingHorizontal: horizontalPadding,
        },
        style,
      ]}>
      <View style={[styles.cameraControlSide, sideStyle]}>{leftSlot}</View>
      <View style={styles.cameraControlCenter}>{centerSlot}</View>
      <View style={[styles.cameraControlSide, sideStyle]}>{rightSlot}</View>
    </XStack>
  );
}

type CameraModeSwitchProps = {
  bottom: number;
  galleryAccessibilityLabel: string;
  isGalleryDisabled?: boolean;
  onPressGallery?: () => void;
  style?: StyleProp<ViewStyle>;
};

export function CameraModeSwitch({
  bottom,
  galleryAccessibilityLabel,
  isGalleryDisabled = false,
  onPressGallery,
  style,
}: CameraModeSwitchProps) {
  return (
    <XStack style={[styles.cameraModeSwitch, {bottom}, style]}>
      <Button accessibilityRole="button" style={styles.cameraModeActive} unstyled>
        <Text style={styles.cameraModeActiveText}>사진</Text>
      </Button>
      <Button
        accessibilityLabel={galleryAccessibilityLabel}
        accessibilityRole="button"
        accessibilityState={{disabled: isGalleryDisabled}}
        disabled={isGalleryDisabled}
        onPress={onPressGallery}
        pressStyle={{opacity: 0.7}}
        style={[
          styles.cameraModeInactive,
          isGalleryDisabled ? styles.cameraModeInactiveDisabled : undefined,
        ]}
        unstyled>
        <Text style={styles.cameraModeInactiveText}>갤러리</Text>
      </Button>
    </XStack>
  );
}

const styles = StyleSheet.create({
  cameraUtilityButton: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  cameraControlRow: {
    alignItems: 'center',
    justifyContent: 'space-between',
    left: 0,
    position: 'absolute',
    right: 0,
  },
  cameraControlSide: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  cameraControlCenter: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  cameraModeSwitch: {
    alignItems: 'center',
    backgroundColor: feedbackColors.overlayStrong,
    borderRadius: radius.pill,
    flexDirection: 'row',
    height: 44,
    left: spacing.xl,
    padding: spacing.xs,
    position: 'absolute',
    right: spacing.xl,
  },
  cameraModeActive: {
    alignItems: 'center',
    backgroundColor: colors.white,
    borderRadius: radius.pill,
    flex: 1,
    height: 36,
    justifyContent: 'center',
  },
  cameraModeActiveText: {
    color: feedbackColors.text,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.sm,
  },
  cameraModeInactive: {
    alignItems: 'center',
    flex: 1,
    height: 36,
    justifyContent: 'center',
  },
  cameraModeInactiveDisabled: {
    opacity: 0.46,
  },
  cameraModeInactiveText: {
    color: feedbackColors.text,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.sm,
  },
});
