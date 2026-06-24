import React, {useCallback, useState} from 'react';
import {useFonts} from 'expo-font';
import {StatusBar} from 'expo-status-bar';
import {StyleSheet} from 'react-native';
import {SafeAreaProvider, useSafeAreaInsets} from 'react-native-safe-area-context';
import {TamaguiProvider, YStack} from 'tamagui';

import {tamaguiConfig} from '../../tamagui.config';
import {
  ImageAnalysisReportDetailScreen,
  ImageAnalysisReportsListScreen,
} from '../features/analysis';
import {ImageAnalysisLoadingScreen} from '../features/analysis/screens/ImageAnalysisLoadingScreen';
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
import {MyPageScreen, ProfileEditScreen} from '../features/profile';
import {
  LikedProductListScreen,
  MakeupStyleListScreen,
  ProductRecommendationScreen,
} from '../features/recommendation';
import {colors, spacing, typography} from '../shared/theme';
import type {MakeupStylePreview} from '../shared/types/myPage';
import {AppFooter, AppHeader, AppScreen, AuraLogo, type FooterTabKey} from '../shared/ui';
import {
  getARMakeupFilterInitialGuideMode,
  getAppShellHeaderCopy,
  getFooterTabTargetScreen,
  getHomeFaceDiagnosisTargetScreen,
  getImageAnalysisLoadingCompleteTargetScreen,
  getImageAnalysisReportCloseTargetScreen,
  getImageAnalysisReportCreateFilterTargetScreen,
  getSavedContentTargetScreen,
  type AppShellHeaderVariant,
} from './navigation';

type AppScreen =
  | 'login'
  | 'tutorial'
  | 'home'
  | 'faceCapture'
  | 'imageAnalysisLoading'
  | 'arMakeupFilter'
  | 'arFilterLocation'
  | 'arFilterStyle'
  | 'custom'
  | 'myPage'
  | 'profileEdit'
  | 'imageAnalysisReportsList'
  | 'imageAnalysisReportDetail'
  | 'makeupStyleList'
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
  const [selectedImageAnalysisReportId, setSelectedImageAnalysisReportId] =
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

  const goToImageAnalysisReportDetail = (reportId: string | null) => {
    setSelectedImageAnalysisReportId(reportId);
    setActiveScreen('imageAnalysisReportDetail');
  };

  const goToLatestImageAnalysisReportDetail = () => {
    setSelectedImageAnalysisReportId(null);
    setActiveScreen(getImageAnalysisLoadingCompleteTargetScreen());
  };

  const goToARFilterLocation = (backScreen: AppScreen = 'arMakeupFilter') => {
    setArFilterAdjustBackScreen(backScreen);
    setActiveScreen('arFilterLocation');
  };

  const goToARFilterStyle = (backScreen: AppScreen = 'arMakeupFilter') => {
    setArFilterAdjustBackScreen(backScreen);
    setActiveScreen('arFilterStyle');
  };

  const goToImageAnalysisReportCreateFilter = () => {
    setArFilterAdjustBackScreen('imageAnalysisReportDetail');
    setActiveScreen(getImageAnalysisReportCreateFilterTargetScreen());
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
          onCapture={() => setActiveScreen('imageAnalysisLoading')}
          onClose={() => setActiveScreen('home')}
        />
      );
    }

    if (activeScreen === 'imageAnalysisLoading') {
      return (
        <ImageAnalysisLoadingScreen
          onBack={() => setActiveScreen('faceCapture')}
          onComplete={goToLatestImageAnalysisReportDetail}
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

    if (activeScreen === 'myPage') {
      return (
        <AppShell
          headerVariant="default"
          onCreateFilterPress={() => setActiveScreen('filterUpload')}
          onProfilePress={goToMyPage}
          onTabPress={handleFooterTabPress}
          wrapContentInScreen={false}>
          <MyPageScreen
            onPressImageAnalysisReport={(reportId) =>
              goToImageAnalysisReportDetail(reportId)
            }
            onPressImageAnalysisReportsList={() =>
              setActiveScreen('imageAnalysisReportsList')
            }
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

    if (activeScreen === 'imageAnalysisReportsList') {
      return (
        <ImageAnalysisReportsListScreen
          onBack={goToMyPage}
          onPressReport={(reportId) =>
            goToImageAnalysisReportDetail(reportId)
          }
        />
      );
    }

    if (activeScreen === 'imageAnalysisReportDetail') {
      return (
        <ImageAnalysisReportDetailScreen
          onBack={() =>
            setActiveScreen(getImageAnalysisReportCloseTargetScreen())
          }
          onCreateARFilter={goToImageAnalysisReportCreateFilter}
          reportId={selectedImageAnalysisReportId}
        />
      );
    }

    if (activeScreen === 'makeupStyleList') {
      return <MakeupStyleListScreen onBack={goToMyPage} />;
    }

    if (activeScreen === 'likedProductList') {
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
          onGoToMyPage={() => setActiveScreen(getSavedContentTargetScreen())}
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
          onGoToMyPage={() => setActiveScreen(getSavedContentTargetScreen())}
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
          onMakeupFeedbackPress={() => setActiveScreen('feedbackEntry')}
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
        onMakeupFeedbackPress={() => setActiveScreen('feedbackEntry')}
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
  headerVariant,
  onARFilterPress,
  onCreateFilterPress,
  onFaceDiagnosisPress,
  onMakeupFeedbackPress,
  onProductRecommendationsPress,
  onProfilePress,
  onTabPress,
  wrapContentInScreen = true,
}: {
  activeTab?: ShellTab;
  children?: React.ReactNode;
  headerVariant?: AppShellHeaderVariant;
  onARFilterPress?: () => void;
  onCreateFilterPress?: () => void;
  onFaceDiagnosisPress?: () => void;
  onMakeupFeedbackPress?: () => void;
  onProductRecommendationsPress?: () => void;
  onProfilePress: () => void;
  onTabPress: (tab: FooterTabKey) => void;
  wrapContentInScreen?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const resolvedHeaderVariant = headerVariant ?? activeTab ?? 'default';
  const headerCopy = getAppShellHeaderCopy(resolvedHeaderVariant);
  const contentGap = resolvedHeaderVariant === 'home' ? spacing.xxl : spacing.xl;
  const shellContent =
    children ??
    (activeTab === 'home' ? (
      <HomeScreen
        onPressARFilter={onARFilterPress}
        onPressCreateFilter={onCreateFilterPress}
        onPressFaceDiagnosis={onFaceDiagnosisPress}
        onPressMakeupFeedback={onMakeupFeedbackPress}
        onPressProductRecommendations={onProductRecommendationsPress}
      />
    ) : activeTab === 'custom' ? (
      <ProductRecommendationScreen />
    ) : null);

  return (
    <YStack style={styles.screen}>
      <AppHeader
        subtitle={headerCopy.subtitle}
        title={headerCopy.title}
        titleSlot={resolvedHeaderVariant === 'home' ? <AuraLogo variant="header" /> : undefined}
        topInset={insets.top}
        onProfilePress={onProfilePress}
      />
      <YStack style={styles.body}>
        {wrapContentInScreen ? (
          <AppScreen contentGap={contentGap} topPadding="belowShellHeader">
            {shellContent}
          </AppScreen>
        ) : (
          shellContent
        )}
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
