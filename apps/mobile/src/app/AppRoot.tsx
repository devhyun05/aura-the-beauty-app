import React from 'react';
import {StyleSheet} from 'react-native';
import {StatusBar} from 'expo-status-bar';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {TamaguiProvider, Text, YStack} from 'tamagui';

import {tamaguiConfig} from '../../tamagui.config';

export function AppRoot() {
  return (
    <TamaguiProvider config={tamaguiConfig} defaultTheme="light">
      <SafeAreaProvider>
        <YStack style={styles.screen}>
          <StatusBar style="dark" />
          <Text style={styles.title}>AI AR Makeup Guide</Text>
        </YStack>
      </SafeAreaProvider>
    </TamaguiProvider>
  );
}

const styles = StyleSheet.create({
  screen: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  title: {
    color: '#111111',
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: 0,
    lineHeight: 28,
    textAlign: 'center',
  },
});
