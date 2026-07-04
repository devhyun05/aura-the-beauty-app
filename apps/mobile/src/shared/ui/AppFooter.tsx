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

export const APP_FOOTER_HORIZONTAL_PADDING = spacing.xl;
export const APP_FOOTER_BAR_HEIGHT = 64;
export const APP_FOOTER_TAB_HEIGHT = 42;
export const APP_FOOTER_ACTIVE_TAB_BACKGROUND = 'rgba(43, 43, 43, 0.62)';
export const APP_FOOTER_CAPTURE_BUBBLE_SIZE = APP_FOOTER_BAR_HEIGHT;
export const APP_FOOTER_CAPTURE_SLOT_WIDTH = APP_FOOTER_BAR_HEIGHT;
export const APP_FOOTER_ICON_SIZE = iconSize.sm;
export const APP_FOOTER_CAPTURE_ICON_SIZE = iconSize.lg;
export const APP_FOOTER_BAR_OVERFLOW = 'visible';
export const APP_FOOTER_FLOATING_HOST_BASE_HEIGHT = 76;
export const APP_FOOTER_SHOW_LABELS_BY_DEFAULT = false;
export const APP_FOOTER_GLASS_BACKGROUND = 'rgba(255, 255, 255, 0.72)';
export const APP_FOOTER_GLASS_BORDER = 'rgba(255, 255, 255, 0.82)';
export const APP_FOOTER_GLASS_HIGHLIGHT = 'rgba(255, 255, 255, 0.42)';
export const APP_FOOTER_SIDE_TAB_WIDTH = 106;

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
    label: '메이크업 피드백',
    accessibilityLabel: '메이크업 피드백 선택 열기',
    icon: color => <BrushFooterIcon color={color} size={APP_FOOTER_ICON_SIZE} />,
  },
];

const footerTabItems = footerItems.filter(item => item.key !== 'capture');
const captureFooterItem = footerItems.find(item => item.key === 'capture');

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
      <XStack style={styles.footerRow}>
        <XStack style={styles.footerBar}>
          <YStack pointerEvents="none" style={styles.footerGlassHighlight} />
          {footerTabItems.map(item => {
            const isActive = item.key === activeTab;
            const iconColor = isActive ? colors.white : colors.textPrimary;
            const labelColor = isActive ? colors.white : colors.textPrimary;

            return (
              <Button
                key={item.key}
                unstyled
                accessibilityRole="tab"
                accessibilityState={{selected: isActive}}
                accessibilityLabel={item.accessibilityLabel}
                hitSlop={6}
                pressStyle={{scale: 0.98}}
                style={[
                  styles.tabButton,
                  isActive ? styles.activeTabButton : undefined,
                ]}
                onPress={() => onTabPress?.(item.key)}>
                <YStack style={styles.tabContent}>
                  {item.icon(iconColor)}
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

        {captureFooterItem ? (
          <Button
            unstyled
            accessibilityRole="tab"
            accessibilityState={{selected: activeTab === captureFooterItem.key}}
            accessibilityLabel={captureFooterItem.accessibilityLabel}
            hitSlop={6}
            pressStyle={{scale: 0.96}}
            style={styles.captureButton}
            onPress={() => onTabPress?.(captureFooterItem.key)}>
            <CameraCaptureButtonSurface
              showInnerDot={false}
              size={APP_FOOTER_CAPTURE_BUBBLE_SIZE}
              variant="liquidGlass">
              {captureFooterItem.icon(colors.textPrimary)}
            </CameraCaptureButtonSurface>
          </Button>
        ) : null}
      </XStack>
    </YStack>
  );
}

const styles = StyleSheet.create({
  footerArea: {
    paddingHorizontal: APP_FOOTER_HORIZONTAL_PADDING,
    paddingTop: spacing.md,
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
  footerRow: {
    alignItems: 'center',
    alignSelf: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
  },
  footerBar: {
    alignItems: 'center',
    backgroundColor: APP_FOOTER_GLASS_BACKGROUND,
    borderColor: APP_FOOTER_GLASS_BORDER,
    borderRadius: radius.pill,
    borderWidth: 1,
    flexDirection: 'row',
    height: APP_FOOTER_BAR_HEIGHT,
    justifyContent: 'center',
    overflow: APP_FOOTER_BAR_OVERFLOW,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    shadowColor: shadows.soft.shadowColor,
    shadowOffset: {width: 0, height: -6},
    shadowOpacity: 0.16,
    shadowRadius: 22,
    width: APP_FOOTER_SIDE_TAB_WIDTH * 2 + spacing.sm * 2,
  },
  footerGlassHighlight: {
    backgroundColor: APP_FOOTER_GLASS_HIGHLIGHT,
    borderRadius: radius.pill,
    height: 18,
    left: spacing.md,
    position: 'absolute',
    right: spacing.md,
    top: 1,
  },
  tabButton: {
    alignItems: 'center',
    borderRadius: radius.pill,
    height: APP_FOOTER_TAB_HEIGHT,
    justifyContent: 'center',
    position: 'relative',
    width: APP_FOOTER_SIDE_TAB_WIDTH,
  },
  activeTabButton: {
    backgroundColor: APP_FOOTER_ACTIVE_TAB_BACKGROUND,
  },
  captureButton: {
    alignItems: 'center',
    height: APP_FOOTER_BAR_HEIGHT,
    justifyContent: 'center',
    width: APP_FOOTER_CAPTURE_SLOT_WIDTH,
  },
  tabContent: {
    alignItems: 'center',
    gap: spacing.xs,
    justifyContent: 'center',
    minWidth: 0,
  },
  tabLabel: {
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.xs,
  },
});
