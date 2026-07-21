import React from 'react';
import {StyleSheet} from 'react-native';
import type {BottomTabScreenProps} from '@react-navigation/bottom-tabs';
import {
  StackActions,
  type CompositeScreenProps,
  type NavigationProp,
} from '@react-navigation/native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {YStack} from 'tamagui';

import {colors, spacing} from '../../../shared/theme';
import {AppHeader, AppScreen, AuraLogo} from '../../../shared/ui';
import {isIsoDateString} from '../../../features/makeup-journey/utils/date';
import {AppFeatureMenuSheet} from '../AppFeatureMenuSheet';
import {useNavigationFlowState} from '../flowState';
import type {
  AppFeatureMenuItem,
  AppFeatureMenuRootRouteName,
} from '../appFeatureMenu';
import {getMainHeaderCopy} from '../mainTabChrome';
import type {
  MainTabParamList,
  MainTabRouteName,
  RootStackParamList,
} from '../routeTypes';

export type RootScreenProps<RouteName extends keyof RootStackParamList> =
  NativeStackScreenProps<RootStackParamList, RouteName>;

export type MainTabScreenProps<RouteName extends keyof MainTabParamList> =
  CompositeScreenProps<
    BottomTabScreenProps<MainTabParamList, RouteName>,
    NativeStackScreenProps<RootStackParamList>
  >;

export type RootNavigation = NavigationProp<RootStackParamList>;

export type MainTabChromeRenderContext = {
  openFeatureMenu: () => void;
};

type MainTabChromeProps = {
  children:
    | React.ReactNode
    | ((context: MainTabChromeRenderContext) => React.ReactNode);
  headerRightSlot?: React.ReactNode;
  navigation: BottomTabScreenProps<MainTabParamList>['navigation'];
  routeName: MainTabRouteName;
  wrapContentInScreen?: boolean;
};

export function getMainTabResetState(
  screen: MainTabRouteName = 'HomeTab',
) {
  return {
    index: 0,
    routes: [
      {
        name: 'MainTabs' as const,
        params: {screen},
      },
    ],
  };
}

export function navigateMainTab(
  navigation: RootNavigation,
  screen: MainTabRouteName = 'HomeTab',
) {
  navigation.reset(getMainTabResetState(screen));
}

export function goBackToPreviousOrMainTab(
  navigation: RootNavigation,
  fallbackScreen: MainTabRouteName,
) {
  if (goBackToPreviousRoute(navigation)) {
    return;
  }

  navigateMainTab(navigation, fallbackScreen);
}

function canPopRootStack(navigation: RootNavigation): boolean {
  try {
    const state = navigation.getState();
    return typeof state.index === 'number' && state.index > 0;
  } catch {
    return false;
  }
}

export function goBackToPreviousRoute(navigation: RootNavigation): boolean {
  if (canPopRootStack(navigation)) {
    navigation.dispatch(StackActions.pop(1));
    return true;
  }

  if (navigation.canGoBack()) {
    navigation.goBack();
    return true;
  }

  return false;
}

export function getConsultingHistoryBackAction(
  returnTo?: NonNullable<RootStackParamList['ConsultingHistory']>['returnTo'],
  canGoBack = true,
):
  | {kind: 'goBack'}
  | {kind: 'mainTab'; screen: MainTabRouteName} {
  if (canGoBack) {
    return {kind: 'goBack'};
  }

  return {
    kind: 'mainTab',
    screen: returnTo === 'profile' ? 'ProfileTab' : 'ConsultingTab',
  };
}

export function getMakeupJourneyTabResetState(month?: string) {
  const makeupJourneyTabParams = month
    ? {
        screen: 'MakeupJourneyTab' as const,
        params: {month},
      }
    : {screen: 'MakeupJourneyTab' as const};

  return {
    index: 0,
    routes: [
      {
        name: 'MainTabs' as const,
        params: makeupJourneyTabParams,
      },
    ],
  };
}

export function getHomeTabResetState() {
  return getMainTabResetState('HomeTab');
}

export function getMakeupJourneyDayResetState(
  entryDate: string,
  initialReportId?: string,
) {
  return {
    index: 1,
    routes: [
      ...getMakeupJourneyTabResetState(entryDate.slice(0, 7)).routes,
      {
        name: 'MakeupJourneyDayDetail' as const,
        params: initialReportId
          ? {entryDate, initialReportId}
          : {entryDate},
      },
    ],
  };
}

export function getMakeupJourneySafeReturnResetState(
  entryDate: unknown,
  initialReportId?: string,
) {
  return typeof entryDate === 'string' && isIsoDateString(entryDate)
    ? getMakeupJourneyDayResetState(entryDate, initialReportId)
    : getMakeupJourneyTabResetState();
}

export function getMainTabHeaderBorderWidth(
  routeName: MainTabRouteName,
): 0 | undefined {
  return routeName === 'HomeTab' ||
    routeName === 'ConsultingTab' ||
    routeName === 'MakeupJourneyTab' ||
    routeName === 'ProfileTab'
    ? 0
    : undefined;
}

function navigateAppFeatureRootRoute(
  navigation: RootNavigation,
  routeName: AppFeatureMenuRootRouteName,
) {
  if (routeName === 'ARFilter') {
    navigation.navigate('ARFilter');
    return;
  }

  if (routeName === 'ReferenceMakeupExtractionUpload') {
    navigation.navigate('ReferenceMakeupExtractionUpload');
    return;
  }

  if (routeName === 'MakeupFeedbackAlbumUpload') {
    navigation.navigate('MakeupFeedbackAlbumUpload');
    return;
  }

  if (routeName === 'FaceAnalysisIntro') {
    navigation.navigate('FaceAnalysisIntro');
    return;
  }

  if (routeName === 'HomeFilterStore') {
    navigation.navigate('HomeFilterStore');
    return;
  }

  if (routeName === 'Consulting') {
    navigation.navigate('Consulting');
    return;
  }

  if (routeName === 'Community') {
    navigation.navigate('Community');
    return;
  }

  if (routeName === 'ProductRecommendation') {
    navigation.navigate('ProductRecommendation');
    return;
  }

  if (routeName === 'MakeupRecommendation') {
    navigation.navigate('MakeupRecommendation');
    return;
  }

  if (routeName === 'SavedMakeupList') {
    navigation.navigate('SavedMakeupList');
    return;
  }

  if (routeName === 'MakeupLookList') {
    navigation.navigate('MakeupLookList');
    return;
  }

  if (routeName === 'LikedProductList') {
    navigation.navigate('LikedProductList');
    return;
  }

  navigation.navigate('AppSettings');
}

export function MainTabChrome({
  children,
  headerRightSlot,
  navigation,
  routeName,
  wrapContentInScreen = true,
}: MainTabChromeProps) {
  const insets = useSafeAreaInsets();
  const {
    beginMakeupFeedbackFlow,
    setMakeupFeedbackResult,
    setSelectedMakeupFeedbackPhoto,
  } = useNavigationFlowState();
  const [isFeatureMenuVisible, setIsFeatureMenuVisible] = React.useState(false);
  const headerCopy = getMainHeaderCopy(routeName);
  const isHomeTab = routeName === 'HomeTab';
  const contentGap = routeName === 'HomeTab' ? spacing.xxl : spacing.xl;
  const headerBorderWidth = getMainTabHeaderBorderWidth(routeName);
  const handleOpenFeatureMenu = React.useCallback(() => {
    setIsFeatureMenuVisible(true);
  }, []);
  const handleCloseFeatureMenu = React.useCallback(() => {
    setIsFeatureMenuVisible(false);
  }, []);
  const handleSelectFeatureMenuItem = React.useCallback(
    (item: AppFeatureMenuItem) => {
      setIsFeatureMenuVisible(false);

      if (
        item.target.kind === 'root' &&
        item.target.routeName === 'MakeupFeedbackAlbumUpload'
      ) {
        beginMakeupFeedbackFlow();
        setMakeupFeedbackResult(null);
        setSelectedMakeupFeedbackPhoto({photoSource: 'gallery'});
      }

      requestAnimationFrame(() => {
        if (item.target.kind === 'mainTab') {
          navigation.navigate(item.target.routeName);
          return;
        }

        const rootNavigation = navigation.getParent<RootNavigation>();

        if (rootNavigation) {
          navigateAppFeatureRootRoute(rootNavigation, item.target.routeName);
        }
      });
    },
    [
      beginMakeupFeedbackFlow,
      navigation,
      setMakeupFeedbackResult,
      setSelectedMakeupFeedbackPhoto,
    ],
  );
  const renderedChildren = typeof children === 'function'
    ? children({openFeatureMenu: handleOpenFeatureMenu})
    : children;

  return (
    <YStack style={styles.screen}>
      {isHomeTab ? null : (
        <AppHeader
          showTitle={headerCopy.showTitle}
          subtitle={headerCopy.subtitle}
          title={headerCopy.title}
          titleSlot={headerCopy.usesBrandLogo ? <AuraLogo variant="header" /> : undefined}
          topInset={insets.top}
          rightSlot={headerRightSlot}
          containerProps={{
            style: [
              styles.overlayHeader,
              routeName === 'ProfileTab' ? styles.profileHeader : null,
              headerBorderWidth === undefined
                ? null
                : {borderBottomWidth: headerBorderWidth},
            ],
          }}
          onProfilePress={handleOpenFeatureMenu}
        />
      )}
      <YStack style={styles.body}>
        {wrapContentInScreen ? (
          <AppScreen
            bottomPadding="floatingFooter"
            contentGap={contentGap}
            topPadding="belowOverlayHeader">
            {renderedChildren}
          </AppScreen>
        ) : (
          <YStack style={styles.customBody}>
            {renderedChildren}
          </YStack>
        )}
      </YStack>
      <AppFeatureMenuSheet
        isVisible={isFeatureMenuVisible}
        onClose={handleCloseFeatureMenu}
        onSelectItem={handleSelectFeatureMenuItem}
      />
    </YStack>
  );
}

const styles = StyleSheet.create({
  body: {
    flex: 1,
  },
  customBody: {
    flex: 1,
  },
  overlayHeader: {
    elevation: 30,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
    zIndex: 30,
  },
  profileHeader: {
    paddingHorizontal: spacing.screenX,
  },
  screen: {
    backgroundColor: colors.background,
    flex: 1,
    position: 'relative',
  },
});
