import React from 'react';

import {useAuthSession} from '../../../features/auth';
import {ConsultingHeaderActions} from '../../../features/consulting';
import {getRecommendedFilterRouteParams} from '../../../features/home';
import {ProfileEditScreen, ProfileScreen} from '../../../features/profile';
import {
  getLikedMakeupFilterLooks,
  mergeSavedAndLikedMakeupLooks,
} from '../../../shared/services/makeupGuideService';
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
    savedMakeupLook,
    savedMakeupLooks,
    setSelectedRecommendedMakeupFilterId,
  } = useNavigationFlowState();
  const likedMakeupLooks = React.useMemo(
    () => getLikedMakeupFilterLooks(likedMakeupFilterIds),
    [likedMakeupFilterIds],
  );
  const savedAndLikedMakeupLooks = React.useMemo(() => {
    return mergeSavedAndLikedMakeupLooks({
      likedMakeupLooks,
      savedMakeupLook,
      savedMakeupLooks,
    });
  }, [likedMakeupLooks, savedMakeupLook, savedMakeupLooks]);
  const handleMakeupLookPress = React.useCallback(
    (makeupLook: (typeof savedAndLikedMakeupLooks)[number]) => {
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
      headerRightSlot={
        <ConsultingHeaderActions
          onPressMessages={() => rootNavigation?.navigate('ConsultingMessages')}
          onPressNotifications={() =>
            rootNavigation?.navigate('ConsultingNotifications')
          }
        />
      }
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
        onPressProfileEdit={() => rootNavigation?.navigate('ProfileEdit')}
        onPressConsultingHistory={() =>
          rootNavigation?.navigate('ConsultingHistory')
        }
        onPressConsultingReview={record =>
          rootNavigation?.navigate('ConsultingReview', {
            expertId: record.expertId,
            recordId: record.id,
          })
        }
        onPressConsultingSummary={record =>
          rootNavigation?.navigate('ConsultingSummary', {
            expertId: record.expertId,
            recordId: record.id,
          })
        }
        likedMakeupLooks={savedAndLikedMakeupLooks}
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
