import React, {type ReactNode} from 'react';
import {
  Pressable,
  StyleSheet,
  View,
  type GestureResponderEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import {colors, radius} from '../theme';

export const CAMERA_CAPTURE_BUTTON_METRICS = {
  defaultSize: 50,
  borderWidth: 2,
  innerScale: 0.56,
} as const;

export const CAMERA_CAPTURE_BUTTON_BACKGROUND = 'rgba(17, 17, 17, 0.9)';
export const CAMERA_CAPTURE_BUTTON_BORDER = 'rgba(255, 255, 255, 0.86)';

type CameraCaptureButtonSurfaceProps = {
  children?: ReactNode;
  disabled?: boolean;
  innerColor?: string;
  showInnerDot?: boolean;
  size?: number;
  style?: StyleProp<ViewStyle>;
};

type CameraCaptureButtonProps = CameraCaptureButtonSurfaceProps & {
  accessibilityLabel: string;
  onPress?: (event: GestureResponderEvent) => void;
  testID?: string;
};

export function CameraCaptureButtonSurface({
  children,
  disabled = false,
  innerColor = colors.white,
  showInnerDot = true,
  size = CAMERA_CAPTURE_BUTTON_METRICS.defaultSize,
  style,
}: CameraCaptureButtonSurfaceProps) {
  const innerSize = Math.round(size * CAMERA_CAPTURE_BUTTON_METRICS.innerScale);

  return (
    <View
      style={[
        styles.surface,
        {
          height: size,
          opacity: disabled ? 0.58 : 1,
          width: size,
        },
        style,
      ]}>
      {children ??
        (showInnerDot ? (
          <View
            style={[
              styles.innerDot,
              {
                backgroundColor: innerColor,
                height: innerSize,
                width: innerSize,
              },
            ]}
          />
        ) : null)}
    </View>
  );
}

export function CameraCaptureButton({
  accessibilityLabel,
  children,
  disabled = false,
  innerColor,
  onPress,
  showInnerDot,
  size,
  style,
  testID,
}: CameraCaptureButtonProps) {
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={{disabled}}
      disabled={disabled}
      hitSlop={12}
      onPress={onPress}
      style={({pressed}) => [
        {
          opacity: pressed ? 0.72 : 1,
        },
        style,
      ]}
      testID={testID}>
      <CameraCaptureButtonSurface
        disabled={disabled}
        innerColor={innerColor}
        showInnerDot={showInnerDot}
        size={size}>
        {children}
      </CameraCaptureButtonSurface>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  innerDot: {
    borderRadius: radius.pill,
  },
  surface: {
    alignItems: 'center',
    backgroundColor: CAMERA_CAPTURE_BUTTON_BACKGROUND,
    borderColor: CAMERA_CAPTURE_BUTTON_BORDER,
    borderRadius: radius.pill,
    borderWidth: CAMERA_CAPTURE_BUTTON_METRICS.borderWidth,
    justifyContent: 'center',
    shadowColor: colors.black,
    shadowOffset: {width: 0, height: 6},
    shadowOpacity: 0.14,
    shadowRadius: 10,
  },
});
