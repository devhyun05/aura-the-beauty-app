import {createContext, type ReactNode, type Ref, useContext, useEffect, useRef} from 'react';
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
  horizontalPaddingLeft?: number;
  horizontalPaddingRight?: number;
  keyboardShouldPersistTaps?: ScrollViewProps['keyboardShouldPersistTaps'];
  topPadding?: AppScreenTopPadding;
  scrollViewRef?: Ref<ScrollView>;
  onScrollActivityChange?: (active: boolean, fast: boolean) => void;
};

export function AppScreen({
  backgroundColor = colors.background,
  children,
  bottomPadding,
  scroll = true,
  contentGap = spacing.sectionGap,
  horizontalPadding = spacing.screenX,
  horizontalPaddingLeft = horizontalPadding,
  horizontalPaddingRight = horizontalPadding,
  keyboardShouldPersistTaps,
  topPadding = 'standalone',
  scrollViewRef,
  onScrollActivityChange,
}: AppScreenProps) {
  const insets = useSafeAreaInsets();
  const overlayHeaderHeight = useContext(AppScreenOverlayHeaderHeightContext);
  const scrollIdleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollActiveRef = useRef(false);
  const lastScrollSampleRef = useRef({time: 0, y: 0});
  const fastScrollRef = useRef(false);
  const setScrollActive = (active: boolean, delayed = false) => {
    if (scrollIdleTimerRef.current) {
      clearTimeout(scrollIdleTimerRef.current);
      scrollIdleTimerRef.current = null;
    }
    if (delayed) {
      scrollIdleTimerRef.current = setTimeout(() => {
        scrollActiveRef.current = false;
        fastScrollRef.current = false;
        onScrollActivityChange?.(false, false);
      }, 180);
      return;
    }
    scrollActiveRef.current = active;
    fastScrollRef.current = false;
    onScrollActivityChange?.(active, false);
  };
  useEffect(() => () => {
    if (scrollIdleTimerRef.current) clearTimeout(scrollIdleTimerRef.current);
  }, []);
  const contentStyle = {
    flexGrow: 1,
    gap: contentGap,
    paddingBottom: getAppScreenBottomPadding(bottomPadding, insets.bottom),
    paddingLeft: horizontalPaddingLeft,
    paddingRight: horizontalPaddingRight,
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
      ref={scrollViewRef}
      contentContainerStyle={contentStyle}
      contentInset={{bottom: 0, left: 0, right: 0, top: 0}}
      contentInsetAdjustmentBehavior="never"
      keyboardShouldPersistTaps={keyboardShouldPersistTaps}
      onMomentumScrollBegin={() => setScrollActive(true)}
      onMomentumScrollEnd={() => setScrollActive(false)}
      onScroll={event => {
        if (!onScrollActivityChange || !scrollActiveRef.current) return;
        const now = Date.now();
        const y = event.nativeEvent.contentOffset.y;
        const previous = lastScrollSampleRef.current;
        lastScrollSampleRef.current = {time: now, y};
        if (!previous.time) return;
        const elapsed = Math.max(1, now - previous.time);
        const fast = Math.abs(y - previous.y) / elapsed >= 1.4;
        if (fast !== fastScrollRef.current) {
          fastScrollRef.current = fast;
          onScrollActivityChange(true, fast);
        }
      }}
      onScrollBeginDrag={() => setScrollActive(true)}
      onScrollEndDrag={() => setScrollActive(false, true)}
      scrollEventThrottle={16}
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
