import type {ReactNode} from 'react';
import {
  StyleSheet,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {Image as ImageIcon, RefreshCw} from 'lucide-react-native';
import {Button, Text, View, XStack, YStack} from 'tamagui';

import {
  colors,
  feedbackColors,
  iconSize,
  radius,
  shadows,
  spacing,
  typography,
} from '../theme';

export const FULLSCREEN_OVERLAY_ICON_BUTTON_SIZE = iconSize.xl + spacing.md;
export const FULLSCREEN_OVERLAY_CONTROL_BUTTON_SIZE = iconSize.xl + spacing.xxl;
export const FULLSCREEN_OVERLAY_FLOATING_TOP_OFFSET = spacing.lg;
export const FULLSCREEN_OVERLAY_SEGMENT_ACTIVE_OPACITY = 0.62;
export const FULLSCREEN_OVERLAY_SEGMENT_ACTIVE_BACKGROUND = `rgba(255, 255, 255, ${FULLSCREEN_OVERLAY_SEGMENT_ACTIVE_OPACITY})`;
export const FULLSCREEN_OVERLAY_BLACK_SURFACE_BACKGROUND = colors.blackSurface;
export const CAMERA_UTILITY_ICON_SIZE = iconSize.lg;
export const CAMERA_UTILITY_ICON_STROKE_WIDTH = 2.1;
export const CAMERA_GALLERY_BUTTON_ICON_NAME = 'Image' as const;
export const CAMERA_FACING_TOGGLE_BUTTON_ICON_NAME = 'RefreshCw' as const;

type FullscreenOverlayScreenProps = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  variant?: 'camera' | 'surface';
};

export function FullscreenOverlayScreen({
  children,
  style,
  variant = 'camera',
}: FullscreenOverlayScreenProps) {
  return (
    <View
      style={[
        styles.screen,
        variant === 'surface' ? styles.surfaceScreen : undefined,
        style,
      ]}>
      {children}
    </View>
  );
}

type FullscreenOverlayLayerProps = {
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
};

export function FullscreenOverlayLayer({
  children,
  style,
}: FullscreenOverlayLayerProps) {
  return <View style={[styles.layer, style]}>{children}</View>;
}

type OverlayIconButtonProps = {
  accessibilityLabel: string;
  children: ReactNode;
  onPress?: () => void;
  size?: number;
  style?: StyleProp<ViewStyle>;
  variant?: 'glass' | 'plain' | 'surface';
};

export function OverlayIconButton({
  accessibilityLabel,
  children,
  onPress,
  size = FULLSCREEN_OVERLAY_ICON_BUTTON_SIZE,
  style,
  variant = 'glass',
}: OverlayIconButtonProps) {
  return (
    <Button
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      hitSlop={8}
      onPress={onPress}
      pressStyle={{scale: 0.97}}
      style={[
        styles.iconButton,
        {height: size, width: size},
        variant === 'glass' ? styles.glassIconButton : undefined,
        variant === 'surface' ? styles.surfaceIconButton : undefined,
        style,
      ]}
      unstyled>
      {children}
    </Button>
  );
}

type OverlaySegmentButtonProps = {
  isActive: boolean;
  label: string;
  onPress?: () => void;
  height?: number;
  minHeight?: number;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  tone?: 'glass' | 'solid';
};

export function OverlaySegmentButton({
  height,
  isActive,
  label,
  minHeight = 38,
  onPress,
  style,
  textStyle,
  tone = 'glass',
}: OverlaySegmentButtonProps) {
  const isGlass = tone === 'glass';

  return (
    <Button
      accessibilityRole="button"
      accessibilityState={{selected: isActive}}
      onPress={onPress}
      pressStyle={{scale: 0.98}}
      style={[
        styles.segmentButton,
        {height, minHeight},
        isActive && isGlass ? styles.segmentButtonGlassActive : undefined,
        isActive && !isGlass ? styles.segmentButtonSolidActive : undefined,
        style,
      ]}
      unstyled>
      <Text
        style={[
          styles.segmentText,
          isGlass ? styles.segmentTextGlass : styles.segmentTextSolid,
          isActive && isGlass ? styles.segmentTextGlassActive : undefined,
          isActive && !isGlass ? styles.segmentTextSolidActive : undefined,
          textStyle,
        ]}>
        {label}
      </Text>
    </Button>
  );
}

type OverlayChipButtonProps = {
  isActive: boolean;
  label: string;
  onPress: () => void;
  height?: number;
  paddingHorizontal?: number;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
};

export function OverlayChipButton({
  height = 36,
  isActive,
  label,
  onPress,
  paddingHorizontal = spacing.lg,
  style,
  textStyle,
}: OverlayChipButtonProps) {
  return (
    <Button
      accessibilityRole="button"
      accessibilityState={{selected: isActive}}
      onPress={onPress}
      pressStyle={{scale: 0.97}}
      style={[
        styles.chipButton,
        {height, paddingHorizontal},
        isActive ? styles.chipButtonActive : undefined,
        style,
      ]}
      unstyled>
      <Text
        style={[
          styles.chipText,
          isActive ? styles.chipTextActive : undefined,
          textStyle,
        ]}>
        {label}
      </Text>
    </Button>
  );
}

type BottomOverlayPanelProps = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  variant?: 'card' | 'sheet';
};

export function BottomOverlayPanel({
  children,
  style,
  variant = 'card',
}: BottomOverlayPanelProps) {
  return (
    <YStack
      style={[
        variant === 'card' ? styles.cardPanel : styles.sheetPanel,
        style,
      ]}>
      {children}
    </YStack>
  );
}

type OverlayTopBarProps = {
  eyebrow?: string;
  leftSlot: ReactNode;
  rightSlot?: ReactNode;
  style?: StyleProp<ViewStyle>;
  title: string;
};

export function OverlayTopBar({
  eyebrow,
  leftSlot,
  rightSlot,
  style,
  title,
}: OverlayTopBarProps) {
  return (
    <XStack style={[styles.topBar, style]}>
      {leftSlot}

      <YStack style={styles.topBarCopy}>
        {eyebrow ? <Text style={styles.topBarEyebrow}>{eyebrow}</Text> : null}
        <Text numberOfLines={1} style={styles.topBarTitle}>
          {title}
        </Text>
      </YStack>

      {rightSlot}
    </XStack>
  );
}

type OverlayAdjustmentTabsProps = {
  activeTab: 'location' | 'style';
  onPressLocation?: () => void;
  onPressStyle?: () => void;
  style?: StyleProp<ViewStyle>;
};

export function OverlayAdjustmentTabs({
  activeTab,
  onPressLocation,
  onPressStyle,
  style,
}: OverlayAdjustmentTabsProps) {
  return (
    <XStack style={[styles.adjustmentTabs, style]}>
      <OverlaySegmentButton
        isActive={activeTab === 'location'}
        label="형태 수정"
        onPress={onPressLocation}
      />
      <OverlaySegmentButton
        isActive={activeTab === 'style'}
        label="프리셋 수정"
        onPress={onPressStyle}
      />
    </XStack>
  );
}

type OverlayPanelSectionProps = {
  children: ReactNode;
  label: string;
  style?: StyleProp<ViewStyle>;
};

export function OverlayPanelSection({
  children,
  label,
  style,
}: OverlayPanelSectionProps) {
  return (
    <YStack style={[styles.panelSection, style]}>
      <Text style={styles.panelLabel}>{label}</Text>
      {children}
    </YStack>
  );
}

type OverlaySaveButtonProps = {
  accessibilityLabel: string;
  label?: string;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
};

export function OverlaySaveButton({
  accessibilityLabel,
  label = '현재 필터 저장',
  onPress,
  style,
}: OverlaySaveButtonProps) {
  return (
    <Button
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      onPress={onPress}
      pressStyle={{scale: 0.98}}
      style={[styles.saveButton, style]}
      unstyled>
      <Text style={styles.saveButtonText}>{label}</Text>
    </Button>
  );
}

type FloatingOverlayIconButtonProps = {
  accessibilityLabel: string;
  children: ReactNode;
  onPress?: () => void;
  rightOffset?: number;
  size?: number;
  style?: StyleProp<ViewStyle>;
  topOffset?: number;
  variant?: 'glass' | 'plain' | 'surface';
};

export function FloatingOverlayIconButton({
  accessibilityLabel,
  children,
  onPress,
  rightOffset = spacing.xl,
  size = FULLSCREEN_OVERLAY_CONTROL_BUTTON_SIZE,
  style,
  topOffset = FULLSCREEN_OVERLAY_FLOATING_TOP_OFFSET,
  variant = 'plain',
}: FloatingOverlayIconButtonProps) {
  const insets = useSafeAreaInsets();

  return (
    <OverlayIconButton
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      size={size}
      style={[
        styles.floatingIconButton,
        {
          right: rightOffset,
          top: insets.top + topOffset,
        },
        style,
      ]}
      variant={variant}>
      {children}
    </OverlayIconButton>
  );
}

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
  size = FULLSCREEN_OVERLAY_CONTROL_BUTTON_SIZE,
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

type CameraGalleryButtonProps = Omit<CameraUtilityButtonProps, 'children'> & {
  iconColor?: string;
};

export function CameraGalleryButton({
  accessibilityLabel,
  disabled,
  iconColor = colors.white,
  onPress,
  size,
  style,
}: CameraGalleryButtonProps) {
  return (
    <CameraUtilityButton
      accessibilityLabel={accessibilityLabel}
      disabled={disabled}
      onPress={onPress}
      size={size}
      style={style}>
      <ImageIcon
        color={iconColor}
        size={CAMERA_UTILITY_ICON_SIZE}
        strokeWidth={CAMERA_UTILITY_ICON_STROKE_WIDTH}
      />
    </CameraUtilityButton>
  );
}

type CameraFacingToggleButtonProps = Omit<
  CameraUtilityButtonProps,
  'accessibilityLabel' | 'children'
> & {
  accessibilityLabel?: string;
  cameraFacing: 'front' | 'back';
  iconColor?: string;
};

export function CameraFacingToggleButton({
  accessibilityLabel,
  cameraFacing,
  disabled,
  iconColor = colors.white,
  onPress,
  size,
  style,
}: CameraFacingToggleButtonProps) {
  return (
    <CameraUtilityButton
      accessibilityLabel={
        accessibilityLabel ??
        (cameraFacing === 'front' ? '후면 카메라로 전환' : '전면 카메라로 전환')
      }
      disabled={disabled}
      onPress={onPress}
      size={size}
      style={style}>
      <RefreshCw
        color={iconColor}
        size={CAMERA_UTILITY_ICON_SIZE}
        strokeWidth={CAMERA_UTILITY_ICON_STROKE_WIDTH}
      />
    </CameraUtilityButton>
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
  sideSlotSize = FULLSCREEN_OVERLAY_CONTROL_BUTTON_SIZE,
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
  screen: {
    backgroundColor: FULLSCREEN_OVERLAY_BLACK_SURFACE_BACKGROUND,
    flex: 1,
    overflow: 'hidden',
  },
  surfaceScreen: {
    backgroundColor: colors.background,
  },
  layer: {
    backgroundColor: FULLSCREEN_OVERLAY_BLACK_SURFACE_BACKGROUND,
    bottom: 0,
    left: 0,
    overflow: 'hidden',
    position: 'absolute',
    right: 0,
    top: 0,
  },
  iconButton: {
    alignItems: 'center',
    borderRadius: radius.pill,
    justifyContent: 'center',
    padding: 0,
  },
  glassIconButton: {
    backgroundColor: colors.glassSurface,
    borderColor: colors.white,
    borderWidth: 1,
  },
  surfaceIconButton: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
  },
  segmentButton: {
    alignItems: 'center',
    borderRadius: radius.pill,
    flex: 1,
    justifyContent: 'center',
  },
  segmentButtonGlassActive: {
    backgroundColor: FULLSCREEN_OVERLAY_SEGMENT_ACTIVE_BACKGROUND,
  },
  segmentButtonSolidActive: {
    backgroundColor: FULLSCREEN_OVERLAY_BLACK_SURFACE_BACKGROUND,
  },
  segmentText: {
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.sm,
  },
  segmentTextGlass: {
    color: colors.white,
  },
  segmentTextGlassActive: {
    color: colors.black,
  },
  segmentTextSolid: {
    color: colors.textPrimary,
  },
  segmentTextSolidActive: {
    color: colors.white,
  },
  chipButton: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: 1,
    justifyContent: 'center',
  },
  chipButtonActive: {
    backgroundColor: FULLSCREEN_OVERLAY_BLACK_SURFACE_BACKGROUND,
    borderColor: colors.transparent,
  },
  chipText: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.sm,
  },
  chipTextActive: {
    color: colors.white,
  },
  cardPanel: {
    backgroundColor: colors.bottomSheetSurface,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    bottom: spacing.md,
    gap: spacing.lg,
    left: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    position: 'absolute',
    right: spacing.md,
    shadowColor: shadows.soft.shadowColor,
    shadowOffset: {width: 0, height: -6},
    shadowOpacity: shadows.soft.shadowOpacity,
    shadowRadius: shadows.soft.shadowRadius,
    zIndex: 4,
  },
  sheetPanel: {
    backgroundColor: colors.bottomSheetSurface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    shadowColor: shadows.soft.shadowColor,
    shadowOffset: {width: 0, height: -6},
    shadowOpacity: 0.08,
    shadowRadius: 18,
  },
  topBar: {
    alignItems: 'center',
    gap: spacing.md,
  },
  topBarCopy: {
    flex: 1,
    gap: spacing.xs,
    minWidth: 0,
  },
  topBarEyebrow: {
    color: colors.textTertiary,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
    letterSpacing: 1.2,
    lineHeight: typography.lineHeight.xs,
  },
  topBarTitle: {
    color: colors.white,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.lg,
  },
  adjustmentTabs: {
    backgroundColor: colors.glassSurface,
    borderColor: colors.white,
    borderRadius: radius.pill,
    borderWidth: 1,
    padding: spacing.xs,
  },
  panelSection: {
    gap: spacing.sm,
  },
  panelLabel: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.sm,
  },
  saveButton: {
    alignItems: 'center',
    backgroundColor: FULLSCREEN_OVERLAY_BLACK_SURFACE_BACKGROUND,
    borderRadius: radius.pill,
    height: 52,
    justifyContent: 'center',
  },
  saveButtonText: {
    color: colors.white,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.md,
  },
  floatingIconButton: {
    position: 'absolute',
    zIndex: 20,
  },
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
    backgroundColor: colors.liquidGlassSurface,
    borderColor: colors.liquidGlassBorder,
    borderWidth: 1,
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
