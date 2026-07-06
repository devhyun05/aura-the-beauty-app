import React, {type ReactNode} from 'react';
import {ChevronDown, Share2} from 'lucide-react-native';
import {StyleSheet, View as RNView} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {Button, Text, View, XStack, YStack} from 'tamagui';

import {colors, iconSize, spacing, typography} from '../../shared/theme';
import {XIcon} from '../../shared/ui';
import {AppScreenOverlayHeaderHeightProvider} from '../../shared/ui/AppScreen';
import {APP_HEADER_BASE_HEIGHT, AppHeader} from '../../shared/ui/AppHeader';
import {
  getDetailRouteContextLabel,
  getDetailRouteTitle,
  getRouteChrome,
  type DetailHeaderRightAction,
} from './routeChrome';
import type {RootStackRouteName} from './routeTypes';

export type DetailHeaderPresentation = {
  contextLabel: string;
  rightActions: readonly DetailHeaderRightAction[];
  title: string;
};

export type DetailRouteHeaderMode = 'standard' | 'overlay';

export const DETAIL_ROUTE_DEFAULT_HEADER_MODE: DetailRouteHeaderMode = 'overlay';
export const DETAIL_ROUTE_OVERLAY_HEADER_BACKGROUND_COLOR =
  colors.headerOverlaySurface;

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
    contextLabel: getDetailRouteContextLabel(routeName),
    rightActions: getDetailHeaderRightActions(routeName),
    title: getDetailRouteTitle(routeName),
  };
}

type DetailRouteChromeProps = {
  backgroundColor?: string;
  children: ReactNode;
  headerBackgroundColor?: string;
  headerBorderColor?: string;
  headerMode?: DetailRouteHeaderMode;
  onBack?: () => void;
  onClose?: () => void;
  onDone?: () => void;
  onOpenDocumentList?: () => void;
  onShare?: () => void;
  reserveOverlayHeaderSpace?: boolean;
  routeName: RootStackRouteName;
  shareDisabled?: boolean;
};

export function DetailRouteChrome({
  backgroundColor = colors.background,
  children,
  headerBackgroundColor,
  headerBorderColor,
  headerMode = DETAIL_ROUTE_DEFAULT_HEADER_MODE,
  onBack,
  onClose,
  onDone,
  onOpenDocumentList,
  onShare,
  reserveOverlayHeaderSpace = true,
  routeName,
  shareDisabled = false,
}: DetailRouteChromeProps) {
  const insets = useSafeAreaInsets();
  const presentation = getDetailHeaderPresentation(routeName);
  const isOverlayHeader = headerMode === 'overlay';
  const resolvedHeaderBackgroundColor =
    headerBackgroundColor ??
    (isOverlayHeader
      ? DETAIL_ROUTE_OVERLAY_HEADER_BACKGROUND_COLOR
      : colors.headerSurface);
  const resolvedHeaderBorderColor =
    headerBorderColor ??
    (isOverlayHeader ? colors.headerOverlayBorder : colors.border);
  const overlayHeaderHeight = APP_HEADER_BASE_HEIGHT + insets.top;
  const headerContentColor = colors.textPrimary;
  const leftSlot = onOpenDocumentList ? (
    <HeaderIconAction
      accessibilityLabel="문서 목록 열기"
      onPress={onOpenDocumentList}>
      <ChevronDown color={headerContentColor} size={iconSize.sm} strokeWidth={2} />
    </HeaderIconAction>
  ) : undefined;
  const rightSlot = renderRightSlot({
    actions: presentation.rightActions,
    iconColor: headerContentColor,
    onBack,
    onClose,
    onDone,
    onShare,
    shareDisabled,
  });
  const shouldReserveLeftSlot =
    !onBack && !leftSlot && presentation.rightActions.length > 0;
  const header = (
    <RNView
      pointerEvents={isOverlayHeader ? 'box-none' : 'auto'}
      style={[
        styles.headerHost,
        isOverlayHeader
          ? [styles.overlayHeaderHost, {height: overlayHeaderHeight}]
          : undefined,
      ]}>
      {isOverlayHeader ? (
        <OverlayHeaderBackground
          backgroundColor={resolvedHeaderBackgroundColor}
          borderColor={resolvedHeaderBorderColor}
        />
      ) : null}
      <AppHeader
        containerProps={{
          style: [
            styles.header,
            isOverlayHeader ? styles.overlayHeader : undefined,
            {
              backgroundColor: isOverlayHeader ? 'transparent' : resolvedHeaderBackgroundColor,
              borderBottomColor: resolvedHeaderBorderColor,
            },
          ],
        }}
        contextLabel={presentation.contextLabel}
        leftSlot={leftSlot ?? (shouldReserveLeftSlot ? <View /> : undefined)}
        onBack={onBack}
        variant="default"
        rightSlot={rightSlot}
        title={presentation.title}
      />
    </RNView>
  );

  return (
    <YStack style={[styles.screen, {backgroundColor}]}>
      {isOverlayHeader ? null : header}
      <AppScreenOverlayHeaderHeightProvider
        headerHeight={isOverlayHeader && reserveOverlayHeaderSpace ? overlayHeaderHeight : 0}>
        <YStack style={[styles.body, {backgroundColor}]}>
          {children}
        </YStack>
      </AppScreenOverlayHeaderHeightProvider>
      {isOverlayHeader ? header : null}
    </YStack>
  );
}

function OverlayHeaderBackground({
  backgroundColor,
  borderColor,
}: {
  backgroundColor: string;
  borderColor: string;
}) {
  return (
    <RNView pointerEvents="none" style={StyleSheet.absoluteFill}>
      <RNView
        style={[
          StyleSheet.absoluteFill,
          {backgroundColor},
        ]}
      />
      <RNView style={[styles.overlayHeaderBorder, {backgroundColor: borderColor}]} />
    </RNView>
  );
}

function renderRightSlot({
  actions,
  iconColor,
  onBack,
  onClose,
  onDone,
  onShare,
  shareDisabled,
}: {
  actions: readonly DetailHeaderRightAction[];
  iconColor: string;
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
              <Share2 color={iconColor} size={iconSize.sm} strokeWidth={2} />
            </HeaderIconAction>
          );
        }

        if (action === 'close') {
          return (
            <HeaderIconAction
              accessibilityLabel="닫기"
              key={action}
              onPress={onClose ?? onBack}>
              <XIcon color={iconColor} size={iconSize.sm} />
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
            <Text style={styles.doneText}>
              완료
            </Text>
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
    backgroundColor: colors.headerSurface,
  },
  headerHost: {
    overflow: 'hidden',
  },
  overlayHeader: {
    backgroundColor: 'transparent',
  },
  overlayHeaderBorder: {
    bottom: 0,
    height: StyleSheet.hairlineWidth,
    left: 0,
    opacity: 0.7,
    position: 'absolute',
    right: 0,
  },
  overlayHeaderHost: {
    elevation: 30,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
    zIndex: 30,
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
    position: 'relative',
  },
});
