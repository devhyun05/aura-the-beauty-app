import {createContext, type ReactNode, useContext} from 'react';
import {ScrollView, StyleSheet, type ScrollViewProps} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { View } from 'tamagui';

import { colors, spacing } from '../theme';
import {APP_FOOTER_FLOATING_HOST_BASE_HEIGHT} from './AppFooter';
import {APP_HEADER_BASE_HEIGHT} from './AppHeader';

export type AppScreenTopPadding =
  | 'standalone'
  | 'belowShellHeader'
  | 'belowOverlayHeader'
  | 'safeArea'
  | 'none';
export type AppScreenBottomPadding = number | 'floatingFooter' | 'safeArea';
export const APP_SCREEN_CONTENT_TOP_PADDING = spacing.lg;

const AppScreenOverlayHeaderHeightContext = createContext(0);

export function AppScreenOverlayHeaderHeightProvider({
  children,
  headerHeight,
}: {
  children: ReactNode;
  headerHeight: number;
}) {
  return (
    <AppScreenOverlayHeaderHeightContext.Provider value={headerHeight}>
      {children}
    </AppScreenOverlayHeaderHeightContext.Provider>
  );
}

export function getAppScreenTopPadding(
  topPadding: AppScreenTopPadding,
  topInset: number,
) {
  if (topPadding === 'none') {
    return 0;
  }

  if (topPadding === 'belowShellHeader') {
    return APP_SCREEN_CONTENT_TOP_PADDING;
  }

  if (topPadding === 'belowOverlayHeader') {
    return topInset + APP_HEADER_BASE_HEIGHT + APP_SCREEN_CONTENT_TOP_PADDING;
  }

  if (topPadding === 'safeArea') {
    return topInset;
  }

  return Math.max(topInset, spacing.lg) + APP_SCREEN_CONTENT_TOP_PADDING;
}

export function getAppScreenBottomPadding(
  bottomPadding: AppScreenBottomPadding | undefined,
  bottomInset: number,
) {
  if (typeof bottomPadding === 'number') {
    return bottomPadding;
  }

  if (bottomPadding === 'safeArea') {
    return bottomInset;
  }

  if (bottomPadding === 'floatingFooter') {
    return APP_FOOTER_FLOATING_HOST_BASE_HEIGHT + Math.max(bottomInset, spacing.md);
  }

  return Math.max(bottomInset, spacing.xl) + spacing.xxl;
}

export function getAppScreenResolvedTopPadding(
  topPadding: AppScreenTopPadding,
  topInset: number,
  overlayHeaderHeight: number,
) {
  const baseTopPadding = getAppScreenTopPadding(topPadding, topInset);

  if (overlayHeaderHeight <= 0) {
    return baseTopPadding;
  }

  if (topPadding === 'none' || topPadding === 'belowShellHeader') {
    return overlayHeaderHeight + baseTopPadding;
  }

  return baseTopPadding;
}

type AppScreenProps = {
  backgroundColor?: string;
  children: ReactNode;
  bottomPadding?: AppScreenBottomPadding;
  scroll?: boolean;
  contentGap?: number;
  horizontalPadding?: number;
  keyboardShouldPersistTaps?: ScrollViewProps['keyboardShouldPersistTaps'];
  topPadding?: AppScreenTopPadding;
};

export function AppScreen({
  backgroundColor = colors.background,
  children,
  bottomPadding,
  scroll = true,
  contentGap = spacing.sectionGap,
  horizontalPadding = spacing.screenX,
  keyboardShouldPersistTaps,
  topPadding = 'standalone',
}: AppScreenProps) {
  const insets = useSafeAreaInsets();
  const overlayHeaderHeight = useContext(AppScreenOverlayHeaderHeightContext);
  const contentStyle = {
    flexGrow: 1,
    gap: contentGap,
    paddingBottom: getAppScreenBottomPadding(bottomPadding, insets.bottom),
    paddingHorizontal: horizontalPadding,
    paddingTop: getAppScreenResolvedTopPadding(
      topPadding,
      insets.top,
      overlayHeaderHeight,
    ),
  };
  if (!scroll) {
    return <View style={[styles.screen, {backgroundColor}, contentStyle]}>{children}</View>;
  }

  return (
    <ScrollView
      automaticallyAdjustContentInsets={false}
      automaticallyAdjustsScrollIndicatorInsets={false}
      contentContainerStyle={contentStyle}
      contentInset={{bottom: 0, left: 0, right: 0, top: 0}}
      contentInsetAdjustmentBehavior="never"
      keyboardShouldPersistTaps={keyboardShouldPersistTaps}
      showsVerticalScrollIndicator={false}
      scrollIndicatorInsets={{bottom: 0, left: 0, right: 0, top: 0}}
      style={[styles.screen, {backgroundColor}]}
    >
      {children}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: colors.background,
    flex: 1,
  },
});
