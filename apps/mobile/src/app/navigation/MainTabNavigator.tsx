import React, {useCallback} from 'react';
import {StyleSheet} from 'react-native';
import {createBottomTabNavigator, type BottomTabBarProps} from '@react-navigation/bottom-tabs';
import type {NavigationProp} from '@react-navigation/native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {YStack} from 'tamagui';

import {spacing} from '../../shared/theme';
import {AppFooter, type FooterTabKey} from '../../shared/ui';
import type {MainTabParamList, MainTabRouteName, RootStackParamList} from './routeTypes';
import {HomeRouteScreen} from './routes/homeRoutes';
import {ProfileRouteScreen} from './routes/profileRoutes';
import {CustomRouteScreen} from './routes/recommendationRoutes';
import {getMainTabFooterState, getRootRouteForFooterTab} from './mainTabChrome';

const Tab = createBottomTabNavigator<MainTabParamList>();

export function MainTabNavigator() {
  return (
    <Tab.Navigator
      initialRouteName="HomeTab"
      screenOptions={{headerShown: false}}
      tabBar={props => <MainTabBar {...props} />}>
      <Tab.Screen name="HomeTab" component={HomeRouteScreen} />
      <Tab.Screen name="CustomTab" component={CustomRouteScreen} />
      <Tab.Screen name="ProfileTab" component={ProfileRouteScreen} />
    </Tab.Navigator>
  );
}

function MainTabBar({navigation, state}: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const activeRouteName = state.routes[state.index]?.name as MainTabRouteName | undefined;
  const activeTab = activeRouteName ? getMainTabFooterState(activeRouteName) : undefined;

  const handleTabPress = useCallback(
    (tab: FooterTabKey) => {
      const targetRoute = getRootRouteForFooterTab(tab);

      if (targetRoute === 'ARFilter') {
        navigation
          .getParent<NavigationProp<RootStackParamList>>()
          ?.navigate(targetRoute);
        return;
      }

      navigation.navigate(targetRoute);
    },
    [navigation],
  );

  return (
    <YStack
      pointerEvents="box-none"
      style={[
        styles.tabBarHost,
        {
          height: 76 + Math.max(insets.bottom, spacing.md),
        },
      ]}>
      <AppFooter
        activeTab={activeTab}
        bottomInset={insets.bottom}
        floating
        onTabPress={handleTabPress}
      />
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
});
