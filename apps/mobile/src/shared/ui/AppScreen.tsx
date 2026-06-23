import type { ReactNode } from 'react';
import { StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScrollView, View } from 'tamagui';

import { colors, spacing } from '../theme';

type AppScreenProps = {
  children: ReactNode;
  scroll?: boolean;
  contentGap?: number;
};

export function AppScreen({
  children,
  scroll = true,
  contentGap = spacing.sectionGap,
}: AppScreenProps) {
  const insets = useSafeAreaInsets();
  const contentStyle = {
    gap: contentGap,
    paddingBottom: Math.max(insets.bottom, spacing.xl) + spacing.xxl,
    paddingHorizontal: spacing.screenX,
    paddingTop: Math.max(insets.top, spacing.lg) + spacing.lg,
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
