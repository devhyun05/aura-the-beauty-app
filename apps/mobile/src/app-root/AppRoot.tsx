import React, {useCallback, useState} from 'react';
import {useFonts} from 'expo-font';
import {StatusBar} from 'expo-status-bar';
import {StyleSheet} from 'react-native';
import {SafeAreaProvider, useSafeAreaInsets} from 'react-native-safe-area-context';
import {TamaguiProvider, YStack} from 'tamagui';

import {tamaguiConfig} from '../../tamagui.config';
import {AnalysisResultsScreen} from '../features/analysis';
import {AIAnalysisLoadingScreen} from '../features/analysis/screens/AIAnalysisLoadingScreen';
import {ARFilterCustomLocationScreen} from '../features/ar/screens/ARFilterCustomLocationScreen';
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
import {
  FilterExtractionLoadingScreen,
  FilterExtractionResultScreen,
  FilterImageUploadScreen,
  FilterRecipeDetailScreen,
  FilterSavedScreen,
  FilterSaveScreen,
  FilterTryOnAdjustScreen,
  RecipeSavedScreen,
  type FilterExtractionPhoto,
} from '../features/filter-extraction';
import {getFilterExtractionDataSync} from '../features/filter-extraction/services/filterExtractionService';
import {HomeScreen} from '../features/home';
import {TutorialIntroScreen} from '../features/onboarding';
import {UserPageScreen} from '../features/profile';
import {colors, typography} from '../shared/theme';
import type {MakeupStylePreview} from '../shared/types/userPage';
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
  | 'custom'
  | 'userPage'
  | 'analysisResults'
  | 'feedbackEntry'
  | 'feedbackCapture'
  | 'feedbackGuide'
  | 'feedbackLoading'
  | 'feedbackResult'
  | 'feedbackTip'
  | 'filterUpload'
  | 'filterLoading'
  | 'filterResult'
  | 'filterTryOn'
  | 'filterSave'
  | 'filterSaved'
  | 'filterRecipeDetail'
  | 'recipeSaved';

type ShellTab = Exclude<FooterTabKey, 'capture'>;

export function AppRoot() {
  const [activeScreen, setActiveScreen] = useState<AppScreen>('login');
  const [selectedPhoto, setSelectedPhoto] = useState<FeedbackPhotoSelection>({
    source: 'camera',
  });
  const [selectedFilterPhoto, setSelectedFilterPhoto] =
    useState<FilterExtractionPhoto | null>(null);
  const [savedMakeupStyle, setSavedMakeupStyle] =
    useState<MakeupStylePreview | null>(null);
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

  const handleStartFilterExtraction = useCallback((photo: FilterExtractionPhoto) => {
    setSelectedFilterPhoto(photo);
    setActiveScreen('filterLoading');
  }, []);

  const handleFilterSaved = useCallback(() => {
    const photo = selectedFilterPhoto ?? getFilterExtractionDataSync().photos[0];
    const {result} = getFilterExtractionDataSync();

    setSavedMakeupStyle({
      id: 'saved-extracted-makeup-look',
      imageSource: photo.imageSource,
      isSaved: true,
      title: result.title,
    });
    setActiveScreen('filterSaved');
  }, [selectedFilterPhoto]);

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

  const renderScreen = () => {
    if (activeScreen === 'login') {
      return <LoginScreen onLoginSuccess={() => setActiveScreen('home')} />;
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
          onOpenStyleAdjust={() => undefined}
        />
      );
    }

    if (activeScreen === 'arFilterLocation') {
      return (
        <ARFilterCustomLocationScreen
          onBack={() => setActiveScreen('arMakeupFilter')}
          onOpenStyleAdjust={() => undefined}
          onSave={() => setActiveScreen('arMakeupFilter')}
        />
      );
    }

    if (activeScreen === 'userPage') {
      return (
        <UserPageScreen
          onPressReports={() => setActiveScreen('analysisResults')}
          savedMakeupStyle={savedMakeupStyle}
        />
      );
    }

    if (activeScreen === 'analysisResults') {
      return <AnalysisResultsScreen onBack={() => setActiveScreen('userPage')} />;
    }

    if (activeScreen === 'filterUpload') {
      return (
        <FilterImageUploadScreen
          onClose={() => setActiveScreen('home')}
          onStartAnalysis={handleStartFilterExtraction}
        />
      );
    }

    if (activeScreen === 'filterLoading') {
      const photo = selectedFilterPhoto ?? getFilterExtractionDataSync().photos[0];

      return (
        <FilterExtractionLoadingScreen
          onBack={() => setActiveScreen('filterUpload')}
          onComplete={() => setActiveScreen('filterResult')}
          photo={photo}
        />
      );
    }

    if (activeScreen === 'filterResult') {
      const photo = selectedFilterPhoto ?? getFilterExtractionDataSync().photos[0];

      return (
        <FilterExtractionResultScreen
          onApplyFilter={() => setActiveScreen('filterTryOn')}
          onBack={() => setActiveScreen('filterUpload')}
          onRetake={() => setActiveScreen('filterUpload')}
          photo={photo}
        />
      );
    }

    if (activeScreen === 'filterTryOn') {
      const photo = selectedFilterPhoto ?? getFilterExtractionDataSync().photos[0];

      return (
        <FilterTryOnAdjustScreen
          onClose={() => setActiveScreen('filterResult')}
          onCreateRecipe={() => setActiveScreen('filterRecipeDetail')}
          onSave={() => setActiveScreen('filterSave')}
          photo={photo}
        />
      );
    }

    if (activeScreen === 'filterSave') {
      const photo = selectedFilterPhoto ?? getFilterExtractionDataSync().photos[0];

      return (
        <FilterSaveScreen
          onBack={() => setActiveScreen('filterTryOn')}
          onSave={handleFilterSaved}
          photo={photo}
        />
      );
    }

    if (activeScreen === 'filterSaved') {
      return (
        <FilterSavedScreen
          onApplyNow={() => setActiveScreen('filterTryOn')}
          onGoToUserPage={() => setActiveScreen('userPage')}
        />
      );
    }

    if (activeScreen === 'filterRecipeDetail') {
      const photo = selectedFilterPhoto ?? getFilterExtractionDataSync().photos[0];

      return (
        <FilterRecipeDetailScreen
          onBack={() => setActiveScreen('filterTryOn')}
          onSaveRecipe={() => setActiveScreen('recipeSaved')}
          photo={photo}
        />
      );
    }

    if (activeScreen === 'recipeSaved') {
      return (
        <RecipeSavedScreen
          onBackToDetail={() => setActiveScreen('filterRecipeDetail')}
          onGoToUserPage={() => setActiveScreen('userPage')}
        />
      );
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
          onCreateFilterPress={() => setActiveScreen('filterUpload')}
          onProfilePress={() => setActiveScreen('userPage')}
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
  onCreateFilterPress,
  onProfilePress,
  onTabPress,
}: {
  activeTab: ShellTab;
  onCreateFilterPress: () => void;
  onProfilePress: () => void;
  onTabPress: (tab: FooterTabKey) => void;
}) {
  const insets = useSafeAreaInsets();

  return (
    <YStack style={styles.screen}>
      <AppHeader topInset={insets.top} onProfilePress={onProfilePress} />
      <YStack style={styles.body}>
        {activeTab === 'home' ? (
          <HomeScreen onPressCreateFilter={onCreateFilterPress} />
        ) : null}
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
