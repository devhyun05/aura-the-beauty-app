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
    floatingActionIds,
    floatingActionInteractionMode,
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
        selectedInteractionMode={floatingActionInteractionMode}
        onChangeActionIds={setFloatingActionIds}
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
    setLikedMakeupFilterIds,
    setSelectedRecommendedMakeupFilterId,
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
        onPressFaceDiagnosis={() => rootNavigation?.navigate('FaceAnalysisIntro')}
        onPressMagazine={() => rootNavigation?.navigate('Magazine')}
        onPressHeroTrendFilter={handleHeroTrendFilterPress}
        onPressProductRecommendations={() => rootNavigation?.navigate('ProductRecommendation')}
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

export function ConsultingTabRouteScreen({navigation}: MainTabScreenProps<'ConsultingTab'>) {
  return (
    <MainTabChrome
      navigation={navigation}
      routeName="ConsultingTab">
      <RoutePlaceholder
        description="퍼스널 컬러, 헤어, 패션까지 다루는 컨설팅 기능을 준비 중이에요."
        showHeader={false}
        title="컨설팅"
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

export function MagazineRouteScreen({navigation}: RootScreenProps<'Magazine'>) {
  return (
    <DetailRouteChrome
      routeName="Magazine"
      onBack={() => navigateMainTab(navigation, 'HomeTab')}>
      <RoutePlaceholder
        description="메이크업, 퍼스널 컬러, 헤어, 패션 매거진 콘텐츠를 준비 중이에요."
        showHeader={false}
        title="매거진"
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
      <RoutePlaceholder
        description="전문가에게 퍼스널 컬러, 체형, 헤어, 패션 컨설팅을 받을 수 있는 기능을 준비 중이에요."
        showHeader={false}
        title="컨설팅"
      />
    </DetailRouteChrome>
  );
}
