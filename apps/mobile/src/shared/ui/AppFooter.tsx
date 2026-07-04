import React, {type ReactNode} from 'react';
import {StyleSheet} from 'react-native';
import {Button, Text, XStack, YStack} from 'tamagui';

import {colors, iconSize, radius, shadows, spacing, typography} from '../theme';
import {CameraCaptureButtonSurface} from './CameraCaptureButton';
import {
  BrushFooterIcon,
  CameraFooterIcon,
  HomeFooterIcon,
} from './FooterIcons';

export type FooterTabKey = 'home' | 'capture' | 'custom';

export const APP_FOOTER_HORIZONTAL_PADDING = (spacing.xxl + spacing.md) as 36;
export const APP_FOOTER_BAR_HEIGHT = 52;
export const APP_FOOTER_TAB_HEIGHT = 40;
export const APP_FOOTER_ACTIVE_TAB_BACKGROUND = 'rgba(43, 43, 43, 0.62)';
export const APP_FOOTER_CAPTURE_BUBBLE_SIZE = 54;
export const APP_FOOTER_ICON_SIZE = iconSize.sm;
export const APP_FOOTER_CAPTURE_ICON_SIZE = iconSize.md;
export const APP_FOOTER_BAR_OVERFLOW = 'visible';
export const APP_FOOTER_FLOATING_HOST_BASE_HEIGHT = 64;
export const APP_FOOTER_SHOW_LABELS_BY_DEFAULT = false;
export const APP_FOOTER_GLASS_BACKGROUND = 'rgba(255, 255, 255, 0.72)';
export const APP_FOOTER_GLASS_BORDER = 'rgba(255, 255, 255, 0.82)';
export const APP_FOOTER_GLASS_HIGHLIGHT = 'rgba(255, 255, 255, 0.42)';

type FooterTabItem = {
  key: FooterTabKey;
  label: string;
  accessibilityLabel: string;
  icon: (color: string) => ReactNode;
};

type AppFooterProps = {
  activeTab?: FooterTabKey;
  bottomInset?: number;
  floating?: boolean;
  onTabPress?: (tab: FooterTabKey) => void;
  showLabels?: boolean;
};

const footerItems: FooterTabItem[] = [
  {
    key: 'home',
    label: '홈',
    accessibilityLabel: '홈으로 이동',
    icon: color => <HomeFooterIcon color={color} size={APP_FOOTER_ICON_SIZE} />,
  },
  {
    key: 'capture',
    label: '실시간 AR',
    accessibilityLabel: '실시간 AR 화면으로 이동',
    icon: color => (
      <CameraFooterIcon color={color} size={APP_FOOTER_CAPTURE_ICON_SIZE} />
    ),
  },
  {
    key: 'custom',
    label: 'AI 피드백',
    accessibilityLabel: 'AI 피드백 사진 선택 열기',
    icon: color => <BrushFooterIcon color={color} size={APP_FOOTER_ICON_SIZE} />,
  },
];

export function AppFooter({
  activeTab,
  bottomInset = 0,
  floating = false,
  onTabPress,
  showLabels = APP_FOOTER_SHOW_LABELS_BY_DEFAULT,
}: AppFooterProps) {
  return (
    <YStack
      pointerEvents="box-none"
      style={[
        styles.footerArea,
        floating ? styles.floatingFooterArea : styles.dockedFooterArea,
        {
          paddingBottom: Math.max(bottomInset, spacing.md),
        },
      ]}>
      <XStack style={styles.footerBar}>
        <YStack pointerEvents="none" style={styles.footerGlassHighlight} />
        {footerItems.map(item => {
          const isActive = item.key === activeTab;
          const isCaptureTab = item.key === 'capture';
          const iconColor = isCaptureTab || isActive
            ? colors.white
            : colors.textPrimary;
          const labelColor = isCaptureTab
            ? colors.textPrimary
            : isActive
              ? colors.white
              : colors.textPrimary;

          return (
            <Button
              key={item.key}
              unstyled
              accessibilityRole="tab"
              accessibilityState={{selected: isActive}}
              accessibilityLabel={item.accessibilityLabel}
              hitSlop={6}
              pressStyle={{scale: isCaptureTab ? 0.96 : 0.98}}
              style={[
                isCaptureTab ? styles.captureTabButton : styles.tabButton,
                !isCaptureTab && isActive ? styles.activeTabButton : undefined,
              ]}
              onPress={() => onTabPress?.(item.key)}>
              <YStack
                style={[
                  isCaptureTab ? styles.captureTabContent : styles.tabContent,
                  !showLabels ? styles.iconOnlyTabContent : undefined,
                ]}>
                {isCaptureTab ? (
                  <CameraCaptureButtonSurface
                    showInnerDot={false}
                    size={APP_FOOTER_CAPTURE_BUBBLE_SIZE}>
                    {item.icon(iconColor)}
                  </CameraCaptureButtonSurface>
                ) : (
                  item.icon(iconColor)
                )}
                {showLabels ? (
                  <Text
                    numberOfLines={1}
                    style={[styles.tabLabel, {color: labelColor}]}>
                    {item.label}
                  </Text>
                ) : null}
              </YStack>
            </Button>
          );
        })}
      </XStack>
    </YStack>
  );
}

const styles = StyleSheet.create({
  footerArea: {
    paddingHorizontal: APP_FOOTER_HORIZONTAL_PADDING,
    paddingTop: spacing.sm,
  },
  dockedFooterArea: {
    backgroundColor: colors.background,
  },
  floatingFooterArea: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    zIndex: 20,
  },
  footerBar: {
    alignItems: 'center',
    backgroundColor: APP_FOOTER_GLASS_BACKGROUND,
    borderColor: APP_FOOTER_GLASS_BORDER,
    borderRadius: radius.pill,
    borderWidth: 1,
    flexDirection: 'row',
    height: APP_FOOTER_BAR_HEIGHT,
    justifyContent: 'space-between',
    overflow: APP_FOOTER_BAR_OVERFLOW,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xs,
    shadowColor: shadows.soft.shadowColor,
    shadowOffset: {width: 0, height: -4},
    shadowOpacity: 0.12,
    shadowRadius: 16,
  },
  footerGlassHighlight: {
    backgroundColor: APP_FOOTER_GLASS_HIGHLIGHT,
    borderRadius: radius.pill,
    height: 12,
    left: spacing.lg,
    position: 'absolute',
    right: spacing.lg,
    top: 1,
  },
  tabButton: {
    alignItems: 'center',
    borderRadius: radius.pill,
    flex: 1,
    height: APP_FOOTER_TAB_HEIGHT,
    justifyContent: 'center',
  },
  activeTabButton: {
    backgroundColor: APP_FOOTER_ACTIVE_TAB_BACKGROUND,
  },
  captureTabButton: {
    alignItems: 'center',
    alignSelf: 'stretch',
    flex: 1,
    justifyContent: 'center',
    minWidth: 0,
  },
  captureTabContent: {
    alignItems: 'center',
    gap: spacing.xs,
    justifyContent: 'center',
    transform: [{translateY: -7}],
  },
  tabContent: {
    alignItems: 'center',
    gap: spacing.xs,
    justifyContent: 'center',
    minWidth: 0,
  },
  iconOnlyTabContent: {
    gap: 0,
  },
  tabLabel: {
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.xs,
  },
});
