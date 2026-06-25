import React, {useCallback, useState} from 'react';
import {
  NavigationContainer,
  useNavigationContainerRef,
  type LinkingOptions,
} from '@react-navigation/native';
import {useFonts} from 'expo-font';
import {StatusBar} from 'expo-status-bar';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {TamaguiProvider} from 'tamagui';

import {tamaguiConfig} from '../../tamagui.config';
import {NavigationFlowStateProvider} from '../app/navigation/flowState';
import {
  getStatusBarStyleForNavigationState,
  type NavigationRouteState,
} from '../app/navigation/navigationState';
import {RootNavigator} from '../app/navigation/RootNavigator';
import type {RootStackParamList} from '../app/navigation/routeTypes';
import {typography} from '../shared/theme';

const linking: LinkingOptions<RootStackParamList> = {
  prefixes: [
    'aiarmakeup://',
    'exp://127.0.0.1:8082/--/',
    'exp://localhost:8082/--/',
  ],
  config: {
    screens: {
      Login: 'login',
      Tutorial: 'tutorial',
      MainTabs: {
        path: 'tabs',
        screens: {
          HomeTab: 'home',
          CustomTab: 'custom',
          MyPageTab: 'my-page',
        },
      },
      FaceCapture: 'face-capture',
      ImageAnalysisLoading: 'image-analysis-loading',
      ImageAnalysisReportsList: 'image-analysis-reports',
      ImageAnalysisReportDetail: 'image-analysis-report/:reportId?',
      ProfileEdit: 'profile-edit',
      MakeupStyleList: 'makeup-style-list',
      LikedProductList: 'liked-product-list',
      ARMakeupFilter: 'ar-makeup-filter',
      ARFilterLocation: 'ar-filter-location',
      ARFilterStyle: 'ar-filter-style',
      FeedbackEntry: 'feedback-entry',
      FeedbackCapture: 'feedback-capture',
      FeedbackLoading: 'feedback-loading',
      FeedbackResult: 'feedback-result',
      FeedbackGuide: 'feedback-guide',
      FeedbackTip: 'feedback-tip/:pointId',
      FilterUpload: 'filter-upload',
      FilterLoading: 'filter-loading',
      FilterResult: 'filter-result',
      FilterTryOn: 'filter-try-on',
      FilterSave: 'filter-save',
      FilterSaved: 'filter-saved',
      FilterRecipeDetail: 'filter-recipe-detail',
      RecipeSaved: 'recipe-saved',
    },
  },
};

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
            linking={linking}
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
