import React from 'react';

import {useAuthSession} from '../../../features/auth';
import {ConsultingHeaderActions} from '../../../features/consulting';
import {getRecommendedFilterRouteParams} from '../../../features/home';
import {ProfileEditScreen, ProfileScreen} from '../../../features/profile';
import {
  getLikedMakeupFilterLooks,
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
  const createdMakeupLooks = React.useMemo(
    () =>
      savedMakeupLooks.length > 0
        ? savedMakeupLooks
        : savedMakeupLook
          ? [savedMakeupLook]
          : [],
    [savedMakeupLook, savedMakeupLooks],
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
      headerRightSlot={
        <ConsultingHeaderActions
          onPressNotifications={() =>
            rootNavigation?.navigate('ConsultingNotifications')
          }
          showMessages={false}
        />
      }
      navigation={navigation}
      routeName="ProfileTab"
      wrapContentInScreen={false}>
      <ProfileScreen
        onPressFaceAnalysisReportsList={() =>
          rootNavigation?.navigate('FaceAnalysisReportsList')
        }
        onPressMakeupRecommendationReportsList={() =>
          rootNavigation?.navigate('MakeupRecommendation', {view: 'history'})
        }
        onPressMakeupExtractionReportsList={() =>
          rootNavigation?.navigate('MakeupRecipeList')
        }
        onPressMakeupFeedbackReportsList={() =>
          rootNavigation?.navigate('MakeupFeedbackResultsList')
        }
        onPressLikedProductList={() => rootNavigation?.navigate('LikedProductList')}
        onPressMakeupLook={handleMakeupLookPress}
        onPressCreatedMakeupLookList={() =>
          rootNavigation?.navigate('MakeupLookList', {kind: 'created'})
        }
        onPressMakeupLookList={() =>
          rootNavigation?.navigate('MakeupLookList', {kind: 'liked'})
        }
        onPressProfileEdit={() => rootNavigation?.navigate('ProfileEdit')}
        onPressConsultingHistory={() =>
          rootNavigation?.navigate('ConsultingHistory', {returnTo: 'profile'})
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
        createdMakeupLooks={createdMakeupLooks}
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
