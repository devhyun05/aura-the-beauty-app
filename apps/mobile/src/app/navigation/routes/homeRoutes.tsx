import React from 'react';

import {
  FilterStoreScreen,
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

  return (
    <MainTabChrome navigation={navigation} routeName="HomeTab">
      <HomeScreen
        onPressConsulting={() => rootNavigation?.navigate('Consulting')}
        onPressCommunity={() => rootNavigation?.navigate('Community')}
        onPressFilterStore={() => rootNavigation?.navigate('HomeFilterStore')}
        onPressFaceDiagnosis={() => rootNavigation?.navigate('Tutorial')}
        onPressProductRecommendations={() => rootNavigation?.navigate('ProductRecommendation')}
        onPressSavedMakeups={() => rootNavigation?.navigate('SavedMakeupList')}
      />
    </MainTabChrome>
  );
}

export function HomeFilterStoreRouteScreen({
  navigation,
}: RootScreenProps<'HomeFilterStore'>) {
  return (
    <DetailRouteChrome
      routeName="HomeFilterStore"
      onBack={() => navigateMainTab(navigation, 'HomeTab')}>
      <FilterStoreScreen onApplyFilter={() => navigation.navigate('ARFilter')} />
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
