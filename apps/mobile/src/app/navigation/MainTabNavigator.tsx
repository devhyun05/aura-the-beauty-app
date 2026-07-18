import React, {useCallback, useMemo, useState} from 'react';
import {Pressable, StyleSheet, useWindowDimensions} from 'react-native';
import {createBottomTabNavigator, type BottomTabBarProps} from '@react-navigation/bottom-tabs';
import type {NavigationProp} from '@react-navigation/native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {YStack} from 'tamagui';

import {spacing} from '../../shared/theme';
import {isMakeupJourneyEnabled} from '../../shared/config/featureFlags';
import {trackMakeupJourneyEvent} from '../../shared/services/makeupJourneyAnalytics';
import {
  AppFooter,
  FLOATING_ACTION_HOST_EXTRA_HEIGHT,
  FloatingActionMenu,
  type FloatingActionId,
  type FooterTabKey,
} from '../../shared/ui';
import {APP_FOOTER_FLOATING_HOST_BASE_HEIGHT} from '../../shared/ui/AppFooter';
import {useNavigationFlowState} from './flowState';
import {getMainTabFooterState, getRootRouteForFooterTab} from './mainTabChrome';
import type {MainTabParamList, MainTabRouteName, RootStackParamList} from './routeTypes';

const loadHomeRoutes = () =>
  require('./routes/homeRoutes') as typeof import('./routes/homeRoutes');
const loadProfileRoutes = () =>
  require('./routes/profileRoutes') as typeof import('./routes/profileRoutes');
const loadMakeupJourneyRoutes = () =>
  require('./routes/makeupJourneyRoutes') as typeof import('./routes/makeupJourneyRoutes');

type MakeupExtractionActionSheetProps = React.ComponentProps<
  typeof import('../../features/home/components/MakeupExtractionActionSheet').MakeupExtractionActionSheet
>;
type MakeupFeedbackActionSheetProps = React.ComponentProps<
  typeof import('../../features/home/components/MakeupFeedbackActionSheet').MakeupFeedbackActionSheet
>;

function DeferredMakeupExtractionActionSheet(
  props: MakeupExtractionActionSheetProps,
) {
  const {MakeupExtractionActionSheet} = require(
    '../../features/home/components/MakeupExtractionActionSheet'
  ) as typeof import('../../features/home/components/MakeupExtractionActionSheet');

  return <MakeupExtractionActionSheet {...props} />;
}

function DeferredMakeupFeedbackActionSheet(
  props: MakeupFeedbackActionSheetProps,
) {
  const {MakeupFeedbackActionSheet} = require(
    '../../features/home/components/MakeupFeedbackActionSheet'
  ) as typeof import('../../features/home/components/MakeupFeedbackActionSheet');

  return <MakeupFeedbackActionSheet {...props} />;
}

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
  return (
    <Tab.Navigator
      initialRouteName="HomeTab"
      screenOptions={{headerShown: false}}
      tabBar={props => <MainTabBar {...props} />}>
      <Tab.Screen
        name="HomeTab"
        getComponent={() => loadHomeRoutes().HomeRouteScreen}
      />
      <Tab.Screen
        name="ConsultingTab"
        getComponent={() => loadHomeRoutes().ConsultingTabRouteScreen}
      />
      <Tab.Screen
        name="MakeupJourneyTab"
        getComponent={() => loadMakeupJourneyRoutes().MakeupJourneyTabRouteScreen}
      />
      <Tab.Screen
        name="ProfileTab"
        getComponent={() => loadProfileRoutes().ProfileRouteScreen}
      />
    </Tab.Navigator>
  );
}

type MainTabBarProps = BottomTabBarProps;

function MainTabBar({
  navigation,
  state,
}: MainTabBarProps) {
  const insets = useSafeAreaInsets();
  const {height: windowHeight, width: windowWidth} = useWindowDimensions();
  const [isExtractionSheetVisible, setIsExtractionSheetVisible] = useState(false);
  const [isFeedbackSheetVisible, setIsFeedbackSheetVisible] = useState(false);
  const [isFloatingActionMenuExpanded, setIsFloatingActionMenuExpanded] = useState(false);
  const activeRouteName = state.routes[state.index]?.name as MainTabRouteName | undefined;
  const activeTab = activeRouteName ? getMainTabFooterState(activeRouteName) : undefined;
  const {
    beginMakeupFeedbackFlow,
    floatingActionAnchor,
    floatingActionButtonPosition,
    floatingActionIds,
    floatingActionInteractionMode,
    setMakeupFeedbackResult,
    setFloatingActionAnchor,
    setFloatingActionButtonPosition,
    setSelectedMakeupFeedbackPhoto,
    setSelectedRecommendedMakeupFilterId,
    setSelectedReferenceMakeupPhoto,
  } = useNavigationFlowState();
  const rootNavigation = navigation.getParent<NavigationProp<RootStackParamList>>();
  const footerBottomInset = Math.max(insets.bottom, spacing.md);
  const makeupJourneyEnabled = isMakeupJourneyEnabled();
  const floatingActionViewport = useMemo(() => ({
    bottomInset: insets.bottom,
    bottomReserved: APP_FOOTER_FLOATING_HOST_BASE_HEIGHT + spacing.md,
    height: windowHeight,
    leftInset: insets.left,
    rightInset: insets.right,
    topInset: insets.top,
    width: windowWidth,
  }), [insets, windowHeight, windowWidth]);

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
    beginMakeupFeedbackFlow();
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
    beginMakeupFeedbackFlow,
    rootNavigation,
    setMakeupFeedbackResult,
    setSelectedMakeupFeedbackPhoto,
  ]);

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

      if (actionId === 'makeupRecommendation') {
        rootNavigation?.navigate('MakeupRecommendation');
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
  const handleFloatingActionAnchorChange = useCallback((anchor: {
    xRatio: number;
    yRatio: number;
  }) => {
    setFloatingActionAnchor(anchor);
    setFloatingActionButtonPosition(anchor.xRatio <= 0.5 ? 'left' : 'right');
  }, [setFloatingActionAnchor, setFloatingActionButtonPosition]);

  return (
    <YStack
      pointerEvents="box-none"
      style={[
        styles.tabBarHost,
        {
          height: getMainTabBarHostHeight(windowHeight, footerBottomInset),
        },
      ]}>
      {shouldShowFloatingActionDismissLayer(isFloatingActionMenuExpanded) ? (
        <Pressable
          accessibilityLabel="빠른 실행 메뉴 닫기"
          accessibilityRole="button"
          onPress={() => setIsFloatingActionMenuExpanded(false)}
          style={styles.floatingActionDismissLayer}
        />
      ) : null}
      <FloatingActionMenu
        actionIds={floatingActionIds}
        anchor={floatingActionAnchor}
        buttonPosition={floatingActionButtonPosition}
        interactionMode={floatingActionInteractionMode}
        isExpanded={isFloatingActionMenuExpanded}
        onAnchorChange={handleFloatingActionAnchorChange}
        onExpandedChange={setIsFloatingActionMenuExpanded}
        onPressSettings={handleFloatingActionSettingsPress}
        onReposition={quadrant => {
          trackMakeupJourneyEvent({
            name: 'floating_action_repositioned',
            properties: {quadrant},
          });
        }}
        onSelectAction={handleFloatingActionPress}
        placement="free"
        viewport={floatingActionViewport}
      />
      <AppFooter
        activeTab={activeTab}
        bottomInset={insets.bottom}
        floating
        hiddenTabs={makeupJourneyEnabled ? undefined : ['journey']}
        onTabPress={handleTabPress}
      />
      {isExtractionSheetVisible ? (
        <DeferredMakeupExtractionActionSheet
          isVisible
          onClose={closeExtractionSheet}
          onPressCamera={() => startMakeupExtraction('camera')}
          onPressUpload={() => startMakeupExtraction('gallery')}
        />
      ) : null}
      {isFeedbackSheetVisible ? (
        <DeferredMakeupFeedbackActionSheet
          isVisible
          onClose={closeFeedbackSheet}
          onPressCamera={() => startMakeupFeedback('camera')}
          onPressUpload={() => startMakeupFeedback('gallery')}
        />
      ) : null}
    </YStack>
  );
}

const styles = StyleSheet.create({
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
