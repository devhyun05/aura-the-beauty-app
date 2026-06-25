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
  MakeupFeedbackCaptureScreen,
  MakeupFeedbackEntryScreen,
  MakeupCorrectionGuideOverlayScreen,
  MakeupFeedbackLoadingScreen,
  MakeupCorrectionTipScreen,
  MakeupFeedbackResultScreen,
  type MakeupFeedbackPhotoSelection,
  type MakeupFeedbackResult,
} from '../../features/makeup-feedback';
import {
  ReferenceMakeupExtractionLoadingScreen,
  ReferenceMakeupExtractionResultScreen,
  ReferenceMakeupExtractionUploadScreen,
  ExtractedMakeupStyleRecipeDetailScreen,
  ExtractedMakeupStyleSaveCompleteScreen,
  ExtractedMakeupStyleSaveFormScreen,
  ExtractedMakeupStyleAdjustScreen,
  ExtractedMakeupStyleRecipeSaveCompleteScreen,
  type ReferenceMakeupPhoto,
} from '../../features/reference-makeup-extraction';
import {getReferenceMakeupExtractionDataSync} from '../../features/reference-makeup-extraction/services/makeupExtractionService';
import {HomeScreen} from '../../features/home';
import {TutorialIntroScreen} from '../../features/onboarding';
import {ProfileScreen, ProfileEditScreen} from '../../features/profile';
import {
  LikedProductListScreen,
  MakeupStyleListScreen,
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

function getSelectedReferenceMakeupPhoto(photo: ReferenceMakeupPhoto | null): ReferenceMakeupPhoto {
  return photo ?? getReferenceMakeupExtractionDataSync().photos[0];
}

function buildSavedMakeupStyle(photo: ReferenceMakeupPhoto) {
  const {extractedMakeupStyle} = getReferenceMakeupExtractionDataSync();

  return {
    id: 'saved-extracted-makeup-style',
    imageSource: photo.imageSource,
    isSaved: true,
    moodLabel: extractedMakeupStyle.tags.slice(0, 2).join(' '),
    shortDescription: extractedMakeupStyle.subtitle,
    title: extractedMakeupStyle.title,
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
        onPressReferenceMakeupExtraction={() => rootNavigation?.navigate('ReferenceMakeupExtractionUpload')}
        onPressFaceDiagnosis={() => rootNavigation?.navigate('Tutorial')}
        onPressMakeupFeedback={() => rootNavigation?.navigate('MakeupFeedbackEntry')}
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
  const {savedMakeupStyle} = useNavigationFlowState();

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

export function MakeupStyleListRouteScreen({
  navigation,
}: RootScreenProps<'MakeupStyleList'>) {
  return (
    <DetailRouteChrome
      routeName="MakeupStyleList"
      onBack={() => navigateMainTab(navigation, 'ProfileTab')}>
      <MakeupStyleListScreen />
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

export function MakeupFeedbackEntryRouteScreen({navigation}: RootScreenProps<'MakeupFeedbackEntry'>) {
  return (
    <DetailRouteChrome
      routeName="MakeupFeedbackEntry"
      onClose={() => navigateMainTab(navigation, 'HomeTab')}>
      <MakeupFeedbackEntryScreen
        onPressAiFeedback={() => navigation.navigate('MakeupFeedbackCapture')}
      />
    </DetailRouteChrome>
  );
}

export function MakeupFeedbackCaptureRouteScreen({
  navigation,
}: RootScreenProps<'MakeupFeedbackCapture'>) {
  const {setSelectedMakeupFeedbackPhoto} = useNavigationFlowState();

  const handleSelectPhoto = (selection: MakeupFeedbackPhotoSelection) => {
    setSelectedMakeupFeedbackPhoto(selection);
    navigation.navigate('MakeupFeedbackLoading');
  };

  return (
    <MakeupFeedbackCaptureScreen
      onClose={() => navigation.navigate('MakeupFeedbackEntry')}
      onSelectPhoto={handleSelectPhoto}
    />
  );
}

export function MakeupFeedbackLoadingRouteScreen({
  navigation,
}: RootScreenProps<'MakeupFeedbackLoading'>) {
  const {selectedMakeupFeedbackPhoto, setMakeupFeedbackResult} = useNavigationFlowState();

  const handleComplete = (result: MakeupFeedbackResult) => {
    setMakeupFeedbackResult(result);
    navigation.navigate('MakeupFeedbackResult');
  };

  return (
    <DetailRouteChrome
      routeName="MakeupFeedbackLoading"
      onBack={() => navigation.navigate('MakeupFeedbackCapture')}>
      <MakeupFeedbackLoadingScreen
        onComplete={handleComplete}
        selection={selectedMakeupFeedbackPhoto}
      />
    </DetailRouteChrome>
  );
}

export function MakeupFeedbackResultRouteScreen({navigation}: RootScreenProps<'MakeupFeedbackResult'>) {
  const {makeupFeedbackResult} = useNavigationFlowState();

  if (!makeupFeedbackResult) {
    return (
      <DetailRouteChrome
        routeName="MakeupFeedbackResult"
        onBack={() => navigation.navigate('MakeupFeedbackEntry')}>
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
      routeName="MakeupFeedbackResult"
      onBack={() => navigation.navigate('MakeupFeedbackEntry')}>
      <MakeupFeedbackResultScreen
        onOpenGuide={() => navigation.navigate('MakeupCorrectionGuide')}
        onOpenTip={point => navigation.navigate('MakeupCorrectionTip', {pointId: point.id})}
        onRetake={() => navigation.navigate('MakeupFeedbackCapture')}
        onUploadAgain={() => navigation.navigate('MakeupFeedbackCapture')}
        result={makeupFeedbackResult}
      />
    </DetailRouteChrome>
  );
}

export function MakeupCorrectionGuideRouteScreen({navigation}: RootScreenProps<'MakeupCorrectionGuide'>) {
  const {makeupFeedbackResult} = useNavigationFlowState();

  if (!makeupFeedbackResult) {
    return (
      <DetailRouteChrome
        routeName="MakeupCorrectionGuide"
        onBack={() => navigation.navigate('MakeupFeedbackResult')}>
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
      routeName="MakeupCorrectionGuide"
      onBack={() => navigation.navigate('MakeupFeedbackResult')}>
      <MakeupCorrectionGuideOverlayScreen result={makeupFeedbackResult} />
    </DetailRouteChrome>
  );
}

export function MakeupCorrectionTipRouteScreen({
  navigation,
  route,
}: RootScreenProps<'MakeupCorrectionTip'>) {
  const {makeupFeedbackResult} = useNavigationFlowState();
  const point = makeupFeedbackResult?.points.find(item => item.id === route.params.pointId);

  if (!point) {
    return (
      <DetailRouteChrome
        routeName="MakeupCorrectionTip"
        onBack={() => navigation.navigate('MakeupFeedbackResult')}>
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
      routeName="MakeupCorrectionTip"
      onBack={() => navigation.navigate('MakeupFeedbackResult')}>
      <MakeupCorrectionTipScreen
        onBack={() => navigation.navigate('MakeupFeedbackResult')}
        point={point}
      />
    </DetailRouteChrome>
  );
}

export function ReferenceMakeupExtractionUploadRouteScreen({navigation}: RootScreenProps<'ReferenceMakeupExtractionUpload'>) {
  const {setSelectedReferenceMakeupPhoto} = useNavigationFlowState();

  const handleStartAnalysis = (photo: ReferenceMakeupPhoto) => {
    setSelectedReferenceMakeupPhoto(photo);
    navigation.navigate('ReferenceMakeupExtractionLoading');
  };

  return (
    <DetailRouteChrome
      routeName="ReferenceMakeupExtractionUpload"
      onClose={() => navigateMainTab(navigation, 'HomeTab')}>
      <ReferenceMakeupExtractionUploadScreen onStartAnalysis={handleStartAnalysis} />
    </DetailRouteChrome>
  );
}

export function ReferenceMakeupExtractionLoadingRouteScreen({navigation}: RootScreenProps<'ReferenceMakeupExtractionLoading'>) {
  const {selectedReferenceMakeupPhoto} = useNavigationFlowState();
  const photo = getSelectedReferenceMakeupPhoto(selectedReferenceMakeupPhoto);

  return (
    <ReferenceMakeupExtractionLoadingScreen
      onBack={() => navigation.navigate('ReferenceMakeupExtractionUpload')}
      onComplete={() => navigation.navigate('ReferenceMakeupExtractionResult')}
      photo={photo}
    />
  );
}

export function ReferenceMakeupExtractionResultRouteScreen({navigation}: RootScreenProps<'ReferenceMakeupExtractionResult'>) {
  const {selectedReferenceMakeupPhoto} = useNavigationFlowState();
  const photo = getSelectedReferenceMakeupPhoto(selectedReferenceMakeupPhoto);

  return (
    <DetailRouteChrome
      routeName="ReferenceMakeupExtractionResult"
      onBack={() => navigation.navigate('ReferenceMakeupExtractionUpload')}>
      <ReferenceMakeupExtractionResultScreen
        onPreviewMakeupStyle={() => navigation.navigate('ExtractedMakeupStyleAdjust')}
        onRetake={() => navigation.navigate('ReferenceMakeupExtractionUpload')}
        photo={photo}
      />
    </DetailRouteChrome>
  );
}

export function ExtractedMakeupStyleAdjustRouteScreen({navigation}: RootScreenProps<'ExtractedMakeupStyleAdjust'>) {
  const {selectedReferenceMakeupPhoto} = useNavigationFlowState();
  const photo = getSelectedReferenceMakeupPhoto(selectedReferenceMakeupPhoto);

  return (
    <ExtractedMakeupStyleAdjustScreen
      onClose={() => navigation.navigate('ReferenceMakeupExtractionResult')}
      onCreateRecipe={() => navigation.navigate('ExtractedMakeupStyleRecipeDetail')}
      onSave={() => navigation.navigate('ExtractedMakeupStyleSaveForm')}
      photo={photo}
    />
  );
}

export function ExtractedMakeupStyleSaveFormRouteScreen({navigation}: RootScreenProps<'ExtractedMakeupStyleSaveForm'>) {
  const {selectedReferenceMakeupPhoto, setSavedMakeupStyle} = useNavigationFlowState();
  const photo = getSelectedReferenceMakeupPhoto(selectedReferenceMakeupPhoto);

  const handleSave = () => {
    setSavedMakeupStyle(buildSavedMakeupStyle(photo));
    navigation.navigate('ExtractedMakeupStyleSaveComplete');
  };

  return (
    <DetailRouteChrome
      routeName="ExtractedMakeupStyleSaveForm"
      onBack={() => navigation.navigate('ExtractedMakeupStyleAdjust')}
      onDone={handleSave}>
      <ExtractedMakeupStyleSaveFormScreen
        onSave={handleSave}
        photo={photo}
      />
    </DetailRouteChrome>
  );
}

export function ExtractedMakeupStyleSaveCompleteRouteScreen({navigation}: RootScreenProps<'ExtractedMakeupStyleSaveComplete'>) {
  return (
    <ExtractedMakeupStyleSaveCompleteScreen
      onApplyNow={() => navigation.navigate('ExtractedMakeupStyleAdjust')}
      onGoToProfile={() => navigateMainTab(navigation, 'ProfileTab')}
    />
  );
}

export function ExtractedMakeupStyleRecipeDetailRouteScreen({
  navigation,
}: RootScreenProps<'ExtractedMakeupStyleRecipeDetail'>) {
  const {selectedReferenceMakeupPhoto} = useNavigationFlowState();
  const photo = getSelectedReferenceMakeupPhoto(selectedReferenceMakeupPhoto);

  return (
    <DetailRouteChrome
      routeName="ExtractedMakeupStyleRecipeDetail"
      onBack={() => navigation.navigate('ExtractedMakeupStyleAdjust')}>
      <ExtractedMakeupStyleRecipeDetailScreen
        onSaveRecipe={() => navigation.navigate('ExtractedMakeupStyleRecipeSaveComplete')}
        photo={photo}
      />
    </DetailRouteChrome>
  );
}

export function ExtractedMakeupStyleRecipeSaveCompleteRouteScreen({navigation}: RootScreenProps<'ExtractedMakeupStyleRecipeSaveComplete'>) {
  return (
    <ExtractedMakeupStyleRecipeSaveCompleteScreen
      onBackToDetail={() => navigation.navigate('ExtractedMakeupStyleRecipeDetail')}
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
