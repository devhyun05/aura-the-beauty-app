import type { ReactNode } from 'react';
import { StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScrollView, View } from 'tamagui';

import { colors, spacing } from '../theme';

export type AppScreenTopPadding = 'safe' | 'content' | 'none';
export const APP_SCREEN_CONTENT_TOP_PADDING = spacing.lg;

export function getAppScreenTopPadding(
  topPadding: AppScreenTopPadding,
  topInset: number,
) {
  if (topPadding === 'none') {
    return 0;
  }

  if (topPadding === 'content') {
    return APP_SCREEN_CONTENT_TOP_PADDING;
  }

  return Math.max(topInset, spacing.lg) + APP_SCREEN_CONTENT_TOP_PADDING;
}

type AppScreenProps = {
  children: ReactNode;
  scroll?: boolean;
  contentGap?: number;
  topPadding?: AppScreenTopPadding;
};

export function AppScreen({
  children,
  scroll = true,
  contentGap = spacing.sectionGap,
  topPadding = 'safe',
}: AppScreenProps) {
  const insets = useSafeAreaInsets();
  const contentStyle = {
    gap: contentGap,
    paddingBottom: Math.max(insets.bottom, spacing.xl) + spacing.xxl,
    paddingHorizontal: spacing.screenX,
    paddingTop: getAppScreenTopPadding(topPadding, insets.top),
  };

  if (!scroll) {
    return <View style={[styles.screen, contentStyle]}>{children}</View>;
  }

  return (
    <ScrollView
      contentContainerStyle={contentStyle}
      showsVerticalScrollIndicator={false}
      style={styles.screen}
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
