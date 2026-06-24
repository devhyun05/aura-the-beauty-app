import type { ReactNode } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { View } from 'tamagui';

import { colors, spacing } from '../theme';

export type AppScreenTopPadding = 'standalone' | 'belowShellHeader' | 'none';
export const APP_SCREEN_CONTENT_TOP_PADDING = spacing.lg;

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

  return Math.max(topInset, spacing.lg) + APP_SCREEN_CONTENT_TOP_PADDING;
}

type AppScreenProps = {
  backgroundColor?: string;
  children: ReactNode;
  bottomPadding?: number;
  scroll?: boolean;
  contentGap?: number;
  horizontalPadding?: number;
  topPadding?: AppScreenTopPadding;
};

export function AppScreen({
  backgroundColor = colors.background,
  children,
  bottomPadding,
  scroll = true,
  contentGap = spacing.sectionGap,
  horizontalPadding = spacing.screenX,
  topPadding = 'standalone',
}: AppScreenProps) {
  const insets = useSafeAreaInsets();
  const contentStyle = {
    flexGrow: 1,
    gap: contentGap,
    paddingBottom: bottomPadding ?? Math.max(insets.bottom, spacing.xl) + spacing.xxl,
    paddingHorizontal: horizontalPadding,
    paddingTop: getAppScreenTopPadding(topPadding, insets.top),
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
