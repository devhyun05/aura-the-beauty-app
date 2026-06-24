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
} from '../features/analysis';
import {AIAnalysisLoadingScreen} from '../features/analysis/screens/AIAnalysisLoadingScreen';
import {ARFilterCustomLocationScreen} from '../features/ar/screens/ARFilterCustomLocationScreen';
import {ARFilterCustomStyleScreen} from '../features/ar/screens/ARFilterCustomStyleScreen';
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
import {MyPageScreen, ProfileEditScreen, UserPageScreen} from '../features/profile';
import {
  LikedProductListScreen,
  MakeupStyleListScreen,
  ProductRecommendationScreen,
} from '../features/recommendation';
import {colors, typography} from '../shared/theme';
import type {MakeupStylePreview} from '../shared/types/userPage';
import {AppFooter, AppHeader, AuraLogo, type FooterTabKey} from '../shared/ui';
import {
  getAnalysisLoadingCompleteTargetScreen,
  getAnalysisReportCloseTargetScreen,
  getAnalysisReportCreateFilterTargetScreen,
  getARMakeupFilterInitialGuideMode,
  getFooterTabTargetScreen,
  getHomeFaceDiagnosisTargetScreen,
} from './navigation';

type AppScreen =
  | 'login'
  | 'tutorial'
  | 'home'
  | 'faceCapture'
  | 'analysisLoading'
  | 'arMakeupFilter'
  | 'arFilterLocation'
  | 'arFilterStyle'
  | 'custom'
  | 'userPage'
  | 'myPage'
  | 'profileEdit'
  | 'analysisResultList'
  | 'analysisReportDetail'
  | 'makeupStyleList'
  | 'makeupLooks'
  | 'favoriteProducts'
  | 'likedProductList'
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
  const [selectedAnalysisResultId, setSelectedAnalysisResultId] =
    useState<string | null>(null);
  const [arFilterAdjustBackScreen, setArFilterAdjustBackScreen] =
    useState<AppScreen>('arMakeupFilter');

  const [fontsLoaded] = useFonts({
    [typography.fontFamily.brand]: require('../assets/fonts/NixieOne-Regular.ttf'),
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
      moodLabel: result.tags.slice(0, 2).join(' '),
      shortDescription: result.subtitle,
      title: result.title,
    });
    setActiveScreen('filterSaved');
  }, [selectedFilterPhoto]);

  if (!fontsLoaded) {
    return null;
  }

  const handleFooterTabPress = (tab: FooterTabKey) => {
    setActiveScreen(getFooterTabTargetScreen(tab));
  };

  const goToMyPage = () => {
    setActiveScreen('myPage');
  };

  const goToAnalysisReportDetail = (resultId: string | null) => {
    setSelectedAnalysisResultId(resultId);
    setActiveScreen('analysisReportDetail');
  };

  const goToLatestAnalysisReportDetail = () => {
    setSelectedAnalysisResultId(null);
    setActiveScreen(getAnalysisLoadingCompleteTargetScreen());
  };

  const goToARFilterLocation = (backScreen: AppScreen = 'arMakeupFilter') => {
    setArFilterAdjustBackScreen(backScreen);
    setActiveScreen('arFilterLocation');
  };

  const goToARFilterStyle = (backScreen: AppScreen = 'arMakeupFilter') => {
    setArFilterAdjustBackScreen(backScreen);
    setActiveScreen('arFilterStyle');
  };

  const goToAnalysisReportCreateFilter = () => {
    setArFilterAdjustBackScreen('analysisReportDetail');
    setActiveScreen(getAnalysisReportCreateFilterTargetScreen());
  };

  const renderScreen = () => {
    if (activeScreen === 'login') {
      return <LoginScreen onLoginSuccess={() => setActiveScreen('tutorial')} />;
    }

    if (activeScreen === 'tutorial') {
      return (
        <TutorialIntroScreen
          onCloseToHome={() => setActiveScreen('home')}
          onStartCapture={() => setActiveScreen('faceCapture')}
        />
      );
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
          onComplete={goToLatestAnalysisReportDetail}
        />
      );
    }

    if (activeScreen === 'arMakeupFilter') {
      return (
        <ARMakeupFilterScreen
          initialGuideMode={getARMakeupFilterInitialGuideMode()}
          onBack={() => setActiveScreen('home')}
          onComplete={() => setActiveScreen('home')}
          onOpenLocationAdjust={() => goToARFilterLocation()}
          onOpenStyleAdjust={() => goToARFilterStyle()}
        />
      );
    }

    if (activeScreen === 'arFilterLocation') {
      return (
        <ARFilterCustomLocationScreen
          onBack={() => setActiveScreen(arFilterAdjustBackScreen)}
          onOpenStyleAdjust={() => setActiveScreen('arFilterStyle')}
          onSave={() => setActiveScreen('arMakeupFilter')}
        />
      );
    }

    if (activeScreen === 'arFilterStyle') {
      return (
        <ARFilterCustomStyleScreen
          onBack={() => setActiveScreen(arFilterAdjustBackScreen)}
          onOpenLocationAdjust={() => setActiveScreen('arFilterLocation')}
          onSave={() => setActiveScreen('arMakeupFilter')}
        />
      );
    }

    if (activeScreen === 'userPage') {
      return (
        <AppShell
          onCreateFilterPress={() => setActiveScreen('filterUpload')}
          onProfilePress={goToMyPage}
          onTabPress={handleFooterTabPress}>
          <UserPageScreen
            onPressFavoriteProducts={() => setActiveScreen('likedProductList')}
            onPressMakeupStyles={() => setActiveScreen('makeupStyleList')}
            onPressReport={(resultId) =>
              goToAnalysisReportDetail(resultId)
            }
            onPressReports={() => setActiveScreen('analysisResultList')}
            onPressSettings={() => setActiveScreen('profileEdit')}
            savedMakeupStyle={savedMakeupStyle}
          />
        </AppShell>
      );
    }

    if (activeScreen === 'myPage') {
      return (
        <AppShell
          onCreateFilterPress={() => setActiveScreen('filterUpload')}
          onProfilePress={goToMyPage}
          onTabPress={handleFooterTabPress}>
          <MyPageScreen
            onPressAnalysisResult={(resultId) =>
              goToAnalysisReportDetail(resultId)
            }
            onPressAnalysisResultList={() => setActiveScreen('analysisResultList')}
            onPressLikedProductList={() => setActiveScreen('likedProductList')}
            onPressMakeupStyleList={() => setActiveScreen('makeupStyleList')}
            onPressProfileEdit={() => setActiveScreen('profileEdit')}
            savedMakeupStyle={savedMakeupStyle}
          />
        </AppShell>
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
            goToAnalysisReportDetail(resultId)
          }
        />
      );
    }

    if (activeScreen === 'analysisReportDetail') {
      return (
        <AnalysisReportDetailScreen
          onBack={() => setActiveScreen(getAnalysisReportCloseTargetScreen())}
          onCreateARFilter={goToAnalysisReportCreateFilter}
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
          onARFilterPress={() => setActiveScreen('arMakeupFilter')}
          onCreateFilterPress={() => setActiveScreen('filterUpload')}
          onFaceDiagnosisPress={() => setActiveScreen(getHomeFaceDiagnosisTargetScreen())}
          onProductRecommendationsPress={() => setActiveScreen('custom')}
          onProfilePress={goToMyPage}
          onTabPress={handleFooterTabPress}
        />
      );
    }

    return (
      <AppShell
        activeTab="home"
        onARFilterPress={() => setActiveScreen('arMakeupFilter')}
        onCreateFilterPress={() => setActiveScreen('filterUpload')}
        onFaceDiagnosisPress={() => setActiveScreen(getHomeFaceDiagnosisTargetScreen())}
        onProfilePress={goToMyPage}
        onTabPress={handleFooterTabPress}
      />
    );
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
  children,
  onARFilterPress,
  onCreateFilterPress,
  onFaceDiagnosisPress,
  onProductRecommendationsPress,
  onProfilePress,
  onTabPress,
}: {
  activeTab?: ShellTab;
  children?: React.ReactNode;
  onARFilterPress?: () => void;
  onCreateFilterPress?: () => void;
  onFaceDiagnosisPress?: () => void;
  onProductRecommendationsPress?: () => void;
  onProfilePress: () => void;
  onTabPress: (tab: FooterTabKey) => void;
}) {
  const insets = useSafeAreaInsets();

  return (
    <YStack style={styles.screen}>
      <AppHeader
        subtitle={activeTab === 'custom' ? 'AI PRODUCT MATCH' : 'MAKEUP GUIDE'}
        title={activeTab === 'custom' ? '추천 제품' : 'AI AR Makeup'}
        titleSlot={activeTab === 'home' ? <AuraLogo variant="header" /> : undefined}
        topInset={insets.top}
        onProfilePress={onProfilePress}
      />
      <YStack style={styles.body}>
        {children ??
          (activeTab === 'home' ? (
            <HomeScreen
              onPressARFilter={onARFilterPress}
              onPressCreateFilter={onCreateFilterPress}
              onPressFaceDiagnosis={onFaceDiagnosisPress}
              onPressProductRecommendations={onProductRecommendationsPress}
            />
          ) : null)}
        {!children && activeTab === 'custom' ? <ProductRecommendationScreen /> : null}
      </YStack>
      <AppFooter
        activeTab={activeTab}
        bottomInset={insets.bottom}
        floating
        onTabPress={onTabPress}
      />
    </YStack>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: colors.background,
    flex: 1,
    position: 'relative',
  },
  body: {
    flex: 1,
  },
});
