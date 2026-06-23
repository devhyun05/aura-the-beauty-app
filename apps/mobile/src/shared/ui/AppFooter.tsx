import React, {type ReactNode} from 'react';
import {StyleSheet} from 'react-native';
import {Button, Text, XStack, YStack} from 'tamagui';

import {colors, radius, shadows, spacing, typography} from '../theme';
import {
  BrushFooterIcon,
  CameraFooterIcon,
  HomeFooterIcon,
} from './FooterIcons';

export type FooterTabKey = 'home' | 'capture' | 'custom';

type FooterTabItem = {
  key: FooterTabKey;
  label: string;
  accessibilityLabel: string;
  icon: (color: string) => ReactNode;
};

type AppFooterProps = {
  activeTab?: FooterTabKey;
  bottomInset?: number;
  onTabPress?: (tab: FooterTabKey) => void;
};

const footerItems: FooterTabItem[] = [
  {
    key: 'home',
    label: '홈',
    accessibilityLabel: '홈으로 이동',
    icon: color => <HomeFooterIcon color={color} />,
  },
  {
    key: 'capture',
    label: '촬영',
    accessibilityLabel: '촬영 화면으로 이동',
    icon: color => <CameraFooterIcon color={color} />,
  },
  {
    key: 'custom',
    label: '추천',
    accessibilityLabel: '추천 제품 화면으로 이동',
    icon: color => <BrushFooterIcon color={color} />,
  },
];

export function AppFooter({
  activeTab,
  bottomInset = 0,
  onTabPress,
}: AppFooterProps) {
  return (
    <YStack
      pointerEvents="box-none"
      style={[
        styles.footerArea,
        {
          paddingBottom: Math.max(bottomInset, spacing.md),
        },
      ]}>
      <XStack style={styles.footerBar}>
        {footerItems.map(item => {
          const isActive = item.key === activeTab;
          const isCaptureTab = item.key === 'capture';
          const iconColor = isCaptureTab || isActive ? colors.white : colors.textPrimary;
          const labelColor = isCaptureTab ? colors.textPrimary : isActive ? colors.white : colors.textPrimary;

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
              <YStack style={isCaptureTab ? styles.captureTabContent : styles.tabContent}>
                <YStack style={isCaptureTab ? styles.captureIconBubble : undefined}>
                  {item.icon(iconColor)}
                </YStack>
                <Text
                  numberOfLines={1}
                  style={[styles.tabLabel, {color: labelColor}]}>
                  {item.label}
                </Text>
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
    backgroundColor: colors.background,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
  },
  footerBar: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: 1,
    flexDirection: 'row',
    height: 74,
    justifyContent: 'space-between',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    shadowColor: shadows.soft.shadowColor,
    shadowOffset: {width: 0, height: -6},
    shadowOpacity: 0.08,
    shadowRadius: 20,
  },
  tabButton: {
    alignItems: 'center',
    borderRadius: radius.pill,
    flex: 1,
    height: 58,
    justifyContent: 'center',
  },
  activeTabButton: {
    backgroundColor: colors.textPrimary,
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
    transform: [{translateY: -12}],
  },
  captureIconBubble: {
    alignItems: 'center',
    backgroundColor: colors.textPrimary,
    borderColor: colors.white,
    borderRadius: radius.pill,
    borderWidth: 3,
    height: 68,
    justifyContent: 'center',
    shadowColor: colors.black,
    shadowOffset: {width: 0, height: 8},
    shadowOpacity: 0.14,
    shadowRadius: 14,
    width: 68,
  },
  tabContent: {
    alignItems: 'center',
    gap: spacing.xs,
    justifyContent: 'center',
    minWidth: 0,
  },
  tabLabel: {
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.sm,
  },
});
