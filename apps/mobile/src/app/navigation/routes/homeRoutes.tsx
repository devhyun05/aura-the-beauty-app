import React from 'react';

import {
  FilterStoreScreen,
  FloatingActionSettingsScreen,
  getRecommendedFilterRouteParams,
  HomeScreen,
  SavedMakeupListScreen,
} from '../../../features/home';
import {useAuthSession} from '../../../features/auth';
import {markFaceCaptureTutorialCompleted} from '../../../features/onboarding';
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

export function HomeRouteScreen({navigation}: MainTabScreenProps<'HomeTab'>) {
  const rootNavigation = navigation.getParent<RootNavigation>();
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

  const handleMakeupExtractionPress = React.useCallback(() => {
    setSelectedRecommendedMakeupFilterId(null);
    setSelectedReferenceMakeupPhoto(null);
    rootNavigation?.navigate('ReferenceMakeupExtractionUpload');
  }, [
    rootNavigation,
    setSelectedRecommendedMakeupFilterId,
    setSelectedReferenceMakeupPhoto,
  ]);

  const handleMakeupFeedbackPress = React.useCallback(() => {
    setMakeupFeedbackResult(null);
    setSelectedMakeupFeedbackPhoto({photoSource: 'gallery'});
    rootNavigation?.navigate('MakeupFeedbackAlbumUpload');
  }, [
    rootNavigation,
    setMakeupFeedbackResult,
    setSelectedMakeupFeedbackPhoto,
  ]);

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

  return (
    <MainTabChrome
      navigation={navigation}
      routeName="HomeTab"
      wrapContentInScreen={false}>
      <HomeScreen
        onPressArFilter={() => rootNavigation?.navigate('ARFilter')}
        onPressFaceDiagnosis={() => rootNavigation?.navigate('FaceAnalysisIntro')}
        onPressCommunity={() => navigation.navigate('CommunityTab')}
        onPressConsulting={() => rootNavigation?.navigate('Consulting')}
        onPressHalfMakeup={handleHalfMakeupPress}
        onPressHeroTrendFilter={handleHeroTrendFilterPress}
        onPressMakeupExtraction={handleMakeupExtractionPress}
        onPressMakeupFeedback={handleMakeupFeedbackPress}
        onPressMakeupFilter={handleMakeupFilterPress}
        onPressProductRecommendations={() => rootNavigation?.navigate('AuradinSearch')}
        onPressRecommendedFilterMore={() =>
          rootNavigation?.navigate(getHomeRecommendedFilterMoreRouteName())
        }
        onPressRecommendedFilter={handleRecommendedFilterPress}
        isMakeupFilterLiked={isMakeupFilterLiked}
        onToggleMakeupFilterLike={handleToggleMakeupFilterLike}
        showBeautyJourneyGuide={shouldShowBeautyJourneyGuide}
        onConfirmBeautyJourneyGuide={handleBeautyJourneyGuideConfirm}
      />
    </MainTabChrome>
  );
}

export function CommunityTabRouteScreen({navigation}: MainTabScreenProps<'CommunityTab'>) {
  return (
    <MainTabChrome
      navigation={navigation}
      routeName="CommunityTab">
      <RoutePlaceholder
        description="커뮤니티 기능을 준비 중이에요."
        showHeader={false}
        title="커뮤니티"
      />
    </MainTabChrome>
  );
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
          navigation.navigate('FaceAnalysisReportDetail');
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
      <RoutePlaceholder
        description="커뮤니티 기능을 준비 중이에요."
        showHeader={false}
        title="커뮤니티"
      />
    </DetailRouteChrome>
  );
}

export function ConsultingRouteScreen({navigation}: RootScreenProps<'Consulting'>) {
  return (
    <DetailRouteChrome
      routeName="Consulting"
      onBack={() => navigateMainTab(navigation, 'HomeTab')}>
      {renderConsultingHome(navigation)}
    </DetailRouteChrome>
  );
}
