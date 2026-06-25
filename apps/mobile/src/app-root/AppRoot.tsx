import React, {useCallback, useState} from 'react';
import {
  NavigationContainer,
  useNavigationContainerRef,
} from '@react-navigation/native';
import {useFonts} from 'expo-font';
import {StatusBar} from 'expo-status-bar';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {TamaguiProvider} from 'tamagui';

import {tamaguiConfig} from '../../tamagui.config';
import {NavigationFlowStateProvider} from '../app/navigation/flowState';
import {navigationLinking} from '../app/navigation/linkingConfig';
import {
  getStatusBarStyleForNavigationState,
  type NavigationRouteState,
} from '../app/navigation/navigationState';
import {RootNavigator} from '../app/navigation/RootNavigator';
import type {RootStackParamList} from '../app/navigation/routeTypes';
import {typography} from '../shared/theme';

export function AppRoot() {
  const navigationRef = useNavigationContainerRef<RootStackParamList>();
  const [statusBarStyle, setStatusBarStyle] = useState<'dark' | 'light'>('dark');
  const [fontsLoaded] = useFonts({
    [typography.fontFamily.brand]: require('../assets/fonts/NixieOne-Regular.ttf'),
    [typography.fontFamily.regular]: require('../assets/fonts/Pretendard-Regular.otf'),
    [typography.fontFamily.medium]: require('../assets/fonts/Pretendard-Medium.otf'),
    [typography.fontFamily.semibold]: require('../assets/fonts/Pretendard-SemiBold.otf'),
    [typography.fontFamily.bold]: require('../assets/fonts/Pretendard-Bold.otf'),
  });

  const syncStatusBarStyle = useCallback(
    (state: NavigationRouteState | undefined) => {
      setStatusBarStyle(getStatusBarStyleForNavigationState(state));
    },
    [],
  );

  if (!fontsLoaded) {
    return null;
  }

  return (
    <TamaguiProvider config={tamaguiConfig} defaultTheme="light">
      <SafeAreaProvider>
        <StatusBar style={statusBarStyle} />
        <NavigationFlowStateProvider>
          <NavigationContainer
            linking={navigationLinking}
            ref={navigationRef}
            onReady={() => syncStatusBarStyle(navigationRef.getRootState())}
            onStateChange={state => syncStatusBarStyle(state)}>
            <RootNavigator />
          </NavigationContainer>
        </NavigationFlowStateProvider>
      </SafeAreaProvider>
    </TamaguiProvider>
  );
}
