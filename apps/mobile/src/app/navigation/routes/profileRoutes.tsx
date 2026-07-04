import React from 'react';

import {useAuthSession} from '../../../features/auth';
import {getRecommendedFilterRouteParams} from '../../../features/home';
import {ProfileEditScreen, ProfileScreen} from '../../../features/profile';
import {getLikedMakeupFilterLooks} from '../../../shared/services/makeupGuideService';
import {useNavigationFlowState} from '../flowState';
import {
  MainTabChrome,
  navigateMainTab,
  type MainTabScreenProps,
  type RootNavigation,
  type RootScreenProps,
} from './routeUtils';

export function ProfileRouteScreen({navigation}: MainTabScreenProps<'ProfileTab'>) {
  const rootNavigation = navigation.getParent<RootNavigation>();
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
      rootNavigation?.navigate('ARFilter', getRecommendedFilterRouteParams(filterId));
    },
    [rootNavigation, setSelectedRecommendedMakeupFilterId],
  );

  return (
    <MainTabChrome
      navigation={navigation}
      routeName="ProfileTab"
      wrapContentInScreen={false}>
      <ProfileScreen
        onPressFaceAnalysisReport={reportId =>
          rootNavigation?.navigate('FaceAnalysisReportDetail', {reportId})
        }
        onPressFaceAnalysisReportsList={() =>
          rootNavigation?.navigate('FaceAnalysisReportsList')
        }
        onPressLikedProductList={() => rootNavigation?.navigate('LikedProductList')}
        onPressMakeupLook={handleMakeupLookPress}
        onPressMakeupLookList={() => rootNavigation?.navigate('MakeupLookList')}
        onPressProductRecommendationForReport={reportId =>
          rootNavigation?.navigate('ProductRecommendation', {reportId})
        }
        onPressProfileEdit={() => rootNavigation?.navigate('ProfileEdit')}
        likedMakeupLooks={likedMakeupLooks}
      />
    </MainTabChrome>
  );
}

export function ProfileEditRouteScreen({navigation}: RootScreenProps<'ProfileEdit'>) {
  const {clearSession} = useAuthSession();
  const handleLogout = React.useCallback(() => {
    void clearSession().finally(() => {
      navigation.reset({index: 0, routes: [{name: 'Login'}]});
    });
  }, [clearSession, navigation]);

  return (
    <ProfileEditScreen
      onBack={() => navigateMainTab(navigation, 'ProfileTab')}
      onLogout={handleLogout}
    />
  );
}
