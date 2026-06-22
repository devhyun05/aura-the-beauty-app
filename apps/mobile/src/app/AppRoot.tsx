import React from 'react';
import {StyleSheet} from 'react-native';
import {StatusBar} from 'expo-status-bar';
import {SafeAreaProvider, SafeAreaView} from 'react-native-safe-area-context';
import {TamaguiProvider} from 'tamagui';

import {UserPageScreen} from '../features/profile';
import {tamaguiConfig} from '../../tamagui.config';

export function AppRoot() {
  return (
    <TamaguiProvider config={tamaguiConfig} defaultTheme="light">
      <SafeAreaProvider>
        <SafeAreaView style={styles.screen}>
          <StatusBar style="dark" />
          <UserPageScreen />
        </SafeAreaView>
      </SafeAreaProvider>
    </TamaguiProvider>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: '#FFFFFF',
    flex: 1,
  },
});
