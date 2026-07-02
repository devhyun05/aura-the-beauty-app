import React, {useCallback, useState} from 'react';
import {Modal, Pressable, StyleSheet} from 'react-native';
import {createBottomTabNavigator, type BottomTabBarProps} from '@react-navigation/bottom-tabs';
import type {NavigationProp} from '@react-navigation/native';
import {Camera, ChevronRight, ImagePlus, Sparkles, X} from 'lucide-react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {Button, Text, View, XStack, YStack} from 'tamagui';

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
  const [isFeedbackSheetVisible, setFeedbackSheetVisible] = useState(false);
  const rootNavigation = navigation.getParent<NavigationProp<RootStackParamList>>();
  const {
    setMakeupFeedbackResult,
    setSelectedMakeupFeedbackPhoto,
  } = useNavigationFlowState();
  const activeRouteName = state.routes[state.index]?.name as MainTabRouteName | undefined;
  const activeTab = activeRouteName ? getMainTabFooterState(activeRouteName) : undefined;

  const closeFeedbackSheet = useCallback(() => {
    setFeedbackSheetVisible(false);
  }, []);

  const startMakeupFeedback = useCallback((photoSource: 'camera' | 'gallery') => {
    setMakeupFeedbackResult(null);
    setSelectedMakeupFeedbackPhoto({photoSource});
    setFeedbackSheetVisible(false);

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
        setFeedbackSheetVisible(true);
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
    <>
      <YStack
        pointerEvents="box-none"
        style={[
          styles.tabBarHost,
          {
            height: APP_FOOTER_FLOATING_HOST_BASE_HEIGHT + Math.max(insets.bottom, spacing.md),
          },
        ]}>
        <AppFooter
          activeTab={activeTab}
          bottomInset={insets.bottom}
          floating
          onTabPress={handleTabPress}
        />
      </YStack>
      <AiFeedbackActionSheet
        bottomInset={insets.bottom}
        visible={isFeedbackSheetVisible}
        onClose={closeFeedbackSheet}
        onPickAlbum={() => startMakeupFeedback('gallery')}
        onPickCamera={() => startMakeupFeedback('camera')}
      />
    </>
  );
}

type AiFeedbackActionSheetProps = {
  bottomInset: number;
  onClose: () => void;
  onPickAlbum: () => void;
  onPickCamera: () => void;
  visible: boolean;
};

type AiFeedbackSheetOptionProps = {
  description: string;
  icon: React.ReactNode;
  onPress: () => void;
  title: string;
};

function AiFeedbackActionSheet({
  bottomInset,
  onClose,
  onPickAlbum,
  onPickCamera,
  visible,
}: AiFeedbackActionSheetProps) {
  return (
    <Modal
      animationType="fade"
      statusBarTranslucent
      transparent
      visible={visible}
      onRequestClose={onClose}>
      <View style={styles.sheetRoot}>
        <Pressable
          accessibilityLabel="AI 피드백 선택 닫기"
          accessibilityRole="button"
          style={styles.sheetBackdrop}
          onPress={onClose}
        />
        <YStack
          accessibilityViewIsModal
          style={[
            styles.sheetPanel,
            {paddingBottom: Math.max(bottomInset, spacing.md) + spacing.md},
          ]}>
          <View style={styles.sheetHandle} />
          <XStack style={styles.sheetHeader}>
            <View style={styles.sheetHeaderIcon}>
              <Sparkles color={colors.white} size={iconSize.md} strokeWidth={2.1} />
            </View>
            <YStack style={styles.sheetHeaderCopy}>
              <Text style={styles.sheetEyebrow}>AI FEEDBACK</Text>
              <Text style={styles.sheetTitle}>피드백 사진 선택</Text>
            </YStack>
            <Button
              unstyled
              accessibilityLabel="AI 피드백 선택 닫기"
              accessibilityRole="button"
              pressStyle={{scale: 0.96}}
              style={styles.sheetCloseButton}
              onPress={onClose}>
              <X color={colors.textSecondary} size={iconSize.sm} strokeWidth={2.2} />
            </Button>
          </XStack>

          <YStack style={styles.sheetOptions}>
            <AiFeedbackSheetOption
              description="지금 메이크업 상태를 바로 촬영"
              icon={<Camera color={colors.textPrimary} size={iconSize.lg} strokeWidth={1.9} />}
              title="카메라로 촬영"
              onPress={onPickCamera}
            />
            <AiFeedbackSheetOption
              description="저장된 사진으로 피드백 받기"
              icon={<ImagePlus color={colors.textPrimary} size={iconSize.lg} strokeWidth={1.9} />}
              title="앨범에서 선택"
              onPress={onPickAlbum}
            />
          </YStack>

          <Button
            unstyled
            accessibilityLabel="AI 피드백 선택 취소"
            accessibilityRole="button"
            pressStyle={{scale: 0.98}}
            style={styles.sheetCancelButton}
            onPress={onClose}>
            <Text style={styles.sheetCancelText}>취소</Text>
          </Button>
        </YStack>
      </View>
    </Modal>
  );
}

function AiFeedbackSheetOption({
  description,
  icon,
  onPress,
  title,
}: AiFeedbackSheetOptionProps) {
  return (
    <Button
      unstyled
      accessibilityLabel={title}
      accessibilityRole="button"
      pressStyle={{scale: 0.985}}
      style={styles.sheetOption}
      onPress={onPress}>
      <XStack style={styles.sheetOptionContent}>
        <View style={styles.sheetOptionIcon}>{icon}</View>
        <YStack style={styles.sheetOptionCopy}>
          <Text style={styles.sheetOptionTitle}>{title}</Text>
          <Text style={styles.sheetOptionDescription}>{description}</Text>
        </YStack>
        <ChevronRight color={colors.textTertiary} size={iconSize.sm} strokeWidth={2.1} />
      </XStack>
    </Button>
  );
}

const styles = StyleSheet.create({
  tabBarHost: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
  },
  sheetBackdrop: {
    backgroundColor: 'rgba(17, 17, 17, 0.28)',
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  sheetCancelButton: {
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.lg,
    height: 52,
    justifyContent: 'center',
    marginTop: spacing.md,
  },
  sheetCancelText: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.md,
  },
  sheetCloseButton: {
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.pill,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  sheetEyebrow: {
    color: colors.successMuted,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.xs,
  },
  sheetHandle: {
    alignSelf: 'center',
    backgroundColor: colors.borderStrong,
    borderRadius: radius.pill,
    height: 4,
    marginBottom: spacing.lg,
    width: 42,
  },
  sheetHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
  },
  sheetHeaderCopy: {
    flex: 1,
    gap: 3,
    minWidth: 0,
  },
  sheetHeaderIcon: {
    alignItems: 'center',
    backgroundColor: colors.textPrimary,
    borderRadius: radius.pill,
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  sheetOption: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    minHeight: 76,
    shadowColor: shadows.soft.shadowColor,
    shadowOffset: shadows.soft.shadowOffset,
    shadowOpacity: 0.08,
    shadowRadius: 16,
  },
  sheetOptionContent: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  sheetOptionCopy: {
    flex: 1,
    gap: 3,
    minWidth: 0,
  },
  sheetOptionDescription: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.sm,
  },
  sheetOptionIcon: {
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: 1,
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  sheetOptions: {
    gap: spacing.sm,
    marginTop: spacing.xl,
  },
  sheetOptionTitle: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.md,
  },
  sheetPanel: {
    backgroundColor: colors.background,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    elevation: 24,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    shadowColor: colors.black,
    shadowOffset: {width: 0, height: -12},
    shadowOpacity: 0.14,
    shadowRadius: 28,
  },
  sheetRoot: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheetTitle: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.lg,
  },
});
