import React, {type ReactNode} from 'react';
import {Share2} from 'lucide-react-native';
import {StyleSheet} from 'react-native';
import {Button, Text, View, XStack, YStack} from 'tamagui';

import {colors, iconSize, spacing, typography} from '../../shared/theme';
import {AppHeader, XIcon} from '../../shared/ui';
import {getDetailRouteTitle, getRouteChrome, type DetailHeaderRightAction} from './routeChrome';
import type {RootStackRouteName} from './routeTypes';

export type DetailHeaderPresentation = {
  rightActions: readonly DetailHeaderRightAction[];
  title: string;
};

export function getDetailHeaderRightActions(
  routeName: RootStackRouteName,
): readonly DetailHeaderRightAction[] {
  const chrome = getRouteChrome(routeName);

  if (chrome.kind !== 'detail') {
    throw new Error(`${routeName} is not a detail route`);
  }

  return chrome.rightActions ?? [];
}

export function getDetailHeaderPresentation(
  routeName: RootStackRouteName,
): DetailHeaderPresentation {
  return {
    rightActions: getDetailHeaderRightActions(routeName),
    title: getDetailRouteTitle(routeName),
  };
}

type DetailRouteChromeProps = {
  backgroundColor?: string;
  children: ReactNode;
  headerBackgroundColor?: string;
  headerBorderColor?: string;
  onBack?: () => void;
  onClose?: () => void;
  onDone?: () => void;
  onShare?: () => void;
  routeName: RootStackRouteName;
  shareDisabled?: boolean;
};

export function DetailRouteChrome({
  backgroundColor = colors.background,
  children,
  headerBackgroundColor = backgroundColor,
  headerBorderColor = colors.border,
  onBack,
  onClose,
  onDone,
  onShare,
  routeName,
  shareDisabled = false,
}: DetailRouteChromeProps) {
  const presentation = getDetailHeaderPresentation(routeName);
  const rightSlot = renderRightSlot({
    actions: presentation.rightActions,
    onBack,
    onClose,
    onDone,
    onShare,
    shareDisabled,
  });
  const shouldReserveLeftSlot = !onBack && presentation.rightActions.length > 0;

  return (
    <YStack style={[styles.screen, {backgroundColor}]}>
      <AppHeader
        containerProps={{
          style: [
            styles.header,
            {backgroundColor: headerBackgroundColor, borderBottomColor: headerBorderColor},
          ],
        }}
        leftSlot={shouldReserveLeftSlot ? <View /> : undefined}
        onBack={onBack}
        rightSlot={rightSlot}
        title={presentation.title}
      />
      <YStack style={[styles.body, {backgroundColor}]}>{children}</YStack>
    </YStack>
  );
}

function renderRightSlot({
  actions,
  onBack,
  onClose,
  onDone,
  onShare,
  shareDisabled,
}: {
  actions: readonly DetailHeaderRightAction[];
  onBack?: () => void;
  onClose?: () => void;
  onDone?: () => void;
  onShare?: () => void;
  shareDisabled: boolean;
}) {
  if (actions.length === 0) {
    return undefined;
  }

  return (
    <XStack style={styles.actions}>
      {actions.map(action => {
        if (action === 'share') {
          return (
            <HeaderIconAction
              accessibilityLabel="공유하기"
              disabled={shareDisabled || !onShare}
              key={action}
              onPress={onShare}>
              <Share2 color={colors.textPrimary} size={iconSize.sm} strokeWidth={2} />
            </HeaderIconAction>
          );
        }

        if (action === 'close') {
          return (
            <HeaderIconAction
              accessibilityLabel="닫기"
              key={action}
              onPress={onClose ?? onBack}>
              <XIcon color={colors.textPrimary} size={iconSize.sm} />
            </HeaderIconAction>
          );
        }

        return (
          <Button
            accessibilityLabel="완료"
            accessibilityRole="button"
            key={action}
            onPress={onDone}
            pressStyle={{scale: 0.97}}
            style={styles.doneButton}
            unstyled>
            <Text style={styles.doneText}>완료</Text>
          </Button>
        );
      })}
    </XStack>
  );
}

function HeaderIconAction({
  accessibilityLabel,
  children,
  disabled = false,
  onPress,
}: {
  accessibilityLabel: string;
  children: ReactNode;
  disabled?: boolean;
  onPress?: () => void;
}) {
  return (
    <Button
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={{disabled}}
      disabled={disabled}
      disabledStyle={{opacity: 0.42}}
      hitSlop={8}
      onPress={onPress}
      pressStyle={{scale: 0.97}}
      style={styles.iconButton}
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
  },
  body: {
    flex: 1,
  },
  header: {
    backgroundColor: colors.background,
  },
  doneButton: {
    alignItems: 'center',
    height: 40,
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
  },
  doneText: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
    lineHeight: typography.lineHeight.sm,
  },
  iconButton: {
    alignItems: 'center',
    height: 40,
    justifyContent: 'center',
    padding: 0,
    width: 40,
  },
  screen: {
    backgroundColor: colors.background,
    flex: 1,
  },
});
