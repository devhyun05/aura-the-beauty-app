import React, {type ReactNode} from 'react';
import {StyleSheet} from 'react-native';
import {Button, Text, XStack, YStack, type XStackProps} from 'tamagui';

import {colors, radius, shadows, spacing, typography} from '../theme';
import {ProfileHeaderIcon, SearchHeaderIcon} from './HeaderIcons';

type AppHeaderProps = {
  title?: string;
  subtitle?: string;
  showTitle?: boolean;
  topInset?: number;
  rightSlot?: ReactNode;
  onSearchPress?: () => void;
  onProfilePress?: () => void;
  searchAccessibilityLabel?: string;
  profileAccessibilityLabel?: string;
  containerProps?: XStackProps;
};

export function AppHeader({
  title = 'AI AR Makeup',
  subtitle = 'MAKEUP GUIDE',
  showTitle = true,
  topInset = 0,
  rightSlot,
  onSearchPress,
  onProfilePress,
  searchAccessibilityLabel = '검색',
  profileAccessibilityLabel = '사용자 페이지',
  containerProps,
}: AppHeaderProps) {
  return (
    <XStack
      {...containerProps}
      style={[
        styles.container,
        {
          minHeight: 64 + topInset,
          paddingTop: spacing.md + topInset,
        },
        containerProps?.style,
      ]}>
      {showTitle ? (
        <YStack style={styles.titleArea}>
          <Text
            color={colors.textSecondary}
            fontSize={typography.caption.fontSize}
            fontWeight={typography.caption.fontWeight}
            letterSpacing={1.2}
            lineHeight={typography.caption.lineHeight}
            numberOfLines={1}>
            {subtitle}
          </Text>
          <Text
            color={colors.textPrimary}
            fontSize={typography.title.fontSize}
            fontWeight={typography.title.fontWeight}
            letterSpacing={0}
            lineHeight={typography.title.lineHeight}
            numberOfLines={1}>
            {title}
          </Text>
        </YStack>
      ) : null}

      <XStack style={styles.actions}>
        {rightSlot ?? (
          <>
            <HeaderIconButton
              accessibilityLabel={searchAccessibilityLabel}
              onPress={onSearchPress}>
              <SearchHeaderIcon />
            </HeaderIconButton>
            <HeaderIconButton
              accessibilityLabel={profileAccessibilityLabel}
              onPress={onProfilePress}>
              <ProfileHeaderIcon />
            </HeaderIconButton>
          </>
        )}
      </XStack>
    </XStack>
  );
}

type HeaderIconButtonProps = {
  accessibilityLabel: string;
  children: ReactNode;
  onPress?: () => void;
};

function HeaderIconButton({
  accessibilityLabel,
  children,
  onPress,
}: HeaderIconButtonProps) {
  return (
    <Button
      hitSlop={8}
      pressStyle={{scale: 0.97}}
      style={styles.actionButton}
      unstyled
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}>
      {children}
    </Button>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    backgroundColor: colors.background,
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing.lg,
    justifyContent: 'space-between',
    paddingBottom: spacing.md,
    paddingHorizontal: spacing.xl,
  },
  titleArea: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  actions: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    marginLeft: 'auto',
  },
  actionButton: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.borderStrong,
    borderRadius: radius.pill,
    borderWidth: 1,
    height: 42,
    justifyContent: 'center',
    padding: 0,
    shadowColor: shadows.soft.shadowColor,
    shadowOffset: shadows.soft.shadowOffset,
    shadowOpacity: shadows.soft.shadowOpacity,
    shadowRadius: shadows.soft.shadowRadius,
    width: 42,
  },
});
