import React from 'react';

import {MakeupToolsScreen} from '../../../features/home';
import {
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
  type RootNavigation,
  type RootScreenProps,
} from './routeUtils';

export function CustomRouteScreen({navigation}: MainTabScreenProps<'CustomTab'>) {
  const rootNavigation = navigation.getParent<RootNavigation>();

  return (
    <MainTabChrome navigation={navigation} routeName="CustomTab" wrapContentInScreen={false}>
      <MakeupToolsScreen
        onPressAlbumPick={() => rootNavigation?.navigate('ReferenceMakeupExtractionUpload')}
        onPressCameraCapture={() => rootNavigation?.navigate('MakeupFeedbackCapture')}
      />
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
      <ProductRecommendationScreen
        onCapturePhoto={() =>
          navigation.navigate('FaceCapture', {afterAnalysisRoute: 'ProductRecommendation'})
        }
        onPickGalleryPhoto={() =>
          navigation.navigate('FaceCapture', {
            afterAnalysisRoute: 'ProductRecommendation',
            initialSource: 'gallery',
          })
        }
        sourceReportId={selectedFaceAnalysisReport?.id}
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
