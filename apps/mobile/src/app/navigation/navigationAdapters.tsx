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
} from '../../features/image-analysis';
import {ImageAnalysisLoadingScreen} from '../../features/image-analysis/screens/ImageAnalysisLoadingScreen';
import {ARFilterLocationAdjustScreen} from '../../features/ar/screens/ARFilterLocationAdjustScreen';
import {ARFilterStyleAdjustScreen} from '../../features/ar/screens/ARFilterStyleAdjustScreen';
import {ARFilterScreen} from '../../features/ar/screens/ARFilterScreen';
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
  FilterExtractionUploadScreen,
  FilterRecipeDetailScreen,
  FilterSaveCompleteScreen,
  FilterSaveFormScreen,
  FilterTryOnAdjustScreen,
  FilterRecipeSaveCompleteScreen,
  type FilterExtractionPhoto,
} from '../../features/filter-extraction';
import {getFilterExtractionDataSync} from '../../features/filter-extraction/services/filterExtractionService';
import {HomeScreen} from '../../features/home';
import {TutorialIntroScreen} from '../../features/onboarding';
import {ProfileScreen, ProfileEditScreen} from '../../features/profile';
import {
  LikedProductListScreen,
  MakeupLookListScreen,
  ProductRecommendationScreen,
} from '../../features/recommendation';
import type {ARFilterBackRouteName, MainTabParamList, MainTabRouteName, RootStackParamList} from './routeTypes';
import {useNavigationFlowState} from './flowState';
import {DetailRouteChrome} from './detailHeaderChrome';
import {getMainHeaderCopy} from './mainTabChrome';

type RootScreenProps<RouteName extends keyof RootStackParamList> =
  NativeStackScreenProps<RootStackParamList, RouteName>;

type MainTabScreenProps<RouteName extends keyof MainTabParamList> =
  CompositeScreenProps<
    BottomTabScreenProps<MainTabParamList, RouteName>,
    NativeStackScreenProps<RootStackParamList>
  >;

type RootNavigation = NavigationProp<RootStackParamList>;

type HeaderShareAction = {
  cb: () => void;
};

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

  navigation.navigate('ARFilter');
}

function getSelectedFilterPhoto(photo: FilterExtractionPhoto | null): FilterExtractionPhoto {
  return photo ?? getFilterExtractionDataSync().photos[0];
}

function buildSavedMakeupLook(photo: FilterExtractionPhoto) {
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
        showTitle={headerCopy.showTitle}
        subtitle={headerCopy.subtitle}
        title={headerCopy.title}
        titleSlot={headerCopy.usesBrandLogo ? <AuraLogo variant="header" /> : undefined}
        topInset={insets.top}
        onProfilePress={() => navigation.navigate('ProfileTab')}
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
        onPressARFilter={() => rootNavigation?.navigate('ARFilter')}
        onPressCreateFilter={() => rootNavigation?.navigate('FilterExtractionUpload')}
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

export function ProfileRouteScreen({navigation}: MainTabScreenProps<'ProfileTab'>) {
  const rootNavigation = navigation.getParent<RootNavigation>();
  const {savedMakeupLook} = useNavigationFlowState();

  return (
    <MainTabChrome
      navigation={navigation}
      routeName="ProfileTab"
      wrapContentInScreen={false}>
      <ProfileScreen
        onPressImageAnalysisReport={reportId =>
          rootNavigation?.navigate('ImageAnalysisReportDetail', {reportId})
        }
        onPressImageAnalysisReportsList={() =>
          rootNavigation?.navigate('ImageAnalysisReportsList')
        }
        onPressLikedProductList={() => rootNavigation?.navigate('LikedProductList')}
        onPressMakeupLookList={() => rootNavigation?.navigate('MakeupLookList')}
        onPressProfileEdit={() => rootNavigation?.navigate('ProfileEdit')}
        savedMakeupLook={savedMakeupLook}
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
    <DetailRouteChrome
      routeName="ImageAnalysisLoading"
      onBack={() => navigation.navigate('FaceCapture')}>
      <ImageAnalysisLoadingScreen
        onComplete={() => navigation.navigate('ImageAnalysisReportDetail')}
      />
    </DetailRouteChrome>
  );
}

export function ImageAnalysisReportsListRouteScreen({
  navigation,
}: RootScreenProps<'ImageAnalysisReportsList'>) {
  return (
    <DetailRouteChrome
      routeName="ImageAnalysisReportsList"
      onBack={() => navigateMainTab(navigation, 'ProfileTab')}>
      <ImageAnalysisReportsListScreen
        onPressReport={reportId =>
          navigation.navigate('ImageAnalysisReportDetail', {reportId})
        }
      />
    </DetailRouteChrome>
  );
}

export function ImageAnalysisReportDetailRouteScreen({
  navigation,
  route,
}: RootScreenProps<'ImageAnalysisReportDetail'>) {
  const [shareAction, setShareAction] = React.useState<HeaderShareAction | null>(null);
  const handleHeaderShareActionChange = React.useCallback(
    (nextShareAction: (() => void) | null) => {
      setShareAction(nextShareAction ? {cb: nextShareAction} : null);
    },
    [],
  );

  return (
    <DetailRouteChrome
      routeName="ImageAnalysisReportDetail"
      onClose={() => navigateMainTab(navigation, 'HomeTab')}
      onShare={shareAction?.cb}
      shareDisabled={!shareAction}>
      <ImageAnalysisReportDetailScreen
        onCreateARFilter={() =>
          navigation.navigate('ARFilterStyleAdjust', {backRoute: 'ImageAnalysisReportDetail'})
        }
        onHeaderShareActionChange={handleHeaderShareActionChange}
        reportId={route.params?.reportId ?? null}
      />
    </DetailRouteChrome>
  );
}

export function ARFilterRouteScreen({navigation}: RootScreenProps<'ARFilter'>) {
  return (
    <ARFilterScreen
      initialGuideMode={DEFAULT_AR_GUIDE_MODE}
      onBack={() => navigateMainTab(navigation, 'HomeTab')}
      onComplete={() => navigateMainTab(navigation, 'HomeTab')}
      onOpenShapeAdjust={() => navigation.navigate('ARFilterLocationAdjust')}
      onSave={() => navigation.navigate('ExtractedMakeupStyleSaveForm')}
    />
  );
}

export function ARFilterLocationAdjustRouteScreen({
  navigation,
  route,
}: RootScreenProps<'ARFilterLocationAdjust'>) {
  return (
    <ARFilterLocationAdjustScreen
      onBack={() => navigateARBack(navigation, route.params?.backRoute)}
      onSave={() => navigation.navigate('ARFilter')}
    />
  );
}

export function ARFilterStyleAdjustRouteScreen({
  navigation,
  route,
}: RootScreenProps<'ARFilterStyleAdjust'>) {
  return (
    <ARFilterStyleAdjustScreen
      onBack={() => navigateARBack(navigation, route.params?.backRoute)}
      onSave={() => navigation.navigate('ARFilter')}
    />
  );
}

export function ProfileEditRouteScreen({navigation}: RootScreenProps<'ProfileEdit'>) {
  return (
    <DetailRouteChrome
      routeName="ProfileEdit"
      onBack={() => navigateMainTab(navigation, 'ProfileTab')}>
      <ProfileEditScreen
        onLogout={() => navigation.reset({index: 0, routes: [{name: 'Login'}]})}
      />
    </DetailRouteChrome>
  );
}

export function MakeupLookListRouteScreen({
  navigation,
}: RootScreenProps<'MakeupLookList'>) {
  return (
    <DetailRouteChrome
      routeName="MakeupLookList"
      onBack={() => navigateMainTab(navigation, 'ProfileTab')}>
      <MakeupLookListScreen />
    </DetailRouteChrome>
  );
}

export function LikedProductListRouteScreen({
  navigation,
}: RootScreenProps<'LikedProductList'>) {
  return (
    <DetailRouteChrome
      routeName="LikedProductList"
      onBack={() => navigateMainTab(navigation, 'ProfileTab')}>
      <LikedProductListScreen />
    </DetailRouteChrome>
  );
}

export function FeedbackEntryRouteScreen({navigation}: RootScreenProps<'FeedbackEntry'>) {
  return (
    <DetailRouteChrome
      routeName="FeedbackEntry"
      onClose={() => navigateMainTab(navigation, 'HomeTab')}>
      <FeedbackEntryScreen
        onPressAiFeedback={() => navigation.navigate('FeedbackCapture')}
      />
    </DetailRouteChrome>
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
    <DetailRouteChrome
      routeName="FeedbackLoading"
      onBack={() => navigation.navigate('FeedbackCapture')}>
      <FeedbackLoadingScreen
        onComplete={handleComplete}
        selection={selectedFeedbackPhoto}
      />
    </DetailRouteChrome>
  );
}

export function FeedbackResultRouteScreen({navigation}: RootScreenProps<'FeedbackResult'>) {
  const {feedbackResult} = useNavigationFlowState();

  if (!feedbackResult) {
    return (
      <DetailRouteChrome
        routeName="FeedbackResult"
        onBack={() => navigation.navigate('FeedbackEntry')}>
        <RoutePlaceholder
          description="피드백 분석을 먼저 완료해 주세요."
          showHeader={false}
          title="메이크업 피드백"
        />
      </DetailRouteChrome>
    );
  }

  return (
    <DetailRouteChrome
      routeName="FeedbackResult"
      onBack={() => navigation.navigate('FeedbackEntry')}>
      <MakeupFeedbackScreen
        onOpenGuide={() => navigation.navigate('FeedbackGuide')}
        onOpenTip={point => navigation.navigate('FeedbackTip', {pointId: point.id})}
        onRetake={() => navigation.navigate('FeedbackCapture')}
        onUploadAgain={() => navigation.navigate('FeedbackCapture')}
        result={feedbackResult}
      />
    </DetailRouteChrome>
  );
}

export function FeedbackGuideRouteScreen({navigation}: RootScreenProps<'FeedbackGuide'>) {
  const {feedbackResult} = useNavigationFlowState();

  if (!feedbackResult) {
    return (
      <DetailRouteChrome
        routeName="FeedbackGuide"
        onBack={() => navigation.navigate('FeedbackResult')}>
        <RoutePlaceholder
          description="가이드를 보려면 피드백 결과가 필요해요."
          showHeader={false}
          title="가이드 오버레이"
        />
      </DetailRouteChrome>
    );
  }

  return (
    <DetailRouteChrome
      routeName="FeedbackGuide"
      onBack={() => navigation.navigate('FeedbackResult')}>
      <FeedbackGuideOverlayScreen result={feedbackResult} />
    </DetailRouteChrome>
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
      <DetailRouteChrome
        routeName="FeedbackTip"
        onBack={() => navigation.navigate('FeedbackResult')}>
        <RoutePlaceholder
          description="선택한 수정팁을 찾을 수 없어요."
          showHeader={false}
          title="수정팁"
        />
      </DetailRouteChrome>
    );
  }

  return (
    <DetailRouteChrome
      routeName="FeedbackTip"
      onBack={() => navigation.navigate('FeedbackResult')}>
      <FeedbackTipScreen
        onBack={() => navigation.navigate('FeedbackResult')}
        point={point}
      />
    </DetailRouteChrome>
  );
}

export function FilterExtractionUploadRouteScreen({navigation}: RootScreenProps<'FilterExtractionUpload'>) {
  const {setSelectedFilterPhoto} = useNavigationFlowState();

  const handleStartAnalysis = (photo: FilterExtractionPhoto) => {
    setSelectedFilterPhoto(photo);
    navigation.navigate('FilterExtractionLoading');
  };

  return (
    <DetailRouteChrome
      routeName="FilterExtractionUpload"
      onClose={() => navigateMainTab(navigation, 'HomeTab')}>
      <FilterExtractionUploadScreen onStartAnalysis={handleStartAnalysis} />
    </DetailRouteChrome>
  );
}

export function FilterExtractionLoadingRouteScreen({navigation}: RootScreenProps<'FilterExtractionLoading'>) {
  const {selectedFilterPhoto} = useNavigationFlowState();
  const photo = getSelectedFilterPhoto(selectedFilterPhoto);

  return (
    <FilterExtractionLoadingScreen
      onBack={() => navigation.navigate('FilterExtractionUpload')}
      onComplete={() => navigation.navigate('FilterExtractionResult')}
      photo={photo}
    />
  );
}

export function FilterExtractionResultRouteScreen({navigation}: RootScreenProps<'FilterExtractionResult'>) {
  const {selectedFilterPhoto} = useNavigationFlowState();
  const photo = getSelectedFilterPhoto(selectedFilterPhoto);

  return (
    <DetailRouteChrome
      routeName="FilterExtractionResult"
      onBack={() => navigation.navigate('FilterExtractionUpload')}>
      <FilterExtractionResultScreen
        onApplyFilter={() => navigation.navigate('FilterTryOnAdjust')}
        onRetake={() => navigation.navigate('FilterExtractionUpload')}
        photo={photo}
      />
    </DetailRouteChrome>
  );
}

export function FilterTryOnAdjustRouteScreen({navigation}: RootScreenProps<'FilterTryOnAdjust'>) {
  const {selectedFilterPhoto} = useNavigationFlowState();
  const photo = getSelectedFilterPhoto(selectedFilterPhoto);

  return (
    <FilterTryOnAdjustScreen
      onClose={() => navigation.navigate('FilterExtractionResult')}
      onCreateRecipe={() => navigation.navigate('FilterRecipeDetail')}
      onSave={() => navigation.navigate('FilterSaveForm')}
      photo={photo}
    />
  );
}

export function FilterSaveFormRouteScreen({navigation}: RootScreenProps<'FilterSaveForm'>) {
  const {selectedFilterPhoto, setSavedMakeupLook} = useNavigationFlowState();
  const photo = getSelectedFilterPhoto(selectedFilterPhoto);

  const handleSave = () => {
    setSavedMakeupLook(buildSavedMakeupLook(photo));
    navigation.navigate('FilterSaveComplete');
  };

  return (
    <DetailRouteChrome
      routeName="FilterSaveForm"
      onBack={() => navigation.navigate('FilterTryOnAdjust')}
      onDone={handleSave}>
      <FilterSaveFormScreen
        onSave={handleSave}
        photo={photo}
      />
    </DetailRouteChrome>
  );
}

export function FilterSaveCompleteRouteScreen({navigation}: RootScreenProps<'FilterSaveComplete'>) {
  return (
    <FilterSaveCompleteScreen
      onApplyNow={() => navigation.navigate('FilterTryOnAdjust')}
      onGoToProfile={() => navigateMainTab(navigation, 'ProfileTab')}
    />
  );
}

export function FilterRecipeDetailRouteScreen({
  navigation,
}: RootScreenProps<'FilterRecipeDetail'>) {
  const {selectedFilterPhoto} = useNavigationFlowState();
  const photo = getSelectedFilterPhoto(selectedFilterPhoto);

  return (
    <DetailRouteChrome
      routeName="FilterRecipeDetail"
      onBack={() => navigation.navigate('FilterTryOnAdjust')}>
      <FilterRecipeDetailScreen
        onSaveRecipe={() => navigation.navigate('FilterRecipeSaveComplete')}
        photo={photo}
      />
    </DetailRouteChrome>
  );
}

export function FilterRecipeSaveCompleteRouteScreen({navigation}: RootScreenProps<'FilterRecipeSaveComplete'>) {
  return (
    <FilterRecipeSaveCompleteScreen
      onBackToDetail={() => navigation.navigate('FilterRecipeDetail')}
      onGoToProfile={() => navigateMainTab(navigation, 'ProfileTab')}
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
