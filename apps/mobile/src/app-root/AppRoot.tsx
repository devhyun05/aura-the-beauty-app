import React, {useState} from 'react';
import {useFonts} from 'expo-font';
import {StatusBar} from 'expo-status-bar';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {TamaguiProvider} from 'tamagui';

import {tamaguiConfig} from '../../tamagui.config';
import {AIAnalysisLoadingScreen} from '../features/analysis/screens/AIAnalysisLoadingScreen';
import {ARFilterCustomLocationScreen} from '../features/ar/screens/ARFilterCustomLocationScreen';
import {ARMakeupFilterScreen} from '../features/ar/screens/ARMakeupFilterScreen';
import {LoginScreen} from '../features/auth';
import {FaceCaptureScreen} from '../features/face-capture/screens/FaceCaptureScreen';
import {FacialAnalysisResultScreen} from '../features/analysis/screens/FacialAnalysisResultScreen';
import {typography} from '../shared/theme';

type AppScreen =
  | 'login'
  | 'faceCapture'
  | 'analysisLoading'
  | 'facialAnalysisResult'
  | 'arMakeupFilter'
  | 'arFilterLocation';

export function AppRoot() {
  const [activeScreen, setActiveScreen] = useState<AppScreen>('login');
  const [fontsLoaded] = useFonts({
    'NixieOne-Regular': require('../assets/fonts/NixieOne-Regular.ttf'),
    [typography.fontFamily.regular]: require('../assets/fonts/Pretendard-Regular.otf'),
    [typography.fontFamily.medium]: require('../assets/fonts/Pretendard-Medium.otf'),
    [typography.fontFamily.semibold]: require('../assets/fonts/Pretendard-SemiBold.otf'),
    [typography.fontFamily.bold]: require('../assets/fonts/Pretendard-Bold.otf'),
  });

  if (!fontsLoaded) {
    return null;
  }

  const renderActiveScreen = () => {
    if (activeScreen === 'login') {
      return <LoginScreen onLoginSuccess={() => setActiveScreen('faceCapture')} />;
    }

    if (activeScreen === 'faceCapture') {
      return (
        <FaceCaptureScreen
          onCapture={() => setActiveScreen('analysisLoading')}
          onClose={() => setActiveScreen('login')}
        />
      );
    }

    if (activeScreen === 'analysisLoading') {
      return (
        <AIAnalysisLoadingScreen
          onBack={() => setActiveScreen('faceCapture')}
          onComplete={() => setActiveScreen('facialAnalysisResult')}
        />
      );
    }

    if (activeScreen === 'facialAnalysisResult') {
      return (
        <FacialAnalysisResultScreen
          onBack={() => setActiveScreen('analysisLoading')}
          onStartARGuide={() => setActiveScreen('arMakeupFilter')}
        />
      );
    }

    if (activeScreen === 'arMakeupFilter') {
      return (
        <ARMakeupFilterScreen
          initialGuideMode="basic"
          onBack={() => setActiveScreen('facialAnalysisResult')}
          onOpenLocationAdjust={() => setActiveScreen('arFilterLocation')}
          onOpenStyleAdjust={() => undefined}
        />
      );
    }

    return (
      <ARFilterCustomLocationScreen
        onBack={() => setActiveScreen('arMakeupFilter')}
        onOpenStyleAdjust={() => undefined}
        onSave={() => setActiveScreen('arMakeupFilter')}
      />
    );
  };

  return (
    <TamaguiProvider config={tamaguiConfig} defaultTheme="light">
      <SafeAreaProvider>
        <>
          <StatusBar
            style={
              activeScreen === 'faceCapture' || activeScreen === 'arMakeupFilter'
                ? 'light'
                : 'dark'
            }
          />
          {renderActiveScreen()}
        </>
      </SafeAreaProvider>
    </TamaguiProvider>
  );
}
