import React from 'react';

import {MakeupToolsScreen} from '../../../features/home';
import {
  LikedProductListScreen,
  MakeupLookListScreen,
  ProductRecommendationScreen,
} from '../../../features/recommendation';
import {getRecommendedFilterRouteParams} from '../../../features/home';
import {getLikedMakeupFilterLooks} from '../../../shared/services/makeupGuideService';
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
  route,
}: RootScreenProps<'ProductRecommendation'>) {
  const {selectedFaceAnalysisReport} = useNavigationFlowState();
  const sourceReportId = route.params?.reportId ?? selectedFaceAnalysisReport?.id ?? null;

  return (
    <DetailRouteChrome
      routeName="ProductRecommendation"
      onBack={() => navigateMainTab(navigation, 'HomeTab')}>
      <ProductRecommendationScreen sourceReportId={sourceReportId} />
    </DetailRouteChrome>
  );
}

export function MakeupLookListRouteScreen({
  navigation,
}: RootScreenProps<'MakeupLookList'>) {
  const {
    likedMakeupFilterIds,
    setSelectedRecommendedMakeupFilterId,
  } = useNavigationFlowState();
  const likedMakeupLooks = React.useMemo(
    () => getLikedMakeupFilterLooks(likedMakeupFilterIds),
    [likedMakeupFilterIds],
  );
  const handleMakeupLookPress = React.useCallback(
    (makeupLook: (typeof likedMakeupLooks)[number]) => {
      const filterId = makeupLook.makeupPresetValues.sourceFilterId;

      if (!filterId) {
        return;
      }

      setSelectedRecommendedMakeupFilterId(filterId);
      navigation.navigate('ARFilter', getRecommendedFilterRouteParams(filterId));
    },
    [navigation, setSelectedRecommendedMakeupFilterId],
  );

  return (
    <DetailRouteChrome
      routeName="MakeupLookList"
      onBack={() => navigateMainTab(navigation, 'ProfileTab')}>
      <MakeupLookListScreen
        likedMakeupLooks={likedMakeupLooks}
        onPressMakeupLook={handleMakeupLookPress}
      />
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
