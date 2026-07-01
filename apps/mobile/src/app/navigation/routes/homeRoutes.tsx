import React from 'react';

import {
  FilterStoreScreen,
  getRecommendedFilterRouteParams,
  HomeScreen,
  SavedMakeupListScreen,
} from '../../../features/home';
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

export function HomeRouteScreen({navigation}: MainTabScreenProps<'HomeTab'>) {
  const rootNavigation = navigation.getParent<RootNavigation>();
  const {
    likedMakeupFilterIds,
    setLikedMakeupFilterIds,
    setSelectedRecommendedMakeupFilterId,
    setSelectedReferenceMakeupPhoto,
  } = useNavigationFlowState();

  const handleRecommendedFilterPress = React.useCallback((filterId: string) => {
    setSelectedRecommendedMakeupFilterId(filterId);
    rootNavigation?.navigate('ARFilter', getRecommendedFilterRouteParams(filterId));
  }, [rootNavigation, setSelectedRecommendedMakeupFilterId]);

  const handleHeroTrendFilterPress = React.useCallback((filterId: string) => {
    rootNavigation?.navigate('HomeFilterStore', {initialMakeupFilterId: filterId});
  }, [rootNavigation]);

  const handleMakeupExtractionPress = React.useCallback(() => {
    setSelectedRecommendedMakeupFilterId(null);
    setSelectedReferenceMakeupPhoto(null);
    rootNavigation?.navigate('ReferenceMakeupExtractionUpload');
  }, [rootNavigation, setSelectedRecommendedMakeupFilterId, setSelectedReferenceMakeupPhoto]);

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
        onPressConsulting={() => rootNavigation?.navigate('Consulting')}
        onPressCommunity={() => rootNavigation?.navigate('Community')}
        onPressFaceDiagnosis={() => rootNavigation?.navigate('Tutorial')}
        onPressHeroTrendFilter={handleHeroTrendFilterPress}
        onPressMakeupExtraction={handleMakeupExtractionPress}
        onPressProductRecommendations={() => rootNavigation?.navigate('ProductRecommendation')}
        onPressRecommendedFilter={handleRecommendedFilterPress}
        isMakeupFilterLiked={isMakeupFilterLiked}
        onToggleMakeupFilterLike={handleToggleMakeupFilterLike}
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
      <RoutePlaceholder
        description="전문가에게 메이크업 컨설팅을 받을 수 있는 기능을 준비 중이에요."
        showHeader={false}
        title="메이크업 컨설팅"
      />
    </DetailRouteChrome>
  );
}
