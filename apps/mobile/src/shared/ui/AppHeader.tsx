import React, {type ReactNode} from 'react';
import {StyleSheet} from 'react-native';
import {Button, Text, XStack, YStack, type XStackProps} from 'tamagui';

import {colors, radius, shadows, spacing, typography} from '../theme';
import {ChevronLeftIcon} from './LineIcons';
import {ProfileHeaderIcon} from './HeaderIcons';

type AppHeaderProps = {
  title?: string;
  titleSlot?: ReactNode;
  subtitle?: string;
  showTitle?: boolean;
  topInset?: number;
  leftSlot?: ReactNode;
  rightSlot?: ReactNode;
  onBack?: () => void;
  onProfilePress?: () => void;
  profileAccessibilityLabel?: string;
  containerProps?: XStackProps;
};

export function AppHeader({
  title = 'AI AR Makeup',
  titleSlot,
  subtitle = 'MAKEUP GUIDE',
  showTitle = true,
  topInset = 0,
  leftSlot,
  rightSlot,
  onBack,
  onProfilePress,
  profileAccessibilityLabel = '사용자 페이지',
  containerProps,
}: AppHeaderProps) {
  const shouldUseCenteredTitle = Boolean(onBack || leftSlot);
  const leftContent =
    leftSlot ??
    (onBack ? (
      <HeaderIconButton accessibilityLabel="뒤로가기" onPress={onBack}>
        <ChevronLeftIcon />
      </HeaderIconButton>
    ) : null);
  const rightContent =
    rightSlot ??
    (!shouldUseCenteredTitle ? (
      <HeaderIconButton
        accessibilityLabel={profileAccessibilityLabel}
        onPress={onProfilePress}>
        <ProfileHeaderIcon />
      </HeaderIconButton>
    ) : null);

  return (
    <XStack
      {...containerProps}
      style={[
        styles.container,
        shouldUseCenteredTitle && styles.centeredContainer,
        {
          minHeight: 64 + topInset,
          paddingTop: spacing.md + topInset,
        },
        containerProps?.style,
      ]}>
      {shouldUseCenteredTitle ? (
        <>
          <XStack style={styles.side}>{leftContent}</XStack>
          {titleSlot ? (
            <XStack style={styles.centerTitleSlot}>{titleSlot}</XStack>
          ) : (
            <Text numberOfLines={1} style={styles.centerTitle}>
              {title}
            </Text>
          )}
          <XStack style={styles.side}>{rightContent}</XStack>
        </>
      ) : (
        <>
          {showTitle ? (
            <YStack style={styles.titleArea}>
              {titleSlot ?? (
                <>
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
                </>
              )}
            </YStack>
          ) : null}

          <XStack style={styles.actions}>{rightContent}</XStack>
        </>
      )}
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
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      hitSlop={8}
      onPress={onPress}
      pressStyle={{scale: 0.97}}
      style={styles.actionButton}
      unstyled>
      {children}
    </Button>
  );
}

const styles = StyleSheet.create({
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
  centeredContainer: {
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  centerTitle: {
    color: colors.textPrimary,
    flex: 1,
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.bold,
    lineHeight: typography.lineHeight.xl,
    textAlign: 'center',
  },
  centerTitleSlot: {
    alignItems: 'center',
    flex: 1,
  },
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
  side: {
    alignItems: 'center',
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  titleArea: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
});
