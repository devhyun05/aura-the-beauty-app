import React from 'react';
import {StyleSheet} from 'react-native';
import type {BottomTabScreenProps} from '@react-navigation/bottom-tabs';
import type {CompositeScreenProps, NavigationProp} from '@react-navigation/native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {YStack} from 'tamagui';

import {colors, spacing} from '../../../shared/theme';
import {AppHeader, AppScreen, AuraLogo} from '../../../shared/ui';
import {AppFeatureMenuSheet} from '../AppFeatureMenuSheet';
import type {
  AppFeatureMenuItem,
  AppFeatureMenuRootRouteName,
} from '../appFeatureMenu';
import {getMainHeaderCopy} from '../mainTabChrome';
import type {
  ARFilterBackRouteName,
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
  navigation: BottomTabScreenProps<MainTabParamList>['navigation'];
  routeName: MainTabRouteName;
  wrapContentInScreen?: boolean;
};

export function navigateMainTab(
  navigation: RootNavigation,
  screen: MainTabRouteName = 'HomeTab',
) {
  navigation.navigate('MainTabs', {screen});
}

export function navigateARBack(navigation: RootNavigation, backRoute?: ARFilterBackRouteName) {
  if (backRoute === 'FaceAnalysisReportDetail') {
    navigation.navigate('FaceAnalysisReportDetail');
    return;
  }

  navigation.navigate('ARFilter');
}

export function getMainTabHeaderBorderWidth(
  routeName: MainTabRouteName,
): 0 | undefined {
  return routeName === 'HomeTab' ||
    routeName === 'CommunityTab' ||
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

  if (routeName === 'ProductRecommendation') {
    navigation.navigate('ProductRecommendation');
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

  if (routeName === 'FloatingActionSettings') {
    navigation.navigate('FloatingActionSettings');
    return;
  }

  if (routeName === 'ProfileEdit') {
    navigation.navigate('ProfileEdit');
    return;
  }

  navigation.navigate('AppSettings');
}

export function MainTabChrome({
  children,
  navigation,
  routeName,
  wrapContentInScreen = true,
}: MainTabChromeProps) {
  const insets = useSafeAreaInsets();
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
    [navigation],
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
          containerProps={{
            style: [
              styles.overlayHeader,
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
  screen: {
    backgroundColor: colors.background,
    flex: 1,
    position: 'relative',
  },
});
