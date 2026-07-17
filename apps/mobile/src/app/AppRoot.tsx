import React, {type ReactNode, useCallback, useEffect, useRef, useState} from 'react';
import {InteractionManager, StyleSheet, View} from 'react-native';
import {
  NavigationContainer,
  useNavigationContainerRef,
} from '@react-navigation/native';
import {useFonts} from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import {StatusBar} from 'expo-status-bar';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {TamaguiProvider} from 'tamagui';

import {tamaguiConfig} from '../../tamagui.config';
import {NavigationFlowStateProvider} from '../app/navigation/flowState';
import {AuthSessionProvider, useAuthSession} from '../features/auth';
import {navigationLinking} from '../app/navigation/linkingConfig';
import {
  getStatusBarStyleForNavigationState,
  type NavigationRouteState,
} from '../app/navigation/navigationState';
import {RootNavigator} from '../app/navigation/RootNavigator';
import type {RootStackParamList} from '../app/navigation/routeTypes';
import {prepareUnityMakeupRuntime} from '../features/ar/services/unityMakeupBridge';
import {IncomingConsultingCallGate} from '../features/consulting/components/IncomingConsultingCallGate';
import {prefetchHomeHeroImages} from '../features/home/config/homeHeroAssets';
import {
  NotificationCoordinator,
  navigateToAppNotification,
  shouldSuppressRealtimeAppNotification,
  type AppNotification,
  type AppNotificationData,
} from '../features/notifications';
import {
  recordFeaturePerformanceMarker,
  recordFeaturePerformanceRoute,
  startFeaturePerformanceLogging,
} from '../shared/performance/featurePerformanceLogger';
import {typography} from '../shared/theme';

const UNITY_PRELOAD_DELAY_AFTER_FIRST_RENDER_MS = 5000;
const STARTUP_SCREEN_MIN_DURATION_MS = 700;

type StartupGateProps = {
  children: ReactNode;
  fontsLoaded: boolean;
  hasMinimumElapsed: boolean;
  navigationReady: boolean;
};

function StartupGate({
  children,
  fontsLoaded,
  hasMinimumElapsed,
  navigationReady,
}: StartupGateProps) {
  const {isRestoringSession} = useAuthSession();
  const shouldShowStartupScreen =
    !hasMinimumElapsed || !fontsLoaded || isRestoringSession || !navigationReady;

  useEffect(() => {
    if (shouldShowStartupScreen) {
      return;
    }

    const frame = requestAnimationFrame(() => {
      void SplashScreen.hideAsync().catch(() => undefined);
    });

    return () => cancelAnimationFrame(frame);
  }, [shouldShowStartupScreen]);

  return (
    <View style={styles.appLayer}>
      {children}
    </View>
  );
}

export function AppRoot() {
  const navigationRef = useNavigationContainerRef<RootStackParamList>();
  const pendingNotificationRef = useRef<AppNotificationData | null>(null);
  const [statusBarStyle, setStatusBarStyle] = useState<'dark' | 'light'>('dark');
  const [hasStartupMinimumElapsed, setHasStartupMinimumElapsed] = useState(false);
  const [isNavigationReady, setIsNavigationReady] = useState(false);
  const [fontsLoaded] = useFonts({
    [typography.fontFamily.brand]: require('../assets/fonts/NixieOne-Regular.ttf'),
    [typography.fontFamily.regular]: require('../assets/fonts/Pretendard-Regular.otf'),
    [typography.fontFamily.medium]: require('../assets/fonts/Pretendard-Medium.otf'),
    [typography.fontFamily.semibold]: require('../assets/fonts/Pretendard-SemiBold.otf'),
    [typography.fontFamily.bold]: require('../assets/fonts/Pretendard-Bold.otf'),
    // AURADIN 히어로 세리프 (features/recommendation DS 전용 — auradinTokens.auType.serif)
    Lora: require('../assets/fonts/Lora-Regular.ttf'),
  });

  const syncStatusBarStyle = useCallback(
    (state: NavigationRouteState | undefined) => {
      setStatusBarStyle(getStatusBarStyleForNavigationState(state));
    },
    [],
  );
  const shouldSuppressRealtimeNotification = useCallback(
    (notification: AppNotification) =>
      shouldSuppressRealtimeAppNotification(
        navigationRef.isReady() ? navigationRef.getCurrentRoute() : undefined,
        notification,
      ),
    [navigationRef],
  );
  const flushPendingNotification = useCallback(() => {
    if (!pendingNotificationRef.current || !navigationRef.isReady()) {
      return;
    }

    const currentRoute = navigationRef.getCurrentRoute();
    if (
      !currentRoute ||
      currentRoute.name === 'Login' ||
      currentRoute.name === 'ProfileSetup'
    ) {
      return;
    }

    const pendingNotification = pendingNotificationRef.current;
    pendingNotificationRef.current = null;
    navigateToAppNotification(navigationRef, pendingNotification);
  }, [navigationRef]);
  const handleOpenNotification = useCallback(
    (data: AppNotificationData) => {
      pendingNotificationRef.current = data;
      flushPendingNotification();
    },
    [flushPendingNotification],
  );

  useEffect(() => {
    prefetchHomeHeroImages();
  }, []);

  useEffect(() => startFeaturePerformanceLogging(), []);

  useEffect(() => {
    const minimumTimer = setTimeout(
      () => setHasStartupMinimumElapsed(true),
      STARTUP_SCREEN_MIN_DURATION_MS,
    );

    return () => {
      clearTimeout(minimumTimer);
    };
  }, []);

  useEffect(() => {
    if (!fontsLoaded) {
      return undefined;
    }

    let preloadTimer: ReturnType<typeof setTimeout> | undefined;

    const preloadAfterInitialRender = InteractionManager.runAfterInteractions(() => {
      preloadTimer = setTimeout(() => {
        // Full offscreen boot at app start (not just the dylib load): this runs
        // Unity runEmbeddedWithArgc while concealed so the scene loads, the
        // Unity splash plays offscreen, and the first AR frame is produced
        // BEFORE the user ever enters the AR screen. Entry then reveals an
        // already-live scene instead of a splash/black loading flash.
        recordFeaturePerformanceMarker('unity-preload-start');
        const started = prepareUnityMakeupRuntime();
        recordFeaturePerformanceMarker('unity-preload-dispatched', {started});
      }, UNITY_PRELOAD_DELAY_AFTER_FIRST_RENDER_MS);
    });

    return () => {
      preloadAfterInitialRender.cancel();
      if (preloadTimer) {
        clearTimeout(preloadTimer);
      }
    };
  }, [fontsLoaded]);

  return (
    <TamaguiProvider config={tamaguiConfig} defaultTheme="light">
      <SafeAreaProvider>
        <StatusBar style={statusBarStyle} />
        <AuthSessionProvider>
          <StartupGate
            fontsLoaded={fontsLoaded}
            hasMinimumElapsed={hasStartupMinimumElapsed}
            navigationReady={isNavigationReady}>
            <NavigationFlowStateProvider>
            <NavigationContainer
              linking={navigationLinking}
              ref={navigationRef}
              onReady={() => {
                syncStatusBarStyle(navigationRef.getRootState());
                recordFeaturePerformanceRoute(navigationRef.getCurrentRoute()?.name);
                requestAnimationFrame(() => setIsNavigationReady(true));
                requestAnimationFrame(flushPendingNotification);
              }}
              onStateChange={state => {
                syncStatusBarStyle(state);
                recordFeaturePerformanceRoute(navigationRef.getCurrentRoute()?.name);
                requestAnimationFrame(flushPendingNotification);
              }}>
              <RootNavigator />
              <NotificationCoordinator
                onOpenNotification={handleOpenNotification}
                shouldSuppressRealtimeNotification={
                  shouldSuppressRealtimeNotification
                }
              />
              <IncomingConsultingCallGate
                onAnswer={record => {
                  if (!navigationRef.isReady()) return;
                  navigationRef.navigate('ConsultingCall', {
                    bookingId: record.id,
                    durationId: record.durationId ?? 'd30',
                    expertId: record.expertId,
                  });
                }}
              />
            </NavigationContainer>
            </NavigationFlowStateProvider>
          </StartupGate>
        </AuthSessionProvider>
      </SafeAreaProvider>
    </TamaguiProvider>
  );
}

const styles = StyleSheet.create({
  appLayer: {
    flex: 1,
  },
});
