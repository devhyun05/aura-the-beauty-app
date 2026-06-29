import React from 'react';

import {
  FilterStoreScreen,
  HomeScreen,
  SavedMakeupListScreen,
} from '../../../features/home';
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
        onPressARFilter={() => rootNavigation?.navigate('ARFilter')}
        onPressFilterStore={() => rootNavigation?.navigate('HomeFilterStore')}
        onPressReferenceMakeupExtraction={() => rootNavigation?.navigate('ReferenceMakeupExtractionUpload')}
        onPressFaceDiagnosis={() => rootNavigation?.navigate('Tutorial')}
        onPressMakeupFeedback={() => rootNavigation?.navigate('MakeupFeedbackEntry')}
        onPressProductRecommendations={() => navigation.navigate('CustomTab')}
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
  const {selectedFaceAnalysisReport} = useNavigationFlowState();

  return (
    <DetailRouteChrome
      routeName="SavedMakeupList"
      onBack={() => navigateMainTab(navigation, 'HomeTab')}>
      <SavedMakeupListScreen
        latestAnalysisReport={selectedFaceAnalysisReport}
        onApplyMakeup={() => navigation.navigate('ARFilter')}
      />
    </DetailRouteChrome>
  );
}
