import React from 'react';

import {
  FilterStoreScreen,
  FloatingActionSettingsScreen,
  getRecommendedFilterRouteParams,
  HomeScreen,
  SavedMakeupListScreen,
} from '../../../features/home';
import type {
  HomeFeatureId,
  HomeFeaturePressPayload,
} from '../../../features/home/types/homeModules';
import {getHomeFeatureNavigationTarget} from '../../../features/home/config/homeFeatureRouteMap';
import {MakeupExtractionActionSheet} from '../../../features/home/components/MakeupExtractionActionSheet';
import {MakeupFeedbackActionSheet} from '../../../features/home/components/MakeupFeedbackActionSheet';
import {useAuthSession} from '../../../features/auth';
import {markFaceCaptureTutorialCompleted} from '../../../features/onboarding';
import {
  CommunityCreateThreadScreen,
  CommunityHomeScreen,
  CommunityThreadDetailScreen,
  CommunityUserProfileScreen,
} from '../../../features/community';
import {
  ConsultingHeaderActions,
} from '../../../features/consulting';
import {RoutePlaceholder} from '../../../shared/ui';
import {DetailRouteChrome} from '../detailHeaderChrome';
import {useNavigationFlowState} from '../flowState';
import {renderConsultingHome} from './consultingRoutes';
import {
  MainTabChrome,
  navigateMainTab,
  type MainTabScreenProps,
  type RootNavigation,
  type RootScreenProps,
} from './routeUtils';

export function FloatingActionSettingsRouteScreen({
  navigation,
}: RootScreenProps<'FloatingActionSettings'>) {
  const {
    floatingActionButtonPosition,
    floatingActionIds,
    floatingActionInteractionMode,
    setFloatingActionButtonPosition,
    setFloatingActionIds,
    setFloatingActionInteractionMode,
  } = useNavigationFlowState();

  return (
    <DetailRouteChrome
      routeName="FloatingActionSettings"
      onBack={() => {
        if (navigation.canGoBack()) {
          navigation.goBack();
          return;
        }

        navigateMainTab(navigation, 'HomeTab');
      }}>
      <FloatingActionSettingsScreen
        selectedActionIds={floatingActionIds}
        selectedButtonPosition={floatingActionButtonPosition}
        selectedInteractionMode={floatingActionInteractionMode}
        onChangeActionIds={setFloatingActionIds}
        onChangeButtonPosition={setFloatingActionButtonPosition}
        onChangeInteractionMode={setFloatingActionInteractionMode}
      />
    </DetailRouteChrome>
  );
}

export function getHomeRecommendedFilterMoreRouteName(): 'HomeFilterStore' {
  return 'HomeFilterStore';
}

export function getHomeProductRecommendationRouteName(): 'ProductRecommendation' {
  return 'ProductRecommendation';
}

export function HomeRouteScreen({navigation}: MainTabScreenProps<'HomeTab'>) {
  const rootNavigation = navigation.getParent<RootNavigation>();
  const [isExtractionSheetVisible, setIsExtractionSheetVisible] = React.useState(false);
  const [isFeedbackSheetVisible, setIsFeedbackSheetVisible] = React.useState(false);
  const {
    likedMakeupFilterIds,
    setMakeupFeedbackResult,
    setLikedMakeupFilterIds,
    setSelectedMakeupFeedbackPhoto,
    setSelectedRecommendedMakeupFilterId,
    setSelectedReferenceMakeupPhoto,
    setShouldShowBeautyJourneyGuide,
    shouldShowBeautyJourneyGuide,
  } = useNavigationFlowState();
  const {session} = useAuthSession();

  const handleRecommendedFilterPress = React.useCallback((filterId: string) => {
    setSelectedRecommendedMakeupFilterId(filterId);
    rootNavigation?.navigate('ARFilter', getRecommendedFilterRouteParams(filterId));
  }, [rootNavigation, setSelectedRecommendedMakeupFilterId]);

  const handleHeroTrendFilterPress = React.useCallback((filterId: string) => {
    setSelectedRecommendedMakeupFilterId(filterId);
    rootNavigation?.navigate('ARFilter', getRecommendedFilterRouteParams(filterId));
  }, [rootNavigation, setSelectedRecommendedMakeupFilterId]);

  const handleMakeupFilterPress = React.useCallback(() => {
    setSelectedRecommendedMakeupFilterId(null);
    rootNavigation?.navigate('ARFilter', {source: 'homeServiceShortcut'});
  }, [rootNavigation, setSelectedRecommendedMakeupFilterId]);

  const handleHalfMakeupPress = React.useCallback(() => {
    setSelectedRecommendedMakeupFilterId(null);
    rootNavigation?.navigate('ARFilter', {
      initialGuideMode: 'half',
      source: 'homeServiceShortcut',
    });
  }, [rootNavigation, setSelectedRecommendedMakeupFilterId]);

  const closeExtractionSheet = React.useCallback(() => {
    setIsExtractionSheetVisible(false);
  }, []);

  const closeFeedbackSheet = React.useCallback(() => {
    setIsFeedbackSheetVisible(false);
  }, []);

  const startMakeupExtraction = React.useCallback((initialSource: 'camera' | 'gallery') => {
    setIsExtractionSheetVisible(false);
    setSelectedRecommendedMakeupFilterId(null);
    setSelectedReferenceMakeupPhoto(null);

    requestAnimationFrame(() => {
      rootNavigation?.navigate('ReferenceMakeupExtractionUpload', {initialSource});
    });
  }, [
    rootNavigation,
    setSelectedRecommendedMakeupFilterId,
    setSelectedReferenceMakeupPhoto,
  ]);

  const startMakeupFeedback = React.useCallback((photoSource: 'camera' | 'gallery') => {
    setIsFeedbackSheetVisible(false);
    setMakeupFeedbackResult(null);
    setSelectedMakeupFeedbackPhoto({photoSource});

    requestAnimationFrame(() => {
      if (photoSource === 'camera') {
        rootNavigation?.navigate('MakeupFeedbackCapture');
        return;
      }

      rootNavigation?.navigate('MakeupFeedbackAlbumUpload');
    });
  }, [
    rootNavigation,
    setMakeupFeedbackResult,
    setSelectedMakeupFeedbackPhoto,
  ]);

  const handleMakeupExtractionPress = React.useCallback(() => {
    setIsFeedbackSheetVisible(false);
    setIsExtractionSheetVisible(true);
  }, []);

  const handleMakeupFeedbackPress = React.useCallback(() => {
    setIsExtractionSheetVisible(false);
    setIsFeedbackSheetVisible(true);
  }, []);

  const handleBeautyJourneyGuideConfirm = React.useCallback(() => {
    setShouldShowBeautyJourneyGuide(false);

    void (async () => {
      try {
        if (session) {
          await markFaceCaptureTutorialCompleted(session.user);
        }
      } catch {
        // Continue to the intro even if the preference save call fails.
      } finally {
        rootNavigation?.navigate('FaceAnalysisIntro');
      }
    })();
  }, [rootNavigation, session, setShouldShowBeautyJourneyGuide]);

  const handleToggleMakeupFilterLike = React.useCallback((filterId: string) => {
    setLikedMakeupFilterIds(currentFilterIds =>
      currentFilterIds.includes(filterId)
        ? currentFilterIds.filter(currentFilterId => currentFilterId !== filterId)
        : [filterId, ...currentFilterIds],
    );
  }, [setLikedMakeupFilterIds]);

  const isMakeupFilterLiked = React.useCallback(
    (filterId: string) => likedMakeupFilterIds.includes(filterId),
    [likedMakeupFilterIds],
  );

  const handleHomeFeaturePress = React.useCallback((
    featureId: HomeFeatureId,
    payload?: HomeFeaturePressPayload,
  ) => {
    const target = getHomeFeatureNavigationTarget(featureId, payload);

    if (target === 'FaceAnalysisIntro') {
      rootNavigation?.navigate('FaceAnalysisIntro');
      return;
    }

    if (target === 'FaceAnalysisReportsList') {
      rootNavigation?.navigate('FaceAnalysisReportsList');
      return;
    }

    if (target === 'MakeupRecommendation') {
      rootNavigation?.navigate('MakeupRecommendation');
      return;
    }

    if (target === 'ProductDetail' && payload?.itemId) {
      rootNavigation?.navigate('ProductDetail', {
        productId: payload.itemId,
        ...(payload.shadeId ? {shadeId: payload.shadeId} : {}),
        ...(payload.disclosureLabel
          ? {disclosureLabel: payload.disclosureLabel}
          : {}),
        ...(payload.sponsored !== undefined
          ? {sponsored: payload.sponsored}
          : {}),
        ...(payload.sponsorshipType
          ? {sponsorshipType: payload.sponsorshipType}
          : {}),
      });
      return;
    }

    if (target === 'ProductRecommendation') {
      const initialSection = (
        payload?.source === 'ar'
        || payload?.source === 'cohort'
        || payload?.source === 'personalized'
        || payload?.source === 'seasonal'
      ) ? payload.source : undefined;

      rootNavigation?.navigate(
        'ProductRecommendation',
        initialSection ? {initialSection} : undefined,
      );
      return;
    }

    if (target === 'AuradinSearch') {
      rootNavigation?.navigate(
        'AuradinSearch',
        payload?.source ? {prompt: payload.source} : undefined,
      );
      return;
    }

    if (target === 'makeupExtractionSheet') {
      handleMakeupExtractionPress();
      return;
    }

    if (target === 'makeupFeedbackSheet') {
      handleMakeupFeedbackPress();
      return;
    }

    if (target === 'ConsultingTab') {
      navigation.navigate('ConsultingTab');
      return;
    }

    if (target === 'SavedMakeupList') {
      rootNavigation?.navigate('SavedMakeupList');
      return;
    }

    if (target === 'LikedProductList') {
      rootNavigation?.navigate('LikedProductList');
      return;
    }

    if (target === 'ARFilter') {
      handleMakeupFilterPress();
      return;
    }

    rootNavigation?.navigate('HomeFilterStore');
  }, [
    handleMakeupExtractionPress,
    handleMakeupFeedbackPress,
    handleMakeupFilterPress,
    navigation,
    rootNavigation,
  ]);

  return (
    <MainTabChrome
      navigation={navigation}
      routeName="HomeTab"
      wrapContentInScreen={false}>
      {({openFeatureMenu}) => (
        <>
          <HomeScreen
            isAuthenticated={Boolean(session)}
            headerRightSlot={
              <ConsultingHeaderActions
                onPressNotifications={() =>
                  rootNavigation?.navigate('ConsultingNotifications')
                }
                showMessages={false}
                variant="hero"
              />
            }
            onOpenFeatureMenu={openFeatureMenu}
            onPressArFilter={() => rootNavigation?.navigate('ARFilter')}
            onPressFaceDiagnosis={() => rootNavigation?.navigate('FaceAnalysisIntro')}
            onPressConsulting={() => navigation.navigate('ConsultingTab')}
            onPressHalfMakeup={handleHalfMakeupPress}
            onPressMakeupRecommendation={() =>
              rootNavigation?.navigate('MakeupRecommendation')
            }
            onPressHairRemovalSimulation={() =>
              rootNavigation?.navigate('HairRemovalSimulation')
            }
            onPressHeroTrendFilter={handleHeroTrendFilterPress}
            onPressMakeupExtraction={handleMakeupExtractionPress}
            onPressMakeupFeedback={handleMakeupFeedbackPress}
            onPressMakeupFilter={handleMakeupFilterPress}
            onPressProductRecommendations={() =>
              rootNavigation?.navigate(getHomeProductRecommendationRouteName())
            }
            onPressRecommendedFilterMore={() =>
              rootNavigation?.navigate(getHomeRecommendedFilterMoreRouteName())
            }
            onPressRecommendedFilter={handleRecommendedFilterPress}
            onPressHomeFeature={handleHomeFeaturePress}
            isMakeupFilterLiked={isMakeupFilterLiked}
            onToggleMakeupFilterLike={handleToggleMakeupFilterLike}
            showBeautyJourneyGuide={shouldShowBeautyJourneyGuide}
            onConfirmBeautyJourneyGuide={handleBeautyJourneyGuideConfirm}
          />
          <MakeupExtractionActionSheet
            isVisible={isExtractionSheetVisible}
            onClose={closeExtractionSheet}
            onPressCamera={() => startMakeupExtraction('camera')}
            onPressUpload={() => startMakeupExtraction('gallery')}
          />
          <MakeupFeedbackActionSheet
            isVisible={isFeedbackSheetVisible}
            onClose={closeFeedbackSheet}
            onPressCamera={() => startMakeupFeedback('camera')}
            onPressUpload={() => startMakeupFeedback('gallery')}
          />
        </>
      )}
    </MainTabChrome>
  );
}

export function ConsultingTabRouteScreen({
  navigation,
}: MainTabScreenProps<'ConsultingTab'>) {
  const rootNavigation = navigation.getParent<RootNavigation>();

  if (!rootNavigation) {
    return null;
  }

  return (
    <MainTabChrome
      headerRightSlot={
        <ConsultingHeaderActions
          onPressMessages={() => rootNavigation?.navigate('ConsultingMessages')}
          onPressNotifications={() =>
            rootNavigation?.navigate('ConsultingNotifications')
          }
          onPressHistory={() => rootNavigation?.navigate('ConsultingHistory')}
          showHistory
        />
      }
      navigation={navigation}
      routeName="ConsultingTab"
      wrapContentInScreen={false}>
      {renderConsultingHome(rootNavigation, {topPadding: 'belowOverlayHeader'})}
    </MainTabChrome>
  );
}

function navigateCommunity(navigation: RootNavigation) {
  navigation.navigate('Community');
}

function navigateBackOrCommunity(navigation: RootNavigation) {
  if (navigation.canGoBack()) {
    navigation.goBack();
    return;
  }

  navigateCommunity(navigation);
}

export function HomeFilterStoreRouteScreen({
  navigation,
  route,
}: RootScreenProps<'HomeFilterStore'>) {
  const {
    likedMakeupFilterIds,
    setLikedMakeupFilterIds,
    setSelectedRecommendedMakeupFilterId,
  } = useNavigationFlowState();

  const handleApplyFilter = React.useCallback((filterId: string) => {
    setSelectedRecommendedMakeupFilterId(filterId);
    navigation.navigate('ARFilter', getRecommendedFilterRouteParams(filterId));
  }, [navigation, setSelectedRecommendedMakeupFilterId]);

  const handleToggleMakeupFilterLike = React.useCallback((filterId: string) => {
    setLikedMakeupFilterIds(currentFilterIds =>
      currentFilterIds.includes(filterId)
        ? currentFilterIds.filter(currentFilterId => currentFilterId !== filterId)
        : [filterId, ...currentFilterIds],
    );
  }, [setLikedMakeupFilterIds]);

  const isMakeupFilterLiked = React.useCallback(
    (filterId: string) => likedMakeupFilterIds.includes(filterId),
    [likedMakeupFilterIds],
  );

  return (
    <DetailRouteChrome
      routeName="HomeFilterStore"
      onBack={() => navigateMainTab(navigation, 'HomeTab')}>
      <FilterStoreScreen
        initialFilterId={route.params?.initialMakeupFilterId}
        isFilterLiked={isMakeupFilterLiked}
        onApplyFilter={handleApplyFilter}
        onToggleFilterLike={handleToggleMakeupFilterLike}
      />
    </DetailRouteChrome>
  );
}

export function SavedMakeupListRouteScreen({
  navigation,
}: RootScreenProps<'SavedMakeupList'>) {
  const {
    selectedFaceAnalysisReport,
    setSelectedFaceAnalysisReport,
  } = useNavigationFlowState();

  return (
    <DetailRouteChrome
      routeName="SavedMakeupList"
      onBack={() => navigateMainTab(navigation, 'HomeTab')}>
      <SavedMakeupListScreen
        latestAnalysisReport={selectedFaceAnalysisReport}
        onPressMakeup={savedMakeup => {
          setSelectedFaceAnalysisReport(savedMakeup.report);
          // 과거 보고서는 항상 reportId 경유로 연다 — id 없이 열면 상세 화면이
          // 현재 세션의 측정 props·촬영 사진을 이 과거 보고서 위에 얹는다
          // (identity 버그, Codex 주장5). id 경로는 서버 재조회 + 세션 props 차단.
          navigation.navigate('FaceAnalysisReportDetail', {
            reportId: savedMakeup.report.id,
          });
        }}
      />
    </DetailRouteChrome>
  );
}

export function CommunityRouteScreen({navigation}: RootScreenProps<'Community'>) {
  return (
    <DetailRouteChrome
      routeName="Community"
      onBack={() => navigateMainTab(navigation, 'HomeTab')}>
      <CommunityHomeScreen
        onPressCreate={() => navigation.navigate('CommunityThreadCreate')}
        onPressAuthor={author => navigation.navigate('CommunityUserProfile', {
          avatarUrl: author.avatarUrl,
          nickname: author.nickname,
          userId: author.id,
        })}
        onPressEditProfile={() => navigation.navigate('ProfileEdit')}
        onPressThread={threadId => navigation.navigate('CommunityThreadDetail', {threadId})}
      />
    </DetailRouteChrome>
  );
}

export function HairRemovalSimulationRouteScreen({
  navigation,
}: RootScreenProps<'HairRemovalSimulation'>) {
  return (
    <DetailRouteChrome
      routeName="HairRemovalSimulation"
      onBack={() => navigateMainTab(navigation, 'HomeTab')}>
      <RoutePlaceholder
        description="제모 시뮬레이션을 준비 중이에요."
        showHeader={false}
        title="제모 시뮬레이션"
      />
    </DetailRouteChrome>
  );
}

export function CommunityThreadDetailRouteScreen({
  navigation,
  route,
}: RootScreenProps<'CommunityThreadDetail'>) {
  return (
    <DetailRouteChrome
      routeName="CommunityThreadDetail"
      onBack={() => navigateBackOrCommunity(navigation)}>
      <CommunityThreadDetailScreen
        threadId={route.params.threadId}
        onDeleted={() => navigateCommunity(navigation)}
        onPressEditThread={thread => navigation.navigate('CommunityThreadEdit', {threadId: thread.id})}
        onPressAuthor={author => navigation.navigate('CommunityUserProfile', {
          avatarUrl: author.avatarUrl,
          nickname: author.nickname,
          userId: author.id,
        })}
      />
    </DetailRouteChrome>
  );
}

export function CommunityThreadEditRouteScreen({
  navigation,
  route,
}: RootScreenProps<'CommunityThreadEdit'>) {
  return (
    <DetailRouteChrome
      routeName="CommunityThreadEdit"
      onBack={() => navigateBackOrCommunity(navigation)}>
      <CommunityCreateThreadScreen
        mode="edit"
        threadId={route.params.threadId}
        onUpdated={thread => navigation.replace('CommunityThreadDetail', {threadId: thread.id})}
      />
    </DetailRouteChrome>
  );
}

export function CommunityUserProfileRouteScreen({
  navigation,
  route,
}: RootScreenProps<'CommunityUserProfile'>) {
  return (
    <DetailRouteChrome
      routeName="CommunityUserProfile"
      onBack={() => navigation.goBack()}>
      <CommunityUserProfileScreen
        avatarUrl={route.params.avatarUrl}
        nickname={route.params.nickname}
        userId={route.params.userId}
        onPressThread={threadId => navigation.navigate('CommunityThreadDetail', {threadId})}
      />
    </DetailRouteChrome>
  );
}

export function CommunityThreadCreateRouteScreen({
  navigation,
}: RootScreenProps<'CommunityThreadCreate'>) {
  return (
    <DetailRouteChrome
      routeName="CommunityThreadCreate"
      onBack={() => navigateBackOrCommunity(navigation)}>
      <CommunityCreateThreadScreen
        onCreated={thread => navigation.replace('CommunityThreadDetail', {threadId: thread.id})}
      />
    </DetailRouteChrome>
  );
}
export function ConsultingRouteScreen({navigation}: RootScreenProps<'Consulting'>) {
  return (
    <DetailRouteChrome
      headerMode="standard"
      headerRightSlot={
        <ConsultingHeaderActions
          onPressHistory={() => navigation.navigate('ConsultingHistory')}
          onPressMessages={() => navigation.navigate('ConsultingMessages')}
          onPressNotifications={() => navigation.navigate('ConsultingNotifications')}
          showHistory
        />
      }
      routeName="Consulting"
      onBack={() => navigateMainTab(navigation, 'HomeTab')}>
      {renderConsultingHome(navigation)}
    </DetailRouteChrome>
  );
}
