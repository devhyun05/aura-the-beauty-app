import React, {type ReactNode, useCallback, useEffect, useRef, useState} from 'react';
import {InteractionManager, Pressable, StyleSheet, Text, View} from 'react-native';
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
import {
  AuthSessionProvider,
  useAuthSession,
} from '../features/auth/services/authSessionContext';
import {navigationLinking} from '../app/navigation/linkingConfig';
import {
  getStatusBarStyleForNavigationState,
  type NavigationRouteState,
} from '../app/navigation/navigationState';
import {RootNavigator} from '../app/navigation/RootNavigator';
import type {RootStackParamList} from '../app/navigation/routeTypes';
import type {ConsultingRecord} from '../features/consulting/types';
import {prefetchHomeHeroImages} from '../features/home/config/homeHeroAssets';
import {AiDataConsentProvider} from '../features/legal/services/aiDataConsentContext';
import {
  navigateToAppNotification,
  shouldSuppressRealtimeAppNotification,
} from '../features/notifications/services/notificationNavigation';
import type {
  AppNotification,
  AppNotificationData,
} from '../features/notifications/types';
import {
  recordFeaturePerformanceRoute,
  startFeaturePerformanceLogging,
} from '../shared/performance/featurePerformanceLogger';
import {colors, typography} from '../shared/theme';
import {
  makeupJourneyBackendAnalyticsAdapter,
  setMakeupJourneyAnalyticsAdapter,
} from '../shared/services/makeupJourneyAnalytics';

setMakeupJourneyAnalyticsAdapter(makeupJourneyBackendAnalyticsAdapter);

const HOME_HERO_PREFETCH_DELAY_AFTER_STARTUP_MS = 750;
const DEFERRED_APP_SERVICES_DELAY_AFTER_STARTUP_MS = 1200;
const STARTUP_SCREEN_MIN_DURATION_MS = 360;

type DeferredAppServicesProps = {
  onAnswerConsultingCall: (record: ConsultingRecord) => void;
  onOpenNotification: (data: AppNotificationData) => void;
  shouldSuppressRealtimeNotification: (notification: AppNotification) => boolean;
};

function DeferredAppServices({
  onAnswerConsultingCall,
  onOpenNotification,
  shouldSuppressRealtimeNotification,
}: DeferredAppServicesProps) {
  const {NotificationCoordinator} = require(
    '../features/notifications/components/NotificationCoordinator'
  ) as typeof import('../features/notifications/components/NotificationCoordinator');
  const {IncomingConsultingCallGate} = require(
    '../features/consulting/components/IncomingConsultingCallGate'
  ) as typeof import('../features/consulting/components/IncomingConsultingCallGate');

  return (
    <>
      <NotificationCoordinator
        onOpenNotification={onOpenNotification}
        shouldSuppressRealtimeNotification={shouldSuppressRealtimeNotification}
      />
      <IncomingConsultingCallGate onAnswer={onAnswerConsultingCall} />
    </>
  );
}

type AppErrorBoundaryState = {hasError: boolean};

// release 빌드에는 RedBox가 없어 잡히지 않은 렌더 예외가 곧바로 흰 화면·크래시로
// 이어진다. 최상위에서 받아 복구 UI를 보여주고, 다시 시도 시 트리를 재마운트한다.
class AppErrorBoundary extends React.Component<
  {children: ReactNode},
  AppErrorBoundaryState
> {
  state: AppErrorBoundaryState = {hasError: false};

  static getDerivedStateFromError(): AppErrorBoundaryState {
    return {hasError: true};
  }

  handleRetry = () => {
    this.setState({hasError: false});
  };

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.errorFallback}>
          <Text style={styles.errorFallbackTitle}>화면을 불러오지 못했어요</Text>
          <Text style={styles.errorFallbackBody}>
            일시적인 문제가 발생했어요. 잠시 후 다시 시도해 주세요.
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={this.handleRetry}
            style={styles.errorFallbackButton}>
            <Text style={styles.errorFallbackButtonLabel}>다시 시도</Text>
          </Pressable>
        </View>
      );
    }

    return this.props.children;
  }
}

type StartupGateProps = {
  children: ReactNode;
  fontsLoaded: boolean;
  hasMinimumElapsed: boolean;
  navigationReady: boolean;
  onStartupReady: () => void;
};

function StartupGate({
  children,
  fontsLoaded,
  hasMinimumElapsed,
  navigationReady,
  onStartupReady,
}: StartupGateProps) {
  const {isRestoringSession} = useAuthSession();
  const shouldShowStartupScreen =
    !hasMinimumElapsed || !fontsLoaded || isRestoringSession || !navigationReady;

  useEffect(() => {
    if (shouldShowStartupScreen) {
      return;
    }

    const frame = requestAnimationFrame(() => {
      onStartupReady();
      void SplashScreen.hideAsync().catch(() => undefined);
    });

    return () => cancelAnimationFrame(frame);
  }, [onStartupReady, shouldShowStartupScreen]);

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
  const [isStartupReady, setIsStartupReady] = useState(false);
  const [areDeferredAppServicesReady, setAreDeferredAppServicesReady] =
    useState(false);
  const [fontsLoaded, fontLoadError] = useFonts({
    [typography.fontFamily.brand]: require('../assets/fonts/NixieOne-Regular.ttf'),
    [typography.fontFamily.regular]: require('../assets/fonts/Pretendard-Regular.otf'),
    [typography.fontFamily.medium]: require('../assets/fonts/Pretendard-Medium.otf'),
    [typography.fontFamily.semibold]: require('../assets/fonts/Pretendard-SemiBold.otf'),
    [typography.fontFamily.bold]: require('../assets/fonts/Pretendard-Bold.otf'),
    // AURADIN 히어로 세리프 (features/recommendation DS 전용 — auradinTokens.auType.serif)
    Lora: require('../assets/fonts/Lora-Regular.ttf'),
  });
  const fontsReady = fontsLoaded || Boolean(fontLoadError);
  const handleStartupReady = useCallback(() => {
    setIsStartupReady(true);
  }, []);

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
  const handleAnswerConsultingCall = useCallback((record: ConsultingRecord) => {
    if (!navigationRef.isReady()) {
      return;
    }

    navigationRef.navigate('ConsultingCall', {
      bookingId: record.id,
      durationId: record.durationId ?? 'd30',
      expertId: record.expertId,
    });
  }, [navigationRef]);

  useEffect(() => {
    if (!isStartupReady) {
      return undefined;
    }

    let serviceTimer: ReturnType<typeof setTimeout> | undefined;
    const mountServicesAfterStartup = InteractionManager.runAfterInteractions(() => {
      serviceTimer = setTimeout(
        () => setAreDeferredAppServicesReady(true),
        DEFERRED_APP_SERVICES_DELAY_AFTER_STARTUP_MS,
      );
    });

    return () => {
      mountServicesAfterStartup.cancel();
      if (serviceTimer) {
        clearTimeout(serviceTimer);
      }
    };
  }, [isStartupReady]);

  useEffect(() => {
    if (!isStartupReady) {
      return undefined;
    }

    let prefetchTimer: ReturnType<typeof setTimeout> | undefined;
    const prefetchAfterStartup = InteractionManager.runAfterInteractions(() => {
      prefetchTimer = setTimeout(
        prefetchHomeHeroImages,
        HOME_HERO_PREFETCH_DELAY_AFTER_STARTUP_MS,
      );
    });

    return () => {
      prefetchAfterStartup.cancel();
      if (prefetchTimer) {
        clearTimeout(prefetchTimer);
      }
    };
  }, [isStartupReady]);

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

  return (
    <TamaguiProvider config={tamaguiConfig} defaultTheme="light">
      <SafeAreaProvider>
        <StatusBar style={statusBarStyle} />
        <AppErrorBoundary>
          <AuthSessionProvider>
            <AiDataConsentProvider>
              <StartupGate
                fontsLoaded={fontsReady}
                hasMinimumElapsed={hasStartupMinimumElapsed}
                navigationReady={isNavigationReady}
                onStartupReady={handleStartupReady}>
                <NavigationFlowStateProvider>
                  <NavigationContainer
                    linking={navigationLinking}
                    ref={navigationRef}
                    onReady={() => {
                      syncStatusBarStyle(navigationRef.getRootState());
                      recordFeaturePerformanceRoute(
                        navigationRef.getCurrentRoute()?.name,
                      );
                      requestAnimationFrame(() => setIsNavigationReady(true));
                      requestAnimationFrame(flushPendingNotification);
                    }}
                    onStateChange={state => {
                      syncStatusBarStyle(state);
                      recordFeaturePerformanceRoute(
                        navigationRef.getCurrentRoute()?.name,
                      );
                      requestAnimationFrame(flushPendingNotification);
                    }}>
                    <RootNavigator />
                    {areDeferredAppServicesReady ? (
                      <DeferredAppServices
                        onAnswerConsultingCall={handleAnswerConsultingCall}
                        onOpenNotification={handleOpenNotification}
                        shouldSuppressRealtimeNotification={
                          shouldSuppressRealtimeNotification
                        }
                      />
                    ) : null}
                  </NavigationContainer>
                </NavigationFlowStateProvider>
              </StartupGate>
            </AiDataConsentProvider>
          </AuthSessionProvider>
        </AppErrorBoundary>
      </SafeAreaProvider>
    </TamaguiProvider>
  );
}

const styles = StyleSheet.create({
  appLayer: {
    flex: 1,
  },
  errorFallback: {
    alignItems: 'center',
    backgroundColor: colors.white,
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  errorFallbackBody: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.regular,
    fontSize: 14,
    lineHeight: 21,
    marginTop: 8,
    textAlign: 'center',
  },
  errorFallbackButton: {
    backgroundColor: colors.textPrimary,
    borderRadius: 12,
    marginTop: 24,
    paddingHorizontal: 28,
    paddingVertical: 12,
  },
  errorFallbackButtonLabel: {
    color: colors.white,
    fontFamily: typography.fontFamily.semibold,
    fontSize: 15,
  },
  errorFallbackTitle: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.semibold,
    fontSize: 18,
  },
});
