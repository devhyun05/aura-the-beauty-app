import React, {useCallback, useState} from 'react';
import {useFonts} from 'expo-font';
import {StatusBar} from 'expo-status-bar';
import {StyleSheet} from 'react-native';
import {SafeAreaProvider, useSafeAreaInsets} from 'react-native-safe-area-context';
import {TamaguiProvider, YStack} from 'tamagui';

import {tamaguiConfig} from '../../tamagui.config';
import {
  AnalysisReportDetailScreen,
  AnalysisResultListScreen,
  AnalysisResultsScreen,
} from '../features/analysis';
import {AIAnalysisLoadingScreen} from '../features/analysis/screens/AIAnalysisLoadingScreen';
import {ARFilterCustomLocationScreen} from '../features/ar/screens/ARFilterCustomLocationScreen';
import {ARFilterCustomStyleScreen} from '../features/ar/screens/ARFilterCustomStyleScreen';
import {FacialAnalysisResultScreen} from '../features/analysis/screens/FacialAnalysisResultScreen';
import {ARMakeupFilterScreen} from '../features/ar/screens/ARMakeupFilterScreen';
import {LoginScreen} from '../features/auth';
import {FaceCaptureScreen} from '../features/face-capture/screens/FaceCaptureScreen';
import {
  FeedbackCaptureScreen,
  FeedbackEntryScreen,
  FeedbackGuideOverlayScreen,
  FeedbackLoadingScreen,
  FeedbackTipScreen,
  MakeupFeedbackScreen,
  type FeedbackPhotoSelection,
  type FeedbackPoint,
  type MakeupFeedbackResult,
} from '../features/feedback';
import {HomeScreen} from '../features/home';
import {TutorialIntroScreen} from '../features/onboarding';
import {MyPageScreen, ProfileEditScreen, UserPageScreen} from '../features/profile';
import {
  LikedProductListScreen,
  MakeupStyleListScreen,
} from '../features/recommendation';
import {colors, typography} from '../shared/theme';
import {AppFooter, AppHeader, type FooterTabKey} from '../shared/ui';

type AppScreen =
  | 'login'
  | 'tutorial'
  | 'home'
  | 'faceCapture'
  | 'analysisLoading'
  | 'facialAnalysisResult'
  | 'arMakeupFilter'
  | 'arFilterLocation'
  | 'arFilterStyle'
  | 'custom'
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
  | 'likedProductList'
  | 'feedbackEntry'
  | 'feedbackCapture'
  | 'feedbackGuide'
  | 'feedbackLoading'
  | 'feedbackResult'
  | 'feedbackTip';

type ShellTab = Exclude<FooterTabKey, 'capture'>;

export function AppRoot() {
  const [activeScreen, setActiveScreen] = useState<AppScreen>('login');
  const [selectedPhoto, setSelectedPhoto] = useState<FeedbackPhotoSelection>({
    source: 'camera',
  });
  const [feedbackResult, setFeedbackResult] = useState<MakeupFeedbackResult | null>(null);
  const [selectedPoint, setSelectedPoint] = useState<FeedbackPoint | null>(null);
  const [selectedAnalysisResultId, setSelectedAnalysisResultId] =
    useState<string | null>(null);
  const [analysisDetailBackScreen, setAnalysisDetailBackScreen] =
    useState<AppScreen>('myPage');

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

  const handleFooterTabPress = (tab: FooterTabKey) => {
    if (tab === 'capture') {
      setActiveScreen('faceCapture');
      return;
    }

    setActiveScreen(tab);
  };

  const goToMyPage = () => {
    setActiveScreen('myPage');
  };

  const goToAnalysisReportDetail = (
    resultId: string | null,
    backScreen: AppScreen,
  ) => {
    setSelectedAnalysisResultId(resultId);
    setAnalysisDetailBackScreen(backScreen);
    setActiveScreen('analysisReportDetail');
  };

  const renderScreen = () => {
    if (activeScreen === 'login') {
      return <LoginScreen onLoginSuccess={() => setActiveScreen('feedbackEntry')} />;
    }

    if (activeScreen === 'tutorial') {
      return <TutorialIntroScreen onStartCapture={() => setActiveScreen('faceCapture')} />;
    }

    if (activeScreen === 'faceCapture') {
      return (
        <FaceCaptureScreen
          onCapture={() => setActiveScreen('analysisLoading')}
          onClose={() => setActiveScreen('home')}
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
          initialGuideMode="half"
          onBack={() => setActiveScreen('facialAnalysisResult')}
          onOpenLocationAdjust={() => setActiveScreen('arFilterLocation')}
          onOpenStyleAdjust={() => setActiveScreen('arFilterStyle')}
        />
      );
    }

    if (activeScreen === 'arFilterLocation') {
      return (
        <ARFilterCustomLocationScreen
          onBack={() => setActiveScreen('arMakeupFilter')}
          onOpenStyleAdjust={() => setActiveScreen('arFilterStyle')}
          onSave={() => setActiveScreen('arMakeupFilter')}
        />
      );
    }

    if (activeScreen === 'arFilterStyle') {
      return (
        <ARFilterCustomStyleScreen
          onBack={() => setActiveScreen('arMakeupFilter')}
          onOpenLocationAdjust={() => setActiveScreen('arFilterLocation')}
          onSave={() => setActiveScreen('arMakeupFilter')}
        />
      );
    }

    if (activeScreen === 'userPage') {
      return (
        <UserPageScreen
          onPressFavoriteProducts={() => setActiveScreen('likedProductList')}
          onPressMakeupStyles={() => setActiveScreen('makeupStyleList')}
          onPressReport={(resultId) =>
            goToAnalysisReportDetail(resultId, 'userPage')
          }
          onPressReports={() => setActiveScreen('analysisResultList')}
          onPressSettings={() => setActiveScreen('profileEdit')}
        />
      );
    }

    if (activeScreen === 'myPage') {
      return (
        <MyPageScreen
          onPressAnalysisResult={(resultId) =>
            goToAnalysisReportDetail(resultId, 'myPage')
          }
          onPressAnalysisResultList={() => setActiveScreen('analysisResultList')}
          onPressLikedProductList={() => setActiveScreen('likedProductList')}
          onPressMakeupStyleList={() => setActiveScreen('makeupStyleList')}
          onPressProfileEdit={() => setActiveScreen('profileEdit')}
        />
      );
    }

    if (activeScreen === 'profileEdit') {
      return (
        <ProfileEditScreen
          onBack={goToMyPage}
          onLogout={() => setActiveScreen('login')}
        />
      );
    }

    if (activeScreen === 'analysisResultList') {
      return (
        <AnalysisResultListScreen
          onBack={goToMyPage}
          onPressResult={(resultId) =>
            goToAnalysisReportDetail(resultId, 'analysisResultList')
          }
        />
      );
    }

    if (activeScreen === 'analysisResults') {
      return (
        <AnalysisResultsScreen
          onBack={() => setActiveScreen('userPage')}
          onPressResult={(resultId) =>
            goToAnalysisReportDetail(resultId, 'analysisResults')
          }
        />
      );
    }

    if (
      activeScreen === 'analysisReportDetail' ||
      activeScreen === 'analysisResultDetail'
    ) {
      return (
        <AnalysisReportDetailScreen
          onBack={() => setActiveScreen(analysisDetailBackScreen)}
          resultId={selectedAnalysisResultId}
        />
      );
    }

    if (activeScreen === 'makeupStyleList' || activeScreen === 'makeupLooks') {
      return <MakeupStyleListScreen onBack={goToMyPage} />;
    }

    if (
      activeScreen === 'likedProductList' ||
      activeScreen === 'favoriteProducts'
    ) {
      return <LikedProductListScreen onBack={goToMyPage} />;
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

    if (activeScreen === 'feedbackResult' && feedbackResult) {
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

    if (activeScreen === 'home' || activeScreen === 'custom') {
      return (
        <AppShell
          activeTab={activeScreen}
          onProfilePress={goToMyPage}
          onTabPress={handleFooterTabPress}
        />
      );
    }

    return <FeedbackEntryScreen onPressAiFeedback={() => setActiveScreen('feedbackCapture')} />;
  };

  return (
    <TamaguiProvider config={tamaguiConfig} defaultTheme="light">
      <SafeAreaProvider>
        <StatusBar
          style={
            activeScreen === 'faceCapture' ||
            activeScreen === 'feedbackCapture' ||
            activeScreen === 'arMakeupFilter'
              ? 'light'
              : 'dark'
          }
        />
        {renderScreen()}
      </SafeAreaProvider>
    </TamaguiProvider>
  );
}

function AppShell({
  activeTab,
  onProfilePress,
  onTabPress,
}: {
  activeTab: ShellTab;
  onProfilePress: () => void;
  onTabPress: (tab: FooterTabKey) => void;
}) {
  const insets = useSafeAreaInsets();

  return (
    <YStack style={styles.screen}>
      <AppHeader topInset={insets.top} onProfilePress={onProfilePress} />
      <YStack style={styles.body}>
        {activeTab === 'home' ? <HomeScreen /> : null}
      </YStack>
      <AppFooter activeTab={activeTab} bottomInset={insets.bottom} onTabPress={onTabPress} />
    </YStack>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: colors.background,
    flex: 1,
  },
  body: {
    flex: 1,
  },
});
