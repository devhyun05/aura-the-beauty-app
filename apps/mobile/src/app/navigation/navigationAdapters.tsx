import React from 'react';
import {StyleSheet} from 'react-native';
import type {BottomTabScreenProps} from '@react-navigation/bottom-tabs';
import type {CompositeScreenProps, NavigationProp} from '@react-navigation/native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {YStack} from 'tamagui';

import {colors, spacing} from '../../shared/theme';
import type {GuideMode} from '../../shared/types/makeupGuide';
import {AppHeader, AppScreen, AuraLogo, RoutePlaceholder} from '../../shared/ui';
import {
  ImageAnalysisReportDetailScreen,
  ImageAnalysisReportsListScreen,
} from '../../features/analysis';
import {ImageAnalysisLoadingScreen} from '../../features/analysis/screens/ImageAnalysisLoadingScreen';
import {ARFilterCustomLocationScreen} from '../../features/ar/screens/ARFilterCustomLocationScreen';
import {ARFilterCustomStyleScreen} from '../../features/ar/screens/ARFilterCustomStyleScreen';
import {ARMakeupFilterScreen} from '../../features/ar/screens/ARMakeupFilterScreen';
import {LoginScreen} from '../../features/auth';
import {FaceCaptureScreen} from '../../features/face-capture/screens/FaceCaptureScreen';
import {
  FeedbackCaptureScreen,
  FeedbackEntryScreen,
  FeedbackGuideOverlayScreen,
  FeedbackLoadingScreen,
  FeedbackTipScreen,
  MakeupFeedbackScreen,
  type FeedbackPhotoSelection,
  type MakeupFeedbackResult,
} from '../../features/feedback';
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
} from '../../features/filter-extraction';
import {getFilterExtractionDataSync} from '../../features/filter-extraction/services/filterExtractionService';
import {HomeScreen} from '../../features/home';
import {TutorialIntroScreen} from '../../features/onboarding';
import {MyPageScreen, ProfileEditScreen} from '../../features/profile';
import {
  LikedProductListScreen,
  MakeupStyleListScreen,
  ProductRecommendationScreen,
} from '../../features/recommendation';
import type {ARFilterBackRouteName, MainTabParamList, MainTabRouteName, RootStackParamList} from './routeTypes';
import {useNavigationFlowState} from './flowState';
import {getMainHeaderCopy} from './mainTabChrome';
import {getDetailRouteTitle} from './routeChrome';

type RootScreenProps<RouteName extends keyof RootStackParamList> =
  NativeStackScreenProps<RootStackParamList, RouteName>;

type MainTabScreenProps<RouteName extends keyof MainTabParamList> =
  CompositeScreenProps<
    BottomTabScreenProps<MainTabParamList, RouteName>,
    NativeStackScreenProps<RootStackParamList>
  >;

type RootNavigation = NavigationProp<RootStackParamList>;

type MainTabChromeProps = {
  children: React.ReactNode;
  navigation: BottomTabScreenProps<MainTabParamList>['navigation'];
  routeName: MainTabRouteName;
  wrapContentInScreen?: boolean;
};

const DEFAULT_AR_GUIDE_MODE: GuideMode = 'basic';

function navigateMainTab(
  navigation: RootNavigation,
  screen: MainTabRouteName = 'HomeTab',
) {
  navigation.navigate('MainTabs', {screen});
}

function navigateARBack(navigation: RootNavigation, backRoute?: ARFilterBackRouteName) {
  if (backRoute === 'ImageAnalysisReportDetail') {
    navigation.navigate('ImageAnalysisReportDetail');
    return;
  }

  navigation.navigate('ARMakeupFilter');
}

function getSelectedFilterPhoto(photo: FilterExtractionPhoto | null): FilterExtractionPhoto {
  return photo ?? getFilterExtractionDataSync().photos[0];
}

function buildSavedMakeupStyle(photo: FilterExtractionPhoto) {
  const {result} = getFilterExtractionDataSync();

  return {
    id: 'saved-extracted-makeup-look',
    imageSource: photo.imageSource,
    isSaved: true,
    moodLabel: result.tags.slice(0, 2).join(' '),
    shortDescription: result.subtitle,
    title: result.title,
  };
}

function MainTabChrome({
  children,
  navigation,
  routeName,
  wrapContentInScreen = true,
}: MainTabChromeProps) {
  const insets = useSafeAreaInsets();
  const headerCopy = getMainHeaderCopy(routeName);
  const contentGap = routeName === 'HomeTab' ? spacing.xxl : spacing.xl;

  return (
    <YStack style={styles.screen}>
      <AppHeader
        subtitle={headerCopy.subtitle}
        title={headerCopy.title}
        titleSlot={headerCopy.usesBrandLogo ? <AuraLogo variant="header" /> : undefined}
        topInset={insets.top}
        onProfilePress={() => navigation.navigate('MyPageTab')}
      />
      <YStack style={styles.body}>
        {wrapContentInScreen ? (
          <AppScreen contentGap={contentGap} topPadding="belowShellHeader">
            {children}
          </AppScreen>
        ) : (
          children
        )}
      </YStack>
    </YStack>
  );
}

export function LoginRouteScreen({navigation}: RootScreenProps<'Login'>) {
  return <LoginScreen onLoginSuccess={() => navigation.replace('Tutorial')} />;
}

export function TutorialRouteScreen({navigation}: RootScreenProps<'Tutorial'>) {
  return (
    <TutorialIntroScreen
      onCloseToHome={() => navigateMainTab(navigation, 'HomeTab')}
      onStartCapture={() => navigation.navigate('FaceCapture')}
    />
  );
}

export function HomeRouteScreen({navigation}: MainTabScreenProps<'HomeTab'>) {
  const rootNavigation = navigation.getParent<RootNavigation>();

  return (
    <MainTabChrome navigation={navigation} routeName="HomeTab">
      <HomeScreen
        onPressARFilter={() => rootNavigation?.navigate('ARMakeupFilter')}
        onPressCreateFilter={() => rootNavigation?.navigate('FilterUpload')}
        onPressFaceDiagnosis={() => rootNavigation?.navigate('Tutorial')}
        onPressMakeupFeedback={() => rootNavigation?.navigate('FeedbackEntry')}
        onPressProductRecommendations={() => navigation.navigate('CustomTab')}
      />
    </MainTabChrome>
  );
}

export function CustomRouteScreen({navigation}: MainTabScreenProps<'CustomTab'>) {
  return (
    <MainTabChrome navigation={navigation} routeName="CustomTab">
      <ProductRecommendationScreen />
    </MainTabChrome>
  );
}

export function MyPageRouteScreen({navigation}: MainTabScreenProps<'MyPageTab'>) {
  const rootNavigation = navigation.getParent<RootNavigation>();
  const {savedMakeupStyle} = useNavigationFlowState();

  return (
    <MainTabChrome
      navigation={navigation}
      routeName="MyPageTab"
      wrapContentInScreen={false}>
      <MyPageScreen
        onPressImageAnalysisReport={reportId =>
          rootNavigation?.navigate('ImageAnalysisReportDetail', {reportId})
        }
        onPressImageAnalysisReportsList={() =>
          rootNavigation?.navigate('ImageAnalysisReportsList')
        }
        onPressLikedProductList={() => rootNavigation?.navigate('LikedProductList')}
        onPressMakeupStyleList={() => rootNavigation?.navigate('MakeupStyleList')}
        onPressProfileEdit={() => rootNavigation?.navigate('ProfileEdit')}
        savedMakeupStyle={savedMakeupStyle}
      />
    </MainTabChrome>
  );
}

export function FaceCaptureRouteScreen({navigation}: RootScreenProps<'FaceCapture'>) {
  return (
    <FaceCaptureScreen
      onCapture={() => navigation.navigate('ImageAnalysisLoading')}
      onClose={() => navigateMainTab(navigation, 'HomeTab')}
    />
  );
}

export function ImageAnalysisLoadingRouteScreen({
  navigation,
}: RootScreenProps<'ImageAnalysisLoading'>) {
  return (
    <ImageAnalysisLoadingScreen
      headerTitle={getDetailRouteTitle('ImageAnalysisLoading')}
      onBack={() => navigation.navigate('FaceCapture')}
      onComplete={() => navigation.navigate('ImageAnalysisReportDetail')}
    />
  );
}

export function ImageAnalysisReportsListRouteScreen({
  navigation,
}: RootScreenProps<'ImageAnalysisReportsList'>) {
  return (
    <ImageAnalysisReportsListScreen
      headerTitle={getDetailRouteTitle('ImageAnalysisReportsList')}
      onBack={() => navigateMainTab(navigation, 'MyPageTab')}
      onPressReport={reportId =>
        navigation.navigate('ImageAnalysisReportDetail', {reportId})
      }
    />
  );
}

export function ImageAnalysisReportDetailRouteScreen({
  navigation,
  route,
}: RootScreenProps<'ImageAnalysisReportDetail'>) {
  return (
    <ImageAnalysisReportDetailScreen
      headerTitle={getDetailRouteTitle('ImageAnalysisReportDetail')}
      onBack={() => navigateMainTab(navigation, 'HomeTab')}
      onCreateARFilter={() =>
        navigation.navigate('ARFilterStyle', {backRoute: 'ImageAnalysisReportDetail'})
      }
      reportId={route.params?.reportId ?? null}
    />
  );
}

export function ARMakeupFilterRouteScreen({navigation}: RootScreenProps<'ARMakeupFilter'>) {
  return (
    <ARMakeupFilterScreen
      initialGuideMode={DEFAULT_AR_GUIDE_MODE}
      onBack={() => navigateMainTab(navigation, 'HomeTab')}
      onComplete={() => navigateMainTab(navigation, 'HomeTab')}
      onOpenLocationAdjust={() => navigation.navigate('ARFilterLocation')}
      onOpenStyleAdjust={() => navigation.navigate('ARFilterStyle')}
    />
  );
}

export function ARFilterLocationRouteScreen({
  navigation,
  route,
}: RootScreenProps<'ARFilterLocation'>) {
  return (
    <ARFilterCustomLocationScreen
      onBack={() => navigateARBack(navigation, route.params?.backRoute)}
      onOpenStyleAdjust={() =>
        navigation.navigate('ARFilterStyle', {backRoute: route.params?.backRoute})
      }
      onSave={() => navigation.navigate('ARMakeupFilter')}
    />
  );
}

export function ARFilterStyleRouteScreen({
  navigation,
  route,
}: RootScreenProps<'ARFilterStyle'>) {
  return (
    <ARFilterCustomStyleScreen
      onBack={() => navigateARBack(navigation, route.params?.backRoute)}
      onOpenLocationAdjust={() =>
        navigation.navigate('ARFilterLocation', {backRoute: route.params?.backRoute})
      }
      onSave={() => navigation.navigate('ARMakeupFilter')}
    />
  );
}

export function ProfileEditRouteScreen({navigation}: RootScreenProps<'ProfileEdit'>) {
  return (
    <ProfileEditScreen
      headerTitle={getDetailRouteTitle('ProfileEdit')}
      onBack={() => navigateMainTab(navigation, 'MyPageTab')}
      onLogout={() => navigation.reset({index: 0, routes: [{name: 'Login'}]})}
    />
  );
}

export function MakeupStyleListRouteScreen({
  navigation,
}: RootScreenProps<'MakeupStyleList'>) {
  return (
    <MakeupStyleListScreen
      headerTitle={getDetailRouteTitle('MakeupStyleList')}
      onBack={() => navigateMainTab(navigation, 'MyPageTab')}
    />
  );
}

export function LikedProductListRouteScreen({
  navigation,
}: RootScreenProps<'LikedProductList'>) {
  return (
    <LikedProductListScreen
      headerTitle={getDetailRouteTitle('LikedProductList')}
      onBack={() => navigateMainTab(navigation, 'MyPageTab')}
    />
  );
}

export function FeedbackEntryRouteScreen({navigation}: RootScreenProps<'FeedbackEntry'>) {
  return (
    <FeedbackEntryScreen
      headerTitle={getDetailRouteTitle('FeedbackEntry')}
      onClose={() => navigateMainTab(navigation, 'HomeTab')}
      onPressAiFeedback={() => navigation.navigate('FeedbackCapture')}
    />
  );
}

export function FeedbackCaptureRouteScreen({
  navigation,
}: RootScreenProps<'FeedbackCapture'>) {
  const {setSelectedFeedbackPhoto} = useNavigationFlowState();

  const handleSelectPhoto = (selection: FeedbackPhotoSelection) => {
    setSelectedFeedbackPhoto(selection);
    navigation.navigate('FeedbackLoading');
  };

  return (
    <FeedbackCaptureScreen
      onClose={() => navigation.navigate('FeedbackEntry')}
      onSelectPhoto={handleSelectPhoto}
    />
  );
}

export function FeedbackLoadingRouteScreen({
  navigation,
}: RootScreenProps<'FeedbackLoading'>) {
  const {selectedFeedbackPhoto, setFeedbackResult} = useNavigationFlowState();

  const handleComplete = (result: MakeupFeedbackResult) => {
    setFeedbackResult(result);
    navigation.navigate('FeedbackResult');
  };

  return (
    <FeedbackLoadingScreen
      headerTitle={getDetailRouteTitle('FeedbackLoading')}
      onBack={() => navigation.navigate('FeedbackCapture')}
      onComplete={handleComplete}
      selection={selectedFeedbackPhoto}
    />
  );
}

export function FeedbackResultRouteScreen({navigation}: RootScreenProps<'FeedbackResult'>) {
  const {feedbackResult} = useNavigationFlowState();

  if (!feedbackResult) {
    return (
      <RoutePlaceholder
        description="피드백 분석을 먼저 완료해 주세요."
        onBack={() => navigation.navigate('FeedbackEntry')}
        title="메이크업 피드백"
      />
    );
  }

  return (
    <MakeupFeedbackScreen
      headerTitle={getDetailRouteTitle('FeedbackResult')}
      onBack={() => navigation.navigate('FeedbackEntry')}
      onOpenGuide={() => navigation.navigate('FeedbackGuide')}
      onOpenTip={point => navigation.navigate('FeedbackTip', {pointId: point.id})}
      onRetake={() => navigation.navigate('FeedbackCapture')}
      onUploadAgain={() => navigation.navigate('FeedbackCapture')}
      result={feedbackResult}
    />
  );
}

export function FeedbackGuideRouteScreen({navigation}: RootScreenProps<'FeedbackGuide'>) {
  const {feedbackResult} = useNavigationFlowState();

  if (!feedbackResult) {
    return (
      <RoutePlaceholder
        description="가이드를 보려면 피드백 결과가 필요해요."
        onBack={() => navigation.navigate('FeedbackResult')}
        title="가이드 오버레이"
      />
    );
  }

  return (
    <FeedbackGuideOverlayScreen
      headerTitle={getDetailRouteTitle('FeedbackGuide')}
      onBack={() => navigation.navigate('FeedbackResult')}
      result={feedbackResult}
    />
  );
}

export function FeedbackTipRouteScreen({
  navigation,
  route,
}: RootScreenProps<'FeedbackTip'>) {
  const {feedbackResult} = useNavigationFlowState();
  const point = feedbackResult?.points.find(item => item.id === route.params.pointId);

  if (!point) {
    return (
      <RoutePlaceholder
        description="선택한 수정팁을 찾을 수 없어요."
        onBack={() => navigation.navigate('FeedbackResult')}
        title="수정팁"
      />
    );
  }

  return (
    <FeedbackTipScreen
      headerTitle={getDetailRouteTitle('FeedbackTip')}
      onBack={() => navigation.navigate('FeedbackResult')}
      point={point}
    />
  );
}

export function FilterUploadRouteScreen({navigation}: RootScreenProps<'FilterUpload'>) {
  const {setSelectedFilterPhoto} = useNavigationFlowState();

  const handleStartAnalysis = (photo: FilterExtractionPhoto) => {
    setSelectedFilterPhoto(photo);
    navigation.navigate('FilterLoading');
  };

  return (
    <FilterImageUploadScreen
      headerTitle={getDetailRouteTitle('FilterUpload')}
      onClose={() => navigateMainTab(navigation, 'HomeTab')}
      onStartAnalysis={handleStartAnalysis}
    />
  );
}

export function FilterLoadingRouteScreen({navigation}: RootScreenProps<'FilterLoading'>) {
  const {selectedFilterPhoto} = useNavigationFlowState();
  const photo = getSelectedFilterPhoto(selectedFilterPhoto);

  return (
    <FilterExtractionLoadingScreen
      onBack={() => navigation.navigate('FilterUpload')}
      onComplete={() => navigation.navigate('FilterResult')}
      photo={photo}
    />
  );
}

export function FilterResultRouteScreen({navigation}: RootScreenProps<'FilterResult'>) {
  const {selectedFilterPhoto} = useNavigationFlowState();
  const photo = getSelectedFilterPhoto(selectedFilterPhoto);

  return (
    <FilterExtractionResultScreen
      headerTitle={getDetailRouteTitle('FilterResult')}
      onApplyFilter={() => navigation.navigate('FilterTryOn')}
      onBack={() => navigation.navigate('FilterUpload')}
      onRetake={() => navigation.navigate('FilterUpload')}
      photo={photo}
    />
  );
}

export function FilterTryOnRouteScreen({navigation}: RootScreenProps<'FilterTryOn'>) {
  const {selectedFilterPhoto} = useNavigationFlowState();
  const photo = getSelectedFilterPhoto(selectedFilterPhoto);

  return (
    <FilterTryOnAdjustScreen
      onClose={() => navigation.navigate('FilterResult')}
      onCreateRecipe={() => navigation.navigate('FilterRecipeDetail')}
      onSave={() => navigation.navigate('FilterSave')}
      photo={photo}
    />
  );
}

export function FilterSaveRouteScreen({navigation}: RootScreenProps<'FilterSave'>) {
  const {selectedFilterPhoto, setSavedMakeupStyle} = useNavigationFlowState();
  const photo = getSelectedFilterPhoto(selectedFilterPhoto);

  const handleSave = () => {
    setSavedMakeupStyle(buildSavedMakeupStyle(photo));
    navigation.navigate('FilterSaved');
  };

  return (
    <FilterSaveScreen
      headerTitle={getDetailRouteTitle('FilterSave')}
      onBack={() => navigation.navigate('FilterTryOn')}
      onSave={handleSave}
      photo={photo}
    />
  );
}

export function FilterSavedRouteScreen({navigation}: RootScreenProps<'FilterSaved'>) {
  return (
    <FilterSavedScreen
      onApplyNow={() => navigation.navigate('FilterTryOn')}
      onGoToMyPage={() => navigateMainTab(navigation, 'MyPageTab')}
    />
  );
}

export function FilterRecipeDetailRouteScreen({
  navigation,
}: RootScreenProps<'FilterRecipeDetail'>) {
  const {selectedFilterPhoto} = useNavigationFlowState();
  const photo = getSelectedFilterPhoto(selectedFilterPhoto);

  return (
    <FilterRecipeDetailScreen
      headerTitle={getDetailRouteTitle('FilterRecipeDetail')}
      onBack={() => navigation.navigate('FilterTryOn')}
      onSaveRecipe={() => navigation.navigate('RecipeSaved')}
      photo={photo}
    />
  );
}

export function RecipeSavedRouteScreen({navigation}: RootScreenProps<'RecipeSaved'>) {
  return (
    <RecipeSavedScreen
      onBackToDetail={() => navigation.navigate('FilterRecipeDetail')}
      onGoToMyPage={() => navigateMainTab(navigation, 'MyPageTab')}
    />
  );
}

const styles = StyleSheet.create({
  body: {
    flex: 1,
  },
  screen: {
    backgroundColor: colors.background,
    flex: 1,
    position: 'relative',
  },
});
