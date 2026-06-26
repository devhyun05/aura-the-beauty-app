import React from 'react';

import {ProfileEditScreen, ProfileScreen} from '../../../features/profile';
import {DetailRouteChrome} from '../detailHeaderChrome';
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
  const {savedMakeupLook} = useNavigationFlowState();

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
        onPressMakeupLookList={() => rootNavigation?.navigate('MakeupLookList')}
        onPressProfileEdit={() => rootNavigation?.navigate('ProfileEdit')}
        savedMakeupLook={savedMakeupLook}
      />
    </MainTabChrome>
  );
}

export function ProfileEditRouteScreen({navigation}: RootScreenProps<'ProfileEdit'>) {
  return (
    <DetailRouteChrome
      routeName="ProfileEdit"
      onBack={() => navigateMainTab(navigation, 'ProfileTab')}>
      <ProfileEditScreen
        onLogout={() => navigation.reset({index: 0, routes: [{name: 'Login'}]})}
      />
    </DetailRouteChrome>
  );
}
