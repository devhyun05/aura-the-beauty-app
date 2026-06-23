import React, {useState} from 'react';
import {useFonts} from 'expo-font';
import {StatusBar} from 'expo-status-bar';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {TamaguiProvider} from 'tamagui';

import {tamaguiConfig} from '../../tamagui.config';
import {
  AnalysisReportDetailScreen,
  AnalysisResultListScreen,
} from '../features/analysis';
import {LoginScreen} from '../features/auth';
import {FaceCaptureScreen} from '../features/face-capture/screens/FaceCaptureScreen';
import {
  LikedProductListScreen,
  MakeupStyleListScreen,
  MyPageScreen,
  ProfileEditScreen,
} from '../features/profile';

type AppScreen =
  | 'login'
  | 'faceCapture'
  | 'userPage'
  | 'myPage'
  | 'profileEdit'
  | 'analysisResultList'
  | 'analysisResults'
  | 'analysisReportDetail'
  | 'analysisResultDetail'
  | 'makeupStyleList'
  | 'makeupLooks'
  | 'favoriteProducts'
  | 'likedProductList';

export function AppRoot() {
  const [activeScreen, setActiveScreen] = useState<AppScreen>('login');
  const [fontsLoaded] = useFonts({
    'NixieOne-Regular': require('../assets/fonts/NixieOne-Regular.ttf'),
  });

  if (!fontsLoaded) {
    return null;
  }

  const goToMyPage = () => setActiveScreen('myPage');

  return (
    <TamaguiProvider config={tamaguiConfig} defaultTheme="light">
      <SafeAreaProvider>
        <>
          <StatusBar style={activeScreen === 'faceCapture' ? 'light' : 'dark'} />
          {activeScreen === 'login' ? (
            <LoginScreen onLoginSuccess={() => setActiveScreen('faceCapture')} />
          ) : null}
          {activeScreen === 'faceCapture' ? (
            <FaceCaptureScreen
              onCapture={goToMyPage}
              onClose={() => setActiveScreen('login')}
            />
          ) : null}
          {activeScreen === 'myPage' || activeScreen === 'userPage' ? (
            <MyPageScreen
              onPressAnalysisResult={() =>
                setActiveScreen('analysisReportDetail')
              }
              onPressAnalysisResultList={() =>
                setActiveScreen('analysisResultList')
              }
              onPressLikedProductList={() =>
                setActiveScreen('likedProductList')
              }
              onPressMakeupStyleList={() =>
                setActiveScreen('makeupStyleList')
              }
              onPressProfileEdit={() => setActiveScreen('profileEdit')}
            />
          ) : null}
          {activeScreen === 'profileEdit' ? (
            <ProfileEditScreen onBack={goToMyPage} />
          ) : null}
          {activeScreen === 'analysisResultList' || activeScreen === 'analysisResults' ? (
            <AnalysisResultListScreen onBack={goToMyPage} />
          ) : null}
          {activeScreen === 'analysisReportDetail' ||
          activeScreen === 'analysisResultDetail' ? (
            <AnalysisReportDetailScreen onBack={goToMyPage} />
          ) : null}
          {activeScreen === 'makeupStyleList' || activeScreen === 'makeupLooks' ? (
            <MakeupStyleListScreen onBack={goToMyPage} />
          ) : null}
          {activeScreen === 'likedProductList' ||
          activeScreen === 'favoriteProducts' ? (
            <LikedProductListScreen onBack={goToMyPage} />
          ) : null}
        </>
      </SafeAreaProvider>
    </TamaguiProvider>
  );
}
