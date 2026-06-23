import React, {useState} from 'react';
import {useFonts} from 'expo-font';
import {StatusBar} from 'expo-status-bar';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {TamaguiProvider} from 'tamagui';

import {tamaguiConfig} from '../../tamagui.config';
import {AnalysisResultDetailScreen, AnalysisResultsScreen} from '../features/analysis';
import {LoginScreen} from '../features/auth';
import {FaceCaptureScreen} from '../features/face-capture/screens/FaceCaptureScreen';
import {
  FavoriteProductsScreen,
  MakeupLookScreen,
  UserPageScreen,
} from '../features/profile';

type AppScreen =
  | 'login'
  | 'faceCapture'
  | 'userPage'
  | 'makeupLooks'
  | 'favoriteProducts'
  | 'analysisResults'
  | 'analysisResultDetail';
type DetailBackScreen = 'userPage' | 'analysisResults';

export function AppRoot() {
  const [activeScreen, setActiveScreen] = useState<AppScreen>('login');
  const [selectedAnalysisResultId, setSelectedAnalysisResultId] = useState<
    string | null
  >(null);
  const [detailBackScreen, setDetailBackScreen] =
    useState<DetailBackScreen>('userPage');
  const [fontsLoaded] = useFonts({
    'NixieOne-Regular': require('../assets/fonts/NixieOne-Regular.ttf'),
  });

  if (!fontsLoaded) {
    return null;
  }

  const openAnalysisDetail = (
    resultId: string,
    backScreen: DetailBackScreen,
  ) => {
    setSelectedAnalysisResultId(resultId);
    setDetailBackScreen(backScreen);
    setActiveScreen('analysisResultDetail');
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
              onCapture={() => setActiveScreen('userPage')}
              onClose={() => setActiveScreen('login')}
            />
          ) : null}
          {activeScreen === 'userPage' ? (
            <UserPageScreen
              onPressMakeupStyles={() => setActiveScreen('makeupLooks')}
              onPressFavoriteProducts={() =>
                setActiveScreen('favoriteProducts')
              }
              onPressReport={(reportId) =>
                openAnalysisDetail(reportId, 'userPage')
              }
              onPressReports={() => setActiveScreen('analysisResults')}
            />
          ) : null}
          {activeScreen === 'makeupLooks' ? (
            <MakeupLookScreen onBack={() => setActiveScreen('userPage')} />
          ) : null}
          {activeScreen === 'favoriteProducts' ? (
            <FavoriteProductsScreen onBack={() => setActiveScreen('userPage')} />
          ) : null}
          {activeScreen === 'analysisResults' ? (
            <AnalysisResultsScreen
              onBack={() => setActiveScreen('userPage')}
              onPressResult={(resultId) =>
                openAnalysisDetail(resultId, 'analysisResults')
              }
            />
          ) : null}
          {activeScreen === 'analysisResultDetail' ? (
            <AnalysisResultDetailScreen
              resultId={selectedAnalysisResultId}
              onBack={() => setActiveScreen(detailBackScreen)}
            />
          ) : null}
        </>
      </SafeAreaProvider>
    </TamaguiProvider>
  );
}
