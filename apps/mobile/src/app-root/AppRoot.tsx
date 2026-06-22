import React from 'react';
import {StyleSheet} from 'react-native';
import {StatusBar} from 'expo-status-bar';
import {SafeAreaProvider, useSafeAreaInsets} from 'react-native-safe-area-context';
import {TamaguiProvider, YStack} from 'tamagui';

import {tamaguiConfig} from '../../tamagui.config';
import {colors} from '../shared/theme';
import {AppFooter, AppHeader} from '../shared/ui';

export function AppRoot() {
  return (
    <TamaguiProvider config={tamaguiConfig} defaultTheme="light">
      <SafeAreaProvider>
        <HeaderPreview />
      </SafeAreaProvider>
    </TamaguiProvider>
  );
}

function HeaderPreview() {
  const insets = useSafeAreaInsets();

  return (
    <YStack style={styles.screen}>
      <StatusBar style="dark" />
      <AppHeader topInset={insets.top} />
      <YStack style={styles.body} />
      <AppFooter bottomInset={insets.bottom} />
    </YStack>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: colors.background,
    flex: 1,
  },
  body: {
    flex: 1,
  },
});
