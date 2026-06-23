import React, {useCallback, useState} from 'react';
import {useFonts} from 'expo-font';
import {StatusBar} from 'expo-status-bar';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {TamaguiProvider} from 'tamagui';

import {tamaguiConfig} from '../../tamagui.config';
import {LoginScreen} from '../features/auth';
import {
  FeedbackCaptureScreen,
  FeedbackEntryScreen,
  FeedbackGuideOverlayScreen,
  FeedbackLoadingScreen,
  FeedbackTipScreen,
  MakeupFeedbackScreen,
  type FeedbackPoint,
  type FeedbackPhotoSelection,
  type MakeupFeedbackResult,
} from '../features/feedback';
import {typography} from '../shared/theme';

type AppScreen =
  | 'login'
  | 'feedbackEntry'
  | 'feedbackCapture'
  | 'feedbackGuide'
  | 'feedbackLoading'
  | 'feedbackResult'
  | 'feedbackTip';

export function AppRoot() {
  const [activeScreen, setActiveScreen] = useState<AppScreen>('login');
  const [selectedPhoto, setSelectedPhoto] = useState<FeedbackPhotoSelection>({source: 'camera'});
  const [feedbackResult, setFeedbackResult] = useState<MakeupFeedbackResult | null>(null);
  const [selectedPoint, setSelectedPoint] = useState<FeedbackPoint | null>(null);
  const [fontsLoaded] = useFonts({
    'NixieOne-Regular': require('../assets/fonts/NixieOne-Regular.ttf'),
    [typography.fontFamily.regular]: require('../assets/fonts/Pretendard-Regular.otf'),
    [typography.fontFamily.medium]: require('../assets/fonts/Pretendard-Medium.otf'),
    [typography.fontFamily.semibold]: require('../assets/fonts/Pretendard-SemiBold.otf'),
    [typography.fontFamily.bold]: require('../assets/fonts/Pretendard-Bold.otf'),
  });

  const handlePhotoSelected = useCallback((selection: FeedbackPhotoSelection) => {
    setSelectedPhoto(selection);
    setActiveScreen('feedbackLoading');
  }, []);

  const handleFeedbackComplete = useCallback((result: MakeupFeedbackResult) => {
    setFeedbackResult(result);
    setActiveScreen('feedbackResult');
  }, []);

  const handleOpenTip = useCallback((point: FeedbackPoint) => {
    setSelectedPoint(point);
    setActiveScreen('feedbackTip');
  }, []);

  if (!fontsLoaded) {
    return null;
  }

  const renderScreen = () => {
    if (activeScreen === 'login') {
      return <LoginScreen onLoginSuccess={() => setActiveScreen('feedbackEntry')} />;
    }

    if (activeScreen === 'feedbackEntry') {
      return (
        <FeedbackEntryScreen onPressAiFeedback={() => setActiveScreen('feedbackCapture')} />
      );
    }

    if (activeScreen === 'feedbackCapture') {
      return (
        <FeedbackCaptureScreen
          onClose={() => setActiveScreen('feedbackEntry')}
          onSelectPhoto={handlePhotoSelected}
        />
      );
    }

    if (activeScreen === 'feedbackLoading') {
      return (
        <FeedbackLoadingScreen
          onComplete={handleFeedbackComplete}
          selection={selectedPhoto}
        />
      );
    }

    if (activeScreen === 'feedbackTip' && selectedPoint) {
      return (
        <FeedbackTipScreen
          onBack={() => setActiveScreen('feedbackResult')}
          point={selectedPoint}
        />
      );
    }

    if (activeScreen === 'feedbackGuide' && feedbackResult) {
      return (
        <FeedbackGuideOverlayScreen
          onBack={() => setActiveScreen('feedbackResult')}
          result={feedbackResult}
        />
      );
    }

    if (feedbackResult) {
      return (
        <MakeupFeedbackScreen
          onBack={() => setActiveScreen('feedbackEntry')}
          onOpenGuide={() => setActiveScreen('feedbackGuide')}
          onOpenTip={handleOpenTip}
          onRetake={() => setActiveScreen('feedbackCapture')}
          onUploadAgain={() => setActiveScreen('feedbackCapture')}
          result={feedbackResult}
        />
      );
    }

    return <FeedbackEntryScreen onPressAiFeedback={() => setActiveScreen('feedbackCapture')} />;
  };

  return (
    <TamaguiProvider config={tamaguiConfig} defaultTheme="light">
      <SafeAreaProvider>
        <>
          <StatusBar style={activeScreen === 'feedbackCapture' ? 'light' : 'dark'} />
          {renderScreen()}
        </>
      </SafeAreaProvider>
    </TamaguiProvider>
  );
}
