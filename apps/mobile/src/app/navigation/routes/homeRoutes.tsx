import React from 'react';

import {
  FilterStoreScreen,
  FloatingActionSettingsScreen,
  getRecommendedFilterRouteParams,
  HomeScreen,
  SavedMakeupListScreen,
} from '../../../features/home';
import {MakeupExtractionActionSheet} from '../../../features/home/components/MakeupExtractionActionSheet';
import {MakeupFeedbackActionSheet} from '../../../features/home/components/MakeupFeedbackActionSheet';
import {useAuthSession} from '../../../features/auth';
import {markFaceCaptureTutorialCompleted} from '../../../features/onboarding';
import {
  CommunityCreateThreadScreen,
  CommunityHomeScreen,
  CommunityThreadDetailScreen,
  CommunityUserProfileScreen,
  type CommunityMode,
} from '../../../features/community';
import {DetailRouteChrome} from '../detailHeaderChrome';
import {useNavigationFlowState} from '../flowState';
import {renderConsultingHome} from './consultingRoutes';
import {
  MainTabChrome,
  navigateMainTab,
  type MainTabScreenProps,
  type RootNavigation,
  type RootScreenProps,
} from './routeUtils';

export function FloatingActionSettingsRouteScreen({
  navigation,
}: RootScreenProps<'FloatingActionSettings'>) {
  const {
    floatingActionButtonPosition,
    floatingActionIds,
    floatingActionInteractionMode,
    setFloatingActionButtonPosition,
    setFloatingActionIds,
    setFloatingActionInteractionMode,
  } = useNavigationFlowState();

  return (
    <DetailRouteChrome
      routeName="FloatingActionSettings"
      onBack={() => {
        if (navigation.canGoBack()) {
          navigation.goBack();
          return;
        }

        navigateMainTab(navigation, 'HomeTab');
      }}>
      <FloatingActionSettingsScreen
        selectedActionIds={floatingActionIds}
        selectedButtonPosition={floatingActionButtonPosition}
        selectedInteractionMode={floatingActionInteractionMode}
        onChangeActionIds={setFloatingActionIds}
        onChangeButtonPosition={setFloatingActionButtonPosition}
        onChangeInteractionMode={setFloatingActionInteractionMode}
      />
    </DetailRouteChrome>
  );
}

export function getHomeRecommendedFilterMoreRouteName(): 'HomeFilterStore' {
  return 'HomeFilterStore';
}

export function HomeRouteScreen({navigation}: MainTabScreenProps<'HomeTab'>) {
  const rootNavigation = navigation.getParent<RootNavigation>();
  const [isExtractionSheetVisible, setIsExtractionSheetVisible] = React.useState(false);
  const [isFeedbackSheetVisible, setIsFeedbackSheetVisible] = React.useState(false);
  const {
    likedMakeupFilterIds,
    setMakeupFeedbackResult,
    setLikedMakeupFilterIds,
    setSelectedMakeupFeedbackPhoto,
    setSelectedRecommendedMakeupFilterId,
    setSelectedReferenceMakeupPhoto,
    setShouldShowBeautyJourneyGuide,
    shouldShowBeautyJourneyGuide,
  } = useNavigationFlowState();
  const {session} = useAuthSession();

  const handleRecommendedFilterPress = React.useCallback((filterId: string) => {
    setSelectedRecommendedMakeupFilterId(filterId);
    rootNavigation?.navigate('ARFilter', getRecommendedFilterRouteParams(filterId));
  }, [rootNavigation, setSelectedRecommendedMakeupFilterId]);

  const handleHeroTrendFilterPress = React.useCallback((filterId: string) => {
    setSelectedRecommendedMakeupFilterId(filterId);
    rootNavigation?.navigate('ARFilter', getRecommendedFilterRouteParams(filterId));
  }, [rootNavigation, setSelectedRecommendedMakeupFilterId]);

  const handleMakeupFilterPress = React.useCallback(() => {
    setSelectedRecommendedMakeupFilterId(null);
    rootNavigation?.navigate('ARFilter', {source: 'homeServiceShortcut'});
  }, [rootNavigation, setSelectedRecommendedMakeupFilterId]);

  const handleHalfMakeupPress = React.useCallback(() => {
    setSelectedRecommendedMakeupFilterId(null);
    rootNavigation?.navigate('ARFilter', {
      initialGuideMode: 'half',
      source: 'homeServiceShortcut',
    });
  }, [rootNavigation, setSelectedRecommendedMakeupFilterId]);

  const closeExtractionSheet = React.useCallback(() => {
    setIsExtractionSheetVisible(false);
  }, []);

  const closeFeedbackSheet = React.useCallback(() => {
    setIsFeedbackSheetVisible(false);
  }, []);

  const startMakeupExtraction = React.useCallback((initialSource: 'camera' | 'gallery') => {
    setIsExtractionSheetVisible(false);
    setSelectedRecommendedMakeupFilterId(null);
    setSelectedReferenceMakeupPhoto(null);

    requestAnimationFrame(() => {
      rootNavigation?.navigate('ReferenceMakeupExtractionUpload', {initialSource});
    });
  }, [
    rootNavigation,
    setSelectedRecommendedMakeupFilterId,
    setSelectedReferenceMakeupPhoto,
  ]);

  const startMakeupFeedback = React.useCallback((photoSource: 'camera' | 'gallery') => {
    setIsFeedbackSheetVisible(false);
    setMakeupFeedbackResult(null);
    setSelectedMakeupFeedbackPhoto({photoSource});

    requestAnimationFrame(() => {
      if (photoSource === 'camera') {
        rootNavigation?.navigate('MakeupFeedbackCapture');
        return;
      }

      rootNavigation?.navigate('MakeupFeedbackAlbumUpload');
    });
  }, [
    rootNavigation,
    setMakeupFeedbackResult,
    setSelectedMakeupFeedbackPhoto,
  ]);

  const handleMakeupExtractionPress = React.useCallback(() => {
    setIsFeedbackSheetVisible(false);
    setIsExtractionSheetVisible(true);
  }, []);

  const handleMakeupFeedbackPress = React.useCallback(() => {
    setIsExtractionSheetVisible(false);
    setIsFeedbackSheetVisible(true);
  }, []);

  const handleBeautyJourneyGuideConfirm = React.useCallback(() => {
    setShouldShowBeautyJourneyGuide(false);

    void (async () => {
      try {
        if (session) {
          await markFaceCaptureTutorialCompleted(session.user);
        }
      } catch {
        // Continue to the intro even if the preference save call fails.
      } finally {
        rootNavigation?.navigate('FaceAnalysisIntro');
      }
    })();
  }, [rootNavigation, session, setShouldShowBeautyJourneyGuide]);

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
      {({openFeatureMenu}) => (
        <>
          <HomeScreen
            onOpenFeatureMenu={openFeatureMenu}
            onPressArFilter={() => rootNavigation?.navigate('ARFilter')}
            onPressFaceDiagnosis={() => rootNavigation?.navigate('FaceAnalysisIntro')}
            onPressCommunity={() => navigation.navigate('CommunityTab')}
            onPressConsulting={() => rootNavigation?.navigate('Consulting')}
            onPressHalfMakeup={handleHalfMakeupPress}
            onPressHeroTrendFilter={handleHeroTrendFilterPress}
            onPressMakeupExtraction={handleMakeupExtractionPress}
            onPressMakeupFeedback={handleMakeupFeedbackPress}
            onPressMakeupFilter={handleMakeupFilterPress}
            onPressProductRecommendations={() => rootNavigation?.navigate('AuradinSearch')}
            onPressRecommendedFilterMore={() =>
              rootNavigation?.navigate(getHomeRecommendedFilterMoreRouteName())
            }
            onPressRecommendedFilter={handleRecommendedFilterPress}
            isMakeupFilterLiked={isMakeupFilterLiked}
            onToggleMakeupFilterLike={handleToggleMakeupFilterLike}
            showBeautyJourneyGuide={shouldShowBeautyJourneyGuide}
            onConfirmBeautyJourneyGuide={handleBeautyJourneyGuideConfirm}
          />
          <MakeupExtractionActionSheet
            isVisible={isExtractionSheetVisible}
            onClose={closeExtractionSheet}
            onPressCamera={() => startMakeupExtraction('camera')}
            onPressUpload={() => startMakeupExtraction('gallery')}
          />
          <MakeupFeedbackActionSheet
            isVisible={isFeedbackSheetVisible}
            onClose={closeFeedbackSheet}
            onPressCamera={() => startMakeupFeedback('camera')}
            onPressUpload={() => startMakeupFeedback('gallery')}
          />
        </>
      )}
    </MainTabChrome>
  );
}

type CommunityTabRouteScreenProps = MainTabScreenProps<'CommunityTab'> & {
  communityMode: CommunityMode;
  onSelectCommunityMode: (mode: CommunityMode) => void;
};

export function CommunityTabRouteScreen({
  communityMode,
  navigation,
  onSelectCommunityMode,
}: CommunityTabRouteScreenProps) {
  const rootNavigation = navigation.getParent<RootNavigation>();

  return (
    <MainTabChrome
      navigation={navigation}
      routeName="CommunityTab"
      wrapContentInScreen={false}>
      <CommunityHomeScreen
        avoidFloatingFooter
        mode={communityMode}
        onPressCreate={() => rootNavigation?.navigate('CommunityThreadCreate')}
        onPressAuthor={author => rootNavigation?.navigate('CommunityUserProfile', {
          avatarUrl: author.avatarUrl,
          nickname: author.nickname,
          userId: author.id,
        })}
        onPressEditProfile={() => rootNavigation?.navigate('ProfileEdit')}
        onPressThread={threadId => rootNavigation?.navigate('CommunityThreadDetail', {threadId})}
        onSelectMode={onSelectCommunityMode}
      />
    </MainTabChrome>
  );
}
function navigateCommunityTab(navigation: RootNavigation) {
  navigateMainTab(navigation, 'CommunityTab');
}

function navigateBackOrCommunityTab(navigation: RootNavigation) {
  if (navigation.canGoBack()) {
    navigation.goBack();
    return;
  }

  navigateCommunityTab(navigation);
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
      <CommunityHomeScreen
        onPressCreate={() => navigation.navigate('CommunityThreadCreate')}
        onPressAuthor={author => navigation.navigate('CommunityUserProfile', {
          avatarUrl: author.avatarUrl,
          nickname: author.nickname,
          userId: author.id,
        })}
        onPressEditProfile={() => navigation.navigate('ProfileEdit')}
        onPressThread={threadId => navigation.navigate('CommunityThreadDetail', {threadId})}
      />
    </DetailRouteChrome>
  );
}

export function CommunityThreadDetailRouteScreen({
  navigation,
  route,
}: RootScreenProps<'CommunityThreadDetail'>) {
  return (
    <DetailRouteChrome
      routeName="CommunityThreadDetail"
      onBack={() => navigateBackOrCommunityTab(navigation)}>
      <CommunityThreadDetailScreen
        threadId={route.params.threadId}
        onDeleted={() => navigateCommunityTab(navigation)}
        onPressEditThread={thread => navigation.navigate('CommunityThreadEdit', {threadId: thread.id})}
        onPressAuthor={author => navigation.navigate('CommunityUserProfile', {
          avatarUrl: author.avatarUrl,
          nickname: author.nickname,
          userId: author.id,
        })}
      />
    </DetailRouteChrome>
  );
}

export function CommunityThreadEditRouteScreen({
  navigation,
  route,
}: RootScreenProps<'CommunityThreadEdit'>) {
  return (
    <DetailRouteChrome
      routeName="CommunityThreadEdit"
      onBack={() => navigateBackOrCommunityTab(navigation)}>
      <CommunityCreateThreadScreen
        mode="edit"
        threadId={route.params.threadId}
        onUpdated={thread => navigation.replace('CommunityThreadDetail', {threadId: thread.id})}
      />
    </DetailRouteChrome>
  );
}

export function CommunityUserProfileRouteScreen({
  navigation,
  route,
}: RootScreenProps<'CommunityUserProfile'>) {
  return (
    <DetailRouteChrome
      routeName="CommunityUserProfile"
      onBack={() => navigation.goBack()}>
      <CommunityUserProfileScreen
        avatarUrl={route.params.avatarUrl}
        nickname={route.params.nickname}
        userId={route.params.userId}
        onPressThread={threadId => navigation.navigate('CommunityThreadDetail', {threadId})}
      />
    </DetailRouteChrome>
  );
}

export function CommunityThreadCreateRouteScreen({
  navigation,
}: RootScreenProps<'CommunityThreadCreate'>) {
  return (
    <DetailRouteChrome
      routeName="CommunityThreadCreate"
      onBack={() => navigateBackOrCommunityTab(navigation)}>
      <CommunityCreateThreadScreen
        onCreated={thread => navigation.replace('CommunityThreadDetail', {threadId: thread.id})}
      />
    </DetailRouteChrome>
  );
}
export function ConsultingRouteScreen({navigation}: RootScreenProps<'Consulting'>) {
  return (
    <DetailRouteChrome
      routeName="Consulting"
      onBack={() => navigateMainTab(navigation, 'HomeTab')}>
      {renderConsultingHome(navigation)}
    </DetailRouteChrome>
  );
}
