import React, {useCallback, useEffect, useState} from 'react';
import {InteractionManager} from 'react-native';
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
import {AuthSessionProvider} from '../features/auth';
import {navigationLinking} from '../app/navigation/linkingConfig';
import {
  getStatusBarStyleForNavigationState,
  type NavigationRouteState,
} from '../app/navigation/navigationState';
import {RootNavigator} from '../app/navigation/RootNavigator';
import type {RootStackParamList} from '../app/navigation/routeTypes';
import {prepareUnityMakeupRuntime} from '../features/ar/services/unityMakeupBridge';
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

  useEffect(() => {
    if (!fontsLoaded) {
      return undefined;
    }

    let preloadTimer: ReturnType<typeof setTimeout> | undefined;

    const preloadAfterInitialRender = InteractionManager.runAfterInteractions(() => {
      preloadTimer = setTimeout(() => {
        // Full offscreen boot at app start (not just the dylib load): this runs
        // Unity runEmbeddedWithArgc while concealed so the scene loads, the
        // Unity splash plays offscreen, and the first AR frame is produced
        // BEFORE the user ever enters the AR screen. Entry then reveals an
        // already-live scene instead of a splash/black loading flash.
        prepareUnityMakeupRuntime();
      }, 1000);
    });

    return () => {
      preloadAfterInitialRender.cancel();
      if (preloadTimer) {
        clearTimeout(preloadTimer);
      }
    };
  }, [fontsLoaded]);

  if (!fontsLoaded) {
    return null;
  }

  return (
    <TamaguiProvider config={tamaguiConfig} defaultTheme="light">
      <SafeAreaProvider>
        <StatusBar style={statusBarStyle} />
        <AuthSessionProvider>
          <NavigationFlowStateProvider>
            <NavigationContainer
              linking={navigationLinking}
              ref={navigationRef}
              onReady={() => syncStatusBarStyle(navigationRef.getRootState())}
              onStateChange={state => syncStatusBarStyle(state)}>
              <RootNavigator />
            </NavigationContainer>
          </NavigationFlowStateProvider>
        </AuthSessionProvider>
      </SafeAreaProvider>
    </TamaguiProvider>
  );
}
