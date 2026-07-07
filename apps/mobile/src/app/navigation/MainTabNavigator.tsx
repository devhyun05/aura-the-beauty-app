import React, {useCallback, useState} from 'react';
import {Pressable, StyleSheet, useWindowDimensions} from 'react-native';
import {createBottomTabNavigator, type BottomTabBarProps} from '@react-navigation/bottom-tabs';
import type {NavigationProp} from '@react-navigation/native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {YStack} from 'tamagui';

import {spacing} from '../../shared/theme';
import {
  AppFooter,
  FLOATING_ACTION_HOST_EXTRA_HEIGHT,
  FloatingActionMenu,
  type FloatingActionId,
  type FooterTabKey,
} from '../../shared/ui';
import {APP_FOOTER_FLOATING_HOST_BASE_HEIGHT} from '../../shared/ui/AppFooter';
import {MakeupExtractionActionSheet} from '../../features/home/components/MakeupExtractionActionSheet';
import {MakeupFeedbackActionSheet} from '../../features/home/components/MakeupFeedbackActionSheet';
import {
  COMMUNITY_MODE_BAR_FOOTER_GAP,
  CommunityModeBar,
  type CommunityMode,
} from '../../features/community/components/CommunityModeBar';
import {useNavigationFlowState} from './flowState';
import {getMainTabFooterState, getRootRouteForFooterTab} from './mainTabChrome';
import type {MainTabParamList, MainTabRouteName, RootStackParamList} from './routeTypes';
import {HomeRouteScreen} from './routes/homeRoutes';
import {CommunityTabRouteScreen} from './routes/homeRoutes';
import {ProfileRouteScreen} from './routes/profileRoutes';

const Tab = createBottomTabNavigator<MainTabParamList>();

export type FloatingActionPresentation =
  | 'route'
  | 'makeupExtractionSheet'
  | 'makeupFeedbackSheet';

export function getFloatingActionPresentation(
  actionId: FloatingActionId,
): FloatingActionPresentation {
  if (actionId === 'makeupExtraction') {
    return 'makeupExtractionSheet';
  }

  if (actionId === 'makeupFeedback') {
    return 'makeupFeedbackSheet';
  }

  return 'route';
}

export function getMainTabBarMinHostHeight(footerBottomInset: number): number {
  return (
    APP_FOOTER_FLOATING_HOST_BASE_HEIGHT +
    footerBottomInset +
    FLOATING_ACTION_HOST_EXTRA_HEIGHT
  );
}

export function getMainTabBarHostHeight(
  windowHeight: number,
  footerBottomInset: number,
): number {
  return Math.max(windowHeight, getMainTabBarMinHostHeight(footerBottomInset));
}

export function shouldShowFloatingActionDismissLayer(isExpanded: boolean): boolean {
  return isExpanded;
}

export function MainTabNavigator() {
  const [communityMode, setCommunityMode] = useState<CommunityMode>('home');

  return (
    <Tab.Navigator
      initialRouteName="HomeTab"
      screenOptions={{headerShown: false}}
      tabBar={props => (
        <MainTabBar
          {...props}
          communityMode={communityMode}
          onSelectCommunityMode={setCommunityMode}
        />
      )}>
      <Tab.Screen name="HomeTab" component={HomeRouteScreen} />
      <Tab.Screen name="ProfileTab" component={ProfileRouteScreen} />
      <Tab.Screen name="CommunityTab">
        {props => (
          <CommunityTabRouteScreen
            {...props}
            communityMode={communityMode}
            onSelectCommunityMode={setCommunityMode}
          />
        )}
      </Tab.Screen>
    </Tab.Navigator>
  );
}

type MainTabBarProps = BottomTabBarProps & {
  communityMode: CommunityMode;
  onSelectCommunityMode: (mode: CommunityMode) => void;
};

function MainTabBar({
  communityMode,
  navigation,
  onSelectCommunityMode,
  state,
}: MainTabBarProps) {
  const insets = useSafeAreaInsets();
  const {height: windowHeight} = useWindowDimensions();
  const [isExtractionSheetVisible, setIsExtractionSheetVisible] = useState(false);
  const [isFeedbackSheetVisible, setIsFeedbackSheetVisible] = useState(false);
  const [isFloatingActionMenuExpanded, setIsFloatingActionMenuExpanded] = useState(false);
  const activeRouteName = state.routes[state.index]?.name as MainTabRouteName | undefined;
  const activeTab = activeRouteName ? getMainTabFooterState(activeRouteName) : undefined;
  const {
    floatingActionButtonPosition,
    floatingActionIds,
    floatingActionInteractionMode,
    setMakeupFeedbackResult,
    setSelectedMakeupFeedbackPhoto,
    setSelectedRecommendedMakeupFilterId,
    setSelectedReferenceMakeupPhoto,
  } = useNavigationFlowState();
  const rootNavigation = navigation.getParent<NavigationProp<RootStackParamList>>();
  const footerBottomInset = Math.max(insets.bottom, spacing.md);
  const shouldShowCommunityModeBar = activeRouteName === 'CommunityTab';

  const closeExtractionSheet = useCallback(() => {
    setIsExtractionSheetVisible(false);
  }, []);

  const closeFeedbackSheet = useCallback(() => {
    setIsFeedbackSheetVisible(false);
  }, []);

  const startMakeupExtraction = useCallback((initialSource: 'camera' | 'gallery') => {
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

  const startMakeupFeedback = useCallback((photoSource: 'camera' | 'gallery') => {
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
  }, [rootNavigation, setMakeupFeedbackResult, setSelectedMakeupFeedbackPhoto]);

  const handleTabPress = useCallback(
    (tab: FooterTabKey) => {
      const targetRoute = getRootRouteForFooterTab(tab);

      setIsFloatingActionMenuExpanded(false);
      navigation.navigate(targetRoute);
    },
    [navigation],
  );

  const handleFloatingActionPress = useCallback(
    (actionId: FloatingActionId) => {
      const presentation = getFloatingActionPresentation(actionId);

      if (presentation === 'makeupExtractionSheet') {
        setIsFeedbackSheetVisible(false);
        setIsExtractionSheetVisible(true);
        return;
      }

      if (presentation === 'makeupFeedbackSheet') {
        setIsExtractionSheetVisible(false);
        setIsFeedbackSheetVisible(true);
        return;
      }

      if (actionId === 'arFilter') {
        setSelectedRecommendedMakeupFilterId(null);
        rootNavigation?.navigate('ARFilter');
        return;
      }

      if (actionId === 'faceAnalysis') {
        rootNavigation?.navigate('FaceAnalysisIntro');
        return;
      }

      if (actionId === 'filterStore') {
        rootNavigation?.navigate('HomeFilterStore');
        return;
      }

      rootNavigation?.navigate('ProductRecommendation');
    },
    [
      rootNavigation,
      setSelectedRecommendedMakeupFilterId,
    ],
  );

  const handleFloatingActionSettingsPress = useCallback(() => {
    rootNavigation?.navigate('FloatingActionSettings');
  }, [rootNavigation]);

  const handleCommunityCreatePress = useCallback(() => {
    rootNavigation?.navigate('CommunityThreadCreate');
  }, [rootNavigation]);

  return (
    <YStack
      pointerEvents="box-none"
      style={[
        styles.tabBarHost,
        {
          height: getMainTabBarHostHeight(windowHeight, footerBottomInset),
        },
      ]}>
      {shouldShowCommunityModeBar ? (
        <YStack
          style={[
            styles.communityModeBarHost,
            {
              bottom:
                APP_FOOTER_FLOATING_HOST_BASE_HEIGHT +
                footerBottomInset +
                COMMUNITY_MODE_BAR_FOOTER_GAP,
            },
          ]}>
          <CommunityModeBar
            bottomPadding={spacing.sm}
            mode={communityMode}
            onPressCreate={handleCommunityCreatePress}
            onSelectMode={onSelectCommunityMode}
          />
        </YStack>
      ) : null}
      {shouldShowFloatingActionDismissLayer(isFloatingActionMenuExpanded) ? (
        <Pressable
          accessibilityLabel="빠른 실행 메뉴 닫기"
          accessibilityRole="button"
          onPress={() => setIsFloatingActionMenuExpanded(false)}
          style={styles.floatingActionDismissLayer}
        />
      ) : null}
      <AppFooter
        actionSlotPosition={floatingActionButtonPosition}
        actionSlot={
          <FloatingActionMenu
            actionIds={floatingActionIds}
            buttonPosition={floatingActionButtonPosition}
            interactionMode={floatingActionInteractionMode}
            isExpanded={isFloatingActionMenuExpanded}
            onExpandedChange={setIsFloatingActionMenuExpanded}
            onPressSettings={handleFloatingActionSettingsPress}
            onSelectAction={handleFloatingActionPress}
            placement="inline"
          />
        }
        activeTab={activeTab}
        bottomInset={insets.bottom}
        floating
        onTabPress={handleTabPress}
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
    </YStack>
  );
}

const styles = StyleSheet.create({
  communityModeBarHost: {
    elevation: 30,
    left: 0,
    position: 'absolute',
    right: 0,
    zIndex: 30,
  },
  tabBarHost: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
  },
  floatingActionDismissLayer: {
    backgroundColor: 'transparent',
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
    zIndex: 10,
  },
});
