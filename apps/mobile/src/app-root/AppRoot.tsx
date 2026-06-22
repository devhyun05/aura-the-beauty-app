import React, {useState} from 'react';
import {useFonts} from 'expo-font';
import {StatusBar} from 'expo-status-bar';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {TamaguiProvider} from 'tamagui';

import {tamaguiConfig} from '../../tamagui.config';
import {AnalysisResultsScreen} from '../features/analysis';
import {LoginScreen} from '../features/auth';
import {FaceCaptureScreen} from '../features/face-capture/screens/FaceCaptureScreen';
import {UserPageScreen} from '../features/profile';

type AppScreen = 'login' | 'faceCapture' | 'userPage' | 'analysisResults';

export function AppRoot() {
  const [activeScreen, setActiveScreen] = useState<AppScreen>('login');
  const [fontsLoaded] = useFonts({
    'NixieOne-Regular': require('../assets/fonts/NixieOne-Regular.ttf'),
  });

  if (!fontsLoaded) {
    return null;
  }

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
              onPressReports={() => setActiveScreen('analysisResults')}
            />
          ) : null}
          {activeScreen === 'analysisResults' ? (
            <AnalysisResultsScreen onBack={() => setActiveScreen('userPage')} />
          ) : null}
        </>
      </SafeAreaProvider>
    </TamaguiProvider>
  );
}
