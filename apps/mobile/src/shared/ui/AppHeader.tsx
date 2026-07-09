import React, {type ReactNode} from 'react';
import {StyleSheet} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {Button, Text, XStack, YStack, type XStackProps} from 'tamagui';

import {colors, radius, shadows, spacing, typography} from '../theme';
import {ChevronLeftIcon} from './LineIcons';
import {MenuHeaderIcon} from './HeaderIcons';

export const APP_HEADER_BASE_HEIGHT = 56;
export const APP_HEADER_VERTICAL_PADDING = spacing.sm;
export const APP_HEADER_ACTION_BUTTON_SIZE = 40;
export const APP_HEADER_BACKGROUND_COLOR = colors.headerSurface;
export const APP_HEADER_SIDE_SIZE = 40;
export const APP_HEADER_CENTER_TITLE_FONT_SIZE = typography.title.fontSize;
export const APP_HEADER_CONTEXT_TITLE_LEFT_MARGIN = spacing.xs;

type AppHeaderVariant = 'default' | 'immersive';

type AppHeaderProps = {
  contextLabel?: string;
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
  variant?: AppHeaderVariant;
};

export function AppHeader({
  contextLabel,
  title = 'AI AR Makeup',
  titleSlot,
  subtitle = 'MAKEUP GUIDE',
  showTitle = true,
  topInset,
  leftSlot,
  rightSlot,
  onBack,
  onProfilePress,
  profileAccessibilityLabel = '전체 기능 메뉴',
  containerProps,
  variant = 'default',
}: AppHeaderProps) {
  const insets = useSafeAreaInsets();
  const resolvedTopInset = topInset ?? insets.top;
  const isImmersive = variant === 'immersive';
  const shouldUseCenteredTitle = Boolean(onBack || leftSlot);
  const labelText = contextLabel ?? subtitle;
  const leftContent =
    leftSlot ??
    (onBack ? (
      <HeaderIconButton
        accessibilityLabel="뒤로가기"
        onPress={onBack}
        variant={variant}>
        <ChevronLeftIcon color={isImmersive ? colors.white : colors.textPrimary} />
      </HeaderIconButton>
    ) : null);
  const rightContent =
    rightSlot ??
    (!shouldUseCenteredTitle ? (
      <HeaderIconButton
        accessibilityLabel={profileAccessibilityLabel}
        onPress={onProfilePress}
        variant={variant}>
        <MenuHeaderIcon color={isImmersive ? colors.white : colors.black} />
      </HeaderIconButton>
    ) : null);

  return (
    <XStack
      {...containerProps}
      style={[
        styles.container,
        isImmersive && styles.immersiveContainer,
        shouldUseCenteredTitle && styles.centeredContainer,
        {
          minHeight: APP_HEADER_BASE_HEIGHT + resolvedTopInset,
          paddingTop: APP_HEADER_VERTICAL_PADDING + resolvedTopInset,
        },
        containerProps?.style,
      ]}>
      {shouldUseCenteredTitle ? (
        <>
          <XStack style={styles.side}>{leftContent}</XStack>
          {titleSlot ? (
            <XStack style={styles.centerTitleSlot}>{titleSlot}</XStack>
          ) : contextLabel ? (
            <YStack style={styles.contextTitleArea}>
              <Text
                numberOfLines={1}
                style={[
                  styles.contextLabel,
                  isImmersive && styles.immersiveContextLabel,
                ]}>
                {contextLabel}
              </Text>
              <Text
                numberOfLines={1}
                style={[
                  styles.contextTitle,
                  isImmersive && styles.immersiveContextTitle,
                ]}>
                {title}
              </Text>
            </YStack>
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
                    {labelText}
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
  variant: AppHeaderVariant;
};

function HeaderIconButton({
  accessibilityLabel,
  children,
  onPress,
  variant,
}: HeaderIconButtonProps) {
  const isImmersive = variant === 'immersive';

  return (
    <Button
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      hitSlop={8}
      onPress={onPress}
      pressStyle={{scale: 0.97}}
      style={[styles.actionButton, isImmersive && styles.immersiveActionButton]}
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
    backgroundColor: colors.headerControlSurface,
    borderColor: colors.headerControlBorder,
    borderRadius: radius.pill,
    borderWidth: 1,
    height: APP_HEADER_ACTION_BUTTON_SIZE,
    justifyContent: 'center',
    padding: 0,
    shadowColor: shadows.soft.shadowColor,
    shadowOffset: shadows.soft.shadowOffset,
    shadowOpacity: 0.04,
    shadowRadius: 10,
    width: APP_HEADER_ACTION_BUTTON_SIZE,
  },
  centeredContainer: {
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  centerTitle: {
    color: colors.textPrimary,
    flex: 1,
    fontSize: APP_HEADER_CENTER_TITLE_FONT_SIZE,
    fontWeight: typography.fontWeight.bold,
    lineHeight: typography.title.lineHeight,
    textAlign: 'center',
  },
  centerTitleSlot: {
    alignItems: 'center',
    flex: 1,
  },
  contextLabel: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
    letterSpacing: 1.2,
    lineHeight: typography.lineHeight.xs,
  },
  contextTitle: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.lg,
  },
  contextTitleArea: {
    flex: 1,
    gap: 1,
    justifyContent: 'center',
    marginLeft: APP_HEADER_CONTEXT_TITLE_LEFT_MARGIN,
    minWidth: 0,
  },
  immersiveActionButton: {
    backgroundColor: colors.glassSurface,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  immersiveContainer: {
    backgroundColor: 'transparent',
  },
  immersiveContextLabel: {
    color: 'rgba(255, 255, 255, 0.62)',
  },
  immersiveContextTitle: {
    color: colors.white,
  },
  container: {
    alignItems: 'center',
    backgroundColor: APP_HEADER_BACKGROUND_COLOR,
    flexDirection: 'row',
    gap: spacing.lg,
    justifyContent: 'space-between',
    paddingBottom: APP_HEADER_VERTICAL_PADDING,
    paddingHorizontal: spacing.xl,
  },
  side: {
    alignItems: 'center',
    height: APP_HEADER_SIDE_SIZE,
    justifyContent: 'center',
    minWidth: APP_HEADER_SIDE_SIZE,
  },
  titleArea: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
});
