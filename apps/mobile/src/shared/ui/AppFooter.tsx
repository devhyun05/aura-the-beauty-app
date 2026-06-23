import React, {type ReactNode} from 'react';
import {StyleSheet} from 'react-native';
import {Button, Text, XStack, YStack} from 'tamagui';

import {colors, radius, shadows, spacing} from '../theme';
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
  activeTab = 'home',
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
              style={[styles.tabButton, isActive && styles.activeTabButton]}
              onPress={() => onTabPress?.(item.key)}>
              <YStack style={styles.tabContent}>
                {item.icon(iconColor)}
                <Text
                  color={labelColor}
                  fontSize={14}
                  fontWeight="700"
                  letterSpacing={0}
                  lineHeight={18}
                  numberOfLines={1}>
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
    paddingTop: spacing.sm,
  },
  footerBar: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    height: 86,
    justifyContent: 'space-between',
    padding: spacing.sm,
    shadowColor: shadows.soft.shadowColor,
    shadowOffset: {width: 0, height: -6},
    shadowOpacity: 0.08,
    shadowRadius: 20,
  },
  tabButton: {
    alignItems: 'center',
    borderRadius: radius.pill,
    flex: 1,
    height: 68,
    justifyContent: 'center',
  },
  activeTabButton: {
    backgroundColor: colors.textPrimary,
  },
  tabContent: {
    alignItems: 'center',
    gap: spacing.xs,
    justifyContent: 'center',
    minWidth: 0,
  },
});
