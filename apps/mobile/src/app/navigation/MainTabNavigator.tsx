import React, {useCallback, useState} from 'react';
import {Modal, Pressable, StyleSheet} from 'react-native';
import {createBottomTabNavigator, type BottomTabBarProps} from '@react-navigation/bottom-tabs';
import type {NavigationProp} from '@react-navigation/native';
import {ArrowRight, Camera, ImagePlus} from 'lucide-react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {Text, View, YStack} from 'tamagui';

import {colors, iconSize, radius, shadows, spacing, typography} from '../../shared/theme';
import {AppFooter, type FooterTabKey} from '../../shared/ui';
import {APP_FOOTER_FLOATING_HOST_BASE_HEIGHT} from '../../shared/ui/AppFooter';
import {useNavigationFlowState} from './flowState';
import {getMainTabFooterState, getRootRouteForFooterTab} from './mainTabChrome';
import type {MainTabParamList, MainTabRouteName, RootStackParamList} from './routeTypes';
import {HomeRouteScreen} from './routes/homeRoutes';
import {ProfileRouteScreen} from './routes/profileRoutes';
import {CustomRouteScreen} from './routes/recommendationRoutes';

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
  const [isFeedbackSheetVisible, setIsFeedbackSheetVisible] = useState(false);
  const activeRouteName = state.routes[state.index]?.name as MainTabRouteName | undefined;
  const activeTab = activeRouteName ? getMainTabFooterState(activeRouteName) : undefined;
  const {
    setMakeupFeedbackResult,
    setSelectedMakeupFeedbackPhoto,
  } = useNavigationFlowState();
  const rootNavigation = navigation.getParent<NavigationProp<RootStackParamList>>();

  const closeFeedbackSheet = useCallback(() => {
    setIsFeedbackSheetVisible(false);
  }, []);

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
      if (tab === 'custom') {
        setIsFeedbackSheetVisible(true);
        return;
      }

      const targetRoute = getRootRouteForFooterTab(tab);

      if (targetRoute === 'ARFilter' || targetRoute === 'UnityMakeupCapture') {
        rootNavigation?.navigate(targetRoute);
        return;
      }

      navigation.navigate(targetRoute);
    },
    [navigation, rootNavigation],
  );

  return (
    <YStack
      pointerEvents="box-none"
      style={[
        styles.tabBarHost,
        {
          height: APP_FOOTER_FLOATING_HOST_BASE_HEIGHT + Math.max(insets.bottom, spacing.md),
        },
      ]}>
      <AppFooter
        activeTab={isFeedbackSheetVisible ? 'custom' : activeTab}
        bottomInset={insets.bottom}
        floating
        onTabPress={handleTabPress}
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

const makeupFeedbackSheetActions = [
  {
    id: 'camera',
    label: '카메라 촬영',
    description: '지금 메이크업 상태를 촬영해서 피드백받아요.',
    accessibilityLabel: '카메라 촬영으로 메이크업 피드백 시작',
    icon: (color: string) => <Camera color={color} size={iconSize.md} strokeWidth={1.9} />,
  },
  {
    id: 'upload',
    label: '사진 업로드',
    description: '앨범 속 사진으로 메이크업 균형을 확인해요.',
    accessibilityLabel: '사진 업로드로 메이크업 피드백 시작',
    icon: (color: string) => <ImagePlus color={color} size={iconSize.md} strokeWidth={1.9} />,
  },
] as const;

function MakeupFeedbackActionSheet({
  isVisible,
  onClose,
  onPressCamera,
  onPressUpload,
}: {
  isVisible: boolean;
  onClose: () => void;
  onPressCamera: () => void;
  onPressUpload: () => void;
}) {
  const actionHandlers = {
    camera: onPressCamera,
    upload: onPressUpload,
  } as const;

  return (
    <Modal
      animationType="fade"
      onRequestClose={onClose}
      transparent
      visible={isVisible}>
      <Pressable
        accessibilityLabel="메이크업 피드백 선택 닫기"
        accessibilityRole="button"
        onPress={onClose}
        style={styles.sheetBackdrop}>
        <Pressable
          accessibilityRole="menu"
          onPress={event => event.stopPropagation()}
          style={styles.actionSheet}>
          <View style={styles.sheetHandle} />
          <YStack style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>메이크업 피드백</Text>
            <Text style={styles.sheetDescription}>
              카메라 촬영 또는 사진 업로드로 오늘의 메이크업을 점검해요.
            </Text>
          </YStack>

          <YStack style={styles.sheetActionList}>
            {makeupFeedbackSheetActions.map(action => (
              <Pressable
                accessibilityLabel={action.accessibilityLabel}
                accessibilityRole="menuitem"
                key={action.id}
                onPress={actionHandlers[action.id]}
                style={({pressed}) => [
                  styles.sheetActionButton,
                  pressed && styles.pressed,
                ]}>
                <View style={styles.sheetActionIcon}>
                  {action.icon(colors.textPrimary)}
                </View>
                <YStack style={styles.sheetActionCopy}>
                  <Text style={styles.sheetActionTitle}>{action.label}</Text>
                  <Text style={styles.sheetActionDescription}>
                    {action.description}
                  </Text>
                </YStack>
                <ArrowRight
                  color={colors.textPrimary}
                  size={iconSize.sm}
                  strokeWidth={2}
                />
              </Pressable>
            ))}
          </YStack>

          <Pressable
            accessibilityLabel="메이크업 피드백 선택 취소"
            accessibilityRole="button"
            onPress={onClose}
            style={({pressed}) => [styles.sheetCancelButton, pressed && styles.pressed]}>
            <Text style={styles.sheetCancelText}>취소</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  actionSheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    gap: spacing.lg,
    paddingBottom: spacing.xxl,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    shadowColor: shadows.soft.shadowColor,
    shadowOffset: {width: 0, height: -8},
    shadowOpacity: 0.14,
    shadowRadius: 24,
  },
  pressed: {
    opacity: 0.78,
  },
  sheetActionButton: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.lg,
  },
  sheetActionCopy: {
    flex: 1,
    gap: spacing.xs,
    minWidth: 0,
  },
  sheetActionDescription: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.xs,
  },
  sheetActionIcon: {
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.pill,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  sheetActionList: {
    gap: spacing.md,
  },
  sheetActionTitle: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.md,
  },
  sheetBackdrop: {
    backgroundColor: 'rgba(0, 0, 0, 0.34)',
    bottom: 0,
    justifyContent: 'flex-end',
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  sheetCancelButton: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 48,
  },
  sheetCancelText: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.sm,
  },
  sheetDescription: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.sm,
  },
  sheetHandle: {
    alignSelf: 'center',
    backgroundColor: colors.borderStrong,
    borderRadius: radius.pill,
    height: 4,
    width: 42,
  },
  sheetHeader: {
    gap: spacing.xs,
  },
  sheetTitle: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.lg,
  },
  tabBarHost: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
  },
});
