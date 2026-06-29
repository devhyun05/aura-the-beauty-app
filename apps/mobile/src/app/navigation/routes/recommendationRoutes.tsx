import React from 'react';

import {
  AuradinSearchScreen,
  LikedProductListScreen,
  MakeupLookListScreen,
  ProductRecommendationScreen,
} from '../../../features/recommendation';
import {DetailRouteChrome} from '../detailHeaderChrome';
import {useNavigationFlowState} from '../flowState';
import {
  MainTabChrome,
  navigateMainTab,
  type MainTabScreenProps,
  type RootScreenProps,
} from './routeUtils';

export function CustomRouteScreen({navigation}: MainTabScreenProps<'CustomTab'>) {
  return (
    <MainTabChrome navigation={navigation} routeName="CustomTab">
      <AuradinSearchScreen />
    </MainTabChrome>
  );
}

export function ProductRecommendationRouteScreen({
  navigation,
}: RootScreenProps<'ProductRecommendation'>) {
  const {selectedFaceAnalysisReport} = useNavigationFlowState();

  return (
    <DetailRouteChrome
      routeName="ProductRecommendation"
      onBack={() => navigateMainTab(navigation, 'HomeTab')}>
      <ProductRecommendationScreen sourceReportId={selectedFaceAnalysisReport?.id} />
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
