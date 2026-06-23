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
import {MakeupStyleListScreen} from '../features/recommendation';
import {
  LikedProductListScreen,
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
  const [selectedAnalysisResultId, setSelectedAnalysisResultId] =
    useState<string | null>(null);
  const [analysisDetailBackScreen, setAnalysisDetailBackScreen] =
    useState<AppScreen>('myPage');
  const [fontsLoaded] = useFonts({
    'NixieOne-Regular': require('../assets/fonts/NixieOne-Regular.ttf'),
  });

  if (!fontsLoaded) {
    return null;
  }

  const goToMyPage = () => setActiveScreen('myPage');
  const goToAnalysisReportDetail = (
    resultId: string | null,
    backScreen: AppScreen,
  ) => {
    setSelectedAnalysisResultId(resultId);
    setAnalysisDetailBackScreen(backScreen);
    setActiveScreen('analysisReportDetail');
  };

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
              onPressAnalysisResult={(resultId) =>
                goToAnalysisReportDetail(resultId, 'myPage')
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
            <AnalysisResultListScreen
              onBack={goToMyPage}
              onPressResult={(resultId) =>
                goToAnalysisReportDetail(resultId, 'analysisResultList')
              }
            />
          ) : null}
          {activeScreen === 'analysisReportDetail' ||
          activeScreen === 'analysisResultDetail' ? (
            <AnalysisReportDetailScreen
              onBack={() => setActiveScreen(analysisDetailBackScreen)}
              resultId={selectedAnalysisResultId}
            />
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
