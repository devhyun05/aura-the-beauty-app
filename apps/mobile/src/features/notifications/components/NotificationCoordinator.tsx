import {useCallback, useEffect, useRef} from 'react';
import type {NotificationResponse} from 'expo-notifications';
import {AppState} from 'react-native';

import {useAuthSession} from '../../auth';
import {notifyAnalysisReportReady} from '../../../shared/services/analysisReportReadySignal';
import {
  deleteAppNotification,
  getBackgroundReportNotificationsEnabled,
  getExpoNotificationsModule,
  markAppNotificationRead,
  notifyNotificationStateChanged,
  presentRealtimeAppNotification,
  registerForReportNotifications,
} from '../services/notificationService';
import {connectNotificationRealtime} from '../services/notificationRealtimeService';
import {
  normalizeAppNotificationData,
  type AppNotification,
  type AppNotificationData,
} from '../types';


const PUSH_REGISTRATION_REFRESH_INTERVAL_MS = 30_000;
const REALTIME_NOTIFICATION_FALLBACK_DELAY_MS = 2_000;
const MAX_TRACKED_NOTIFICATION_IDS = 100;

type NotificationCoordinatorProps = {
  onOpenNotification: (data: AppNotificationData) => void;
  shouldSuppressRealtimeNotification?: (
    notification: AppNotification,
  ) => boolean;
};

function readNotificationData(
  response: NotificationResponse,
): AppNotificationData {
  return normalizeAppNotificationData(
    response.notification.request.content.data,
  );
}

export function NotificationCoordinator({
  onOpenNotification,
  shouldSuppressRealtimeNotification,
}: NotificationCoordinatorProps) {
  const {getAuthToken, isRestoringSession, session} = useAuthSession();
  const sessionUserId = session?.user.id;
  const pendingResponseRef = useRef<NotificationResponse | null>(null);
  const handledResponseIds = useRef(new Set<string>());
  const realtimeNotificationIds = useRef(new Set<string>());
  const remoteNotificationIds = useRef(new Set<string>());
  const realtimeFallbackNotificationIds = useRef(new Set<string>());
  const realtimeFallbackTimers = useRef(
    new Map<string, ReturnType<typeof setTimeout>>(),
  );
  const lastPushRegistrationAt = useRef(0);

  const rememberNotificationId = useCallback(
    (ids: Set<string>, notificationId: string) => {
      ids.add(notificationId);
      if (ids.size <= MAX_TRACKED_NOTIFICATION_IDS) {
        return;
      }
      const oldestId = ids.values().next().value;
      if (oldestId) {
        ids.delete(oldestId);
      }
    },
    [],
  );

  const clearRealtimeFallback = useCallback((notificationId: string) => {
    const timer = realtimeFallbackTimers.current.get(notificationId);
    if (timer) {
      clearTimeout(timer);
      realtimeFallbackTimers.current.delete(notificationId);
    }
  }, []);

  const registerCurrentPushDevice = useCallback(
    async (force = false) => {
      if (isRestoringSession || !sessionUserId) {
        return;
      }
      const now = Date.now();
      if (
        !force &&
        now - lastPushRegistrationAt.current <
          PUSH_REGISTRATION_REFRESH_INTERVAL_MS
      ) {
        return;
      }
      lastPushRegistrationAt.current = now;

      try {
        if (!(await getBackgroundReportNotificationsEnabled())) {
          return;
        }
        const result = await registerForReportNotifications();
        if (result.status === 'project-id-missing') {
          console.info(
            '[aura:notifications] EXPO_PUBLIC_EAS_PROJECT_ID is required for push registration.',
          );
        }
        console.info('[aura:notifications] registration completed', {
          status: result.status,
        });
      } catch (error) {
        lastPushRegistrationAt.current = 0;
        console.info('[aura:notifications] registration skipped', {
          message: error instanceof Error ? error.message : String(error),
        });
      }
    },
    [isRestoringSession, sessionUserId],
  );

  const handleResponse = useCallback(
    (response: NotificationResponse) => {
      const responseId = response.notification.request.identifier;
      if (handledResponseIds.current.has(responseId)) {
        return;
      }

      if (isRestoringSession || !session) {
        pendingResponseRef.current = response;
        return;
      }

      handledResponseIds.current.add(responseId);
      pendingResponseRef.current = null;
      const data = readNotificationData(response);
      onOpenNotification(data);

      if (data.notificationId) {
        void markAppNotificationRead(data.notificationId).catch(() => undefined);
      }
    },
    [isRestoringSession, onOpenNotification, session],
  );

  useEffect(() => {
    if (isRestoringSession || !session) {
      return;
    }

    lastPushRegistrationAt.current = 0;
    void registerCurrentPushDevice(true);

    const appStateSubscription = AppState.addEventListener(
      'change',
      nextState => {
        if (nextState === 'active') {
          void registerCurrentPushDevice();
        }
      },
    );
    return () => appStateSubscription.remove();
  }, [isRestoringSession, registerCurrentPushDevice, sessionUserId]);

  useEffect(() => {
    if (isRestoringSession || !session) {
      return;
    }

    const authToken = getAuthToken();
    if (!authToken) {
      return;
    }

    const client = connectNotificationRealtime({
      authToken,
      onEvent: event => {
        if (event.type !== 'notification.created') {
          return;
        }

        const {notification} = event;

        // 얼굴 분석 완료 이벤트는 대기 중인 폴링 루프를 즉시 깨워 다음 폴을 건너뛰게
        // 한다(감지지연 ≈0). 배너/뱃지 처리와 독립적으로, 중복 가드 이전에 신호.
        // data는 WS에서 정규화 전 형태(snake_case·문자열 가능)라 normalize 후 읽는다.
        if (notification.notificationType === 'analysis_report_completed') {
          const {reportId} = normalizeAppNotificationData(notification.data);
          if (reportId) {
            notifyAnalysisReportReady(reportId);
          }
        }

        if (realtimeNotificationIds.current.has(notification.id)) {
          return;
        }
        rememberNotificationId(realtimeNotificationIds.current, notification.id);
        if (shouldSuppressRealtimeNotification?.(notification)) {
          void deleteAppNotification(notification.id).catch(() =>
            markAppNotificationRead(notification.id).catch(() => undefined),
          );
          return;
        }

        notifyNotificationStateChanged();
        clearRealtimeFallback(notification.id);
        const fallbackTimer = setTimeout(() => {
          realtimeFallbackTimers.current.delete(notification.id);
          if (remoteNotificationIds.current.has(notification.id)) {
            return;
          }
          rememberNotificationId(
            realtimeFallbackNotificationIds.current,
            notification.id,
          );
          void presentRealtimeAppNotification(notification).catch(error => {
            console.info('[aura:notifications] realtime banner skipped', {
              message: error instanceof Error ? error.message : String(error),
            });
          });
        }, REALTIME_NOTIFICATION_FALLBACK_DELAY_MS);
        realtimeFallbackTimers.current.set(notification.id, fallbackTimer);
      },
    });

    return () => client.close();
  }, [
    getAuthToken,
    isRestoringSession,
    clearRealtimeFallback,
    rememberNotificationId,
    session?.user.id,
    shouldSuppressRealtimeNotification,
  ]);

  useEffect(() => {
    let isActive = true;
    let removeReceivedListener: (() => void) | null = null;
    let removeResponseListener: (() => void) | null = null;

    void getExpoNotificationsModule()
      .then(Notifications => {
        if (!isActive || !Notifications) {
          return;
        }

        Notifications.setNotificationHandler({
          handleNotification: async notification => {
            const data = normalizeAppNotificationData(
              notification.request.content.data,
            );
            const isRealtimeFallback =
              data.deliverySource === 'realtime-fallback';
            const remoteDuplicatesRealtimeFallback = Boolean(
              !isRealtimeFallback &&
                data.notificationId &&
                realtimeFallbackNotificationIds.current.has(
                  data.notificationId,
                ),
            );
            return {
              shouldPlaySound: !remoteDuplicatesRealtimeFallback,
              shouldSetBadge: !remoteDuplicatesRealtimeFallback,
              shouldShowBanner: !remoteDuplicatesRealtimeFallback,
              shouldShowList: !remoteDuplicatesRealtimeFallback,
            };
          },
        });

        const receivedSubscription =
          Notifications.addNotificationReceivedListener(notification => {
            const data = normalizeAppNotificationData(
              notification.request.content.data,
            );
            if (
              data.notificationId &&
              data.deliverySource !== 'realtime-fallback'
            ) {
              rememberNotificationId(
                remoteNotificationIds.current,
                data.notificationId,
              );
              clearRealtimeFallback(data.notificationId);
            }
            notifyNotificationStateChanged();
          });
        const responseSubscription =
          Notifications.addNotificationResponseReceivedListener(handleResponse);
        removeReceivedListener = () => receivedSubscription.remove();
        removeResponseListener = () => responseSubscription.remove();

        void Notifications.getLastNotificationResponseAsync().then(response => {
          if (isActive && response) {
            handleResponse(response);
          }
        });
      })
      .catch(error => {
        console.info('[aura:notifications] native listeners skipped', {
          message: error instanceof Error ? error.message : String(error),
        });
      });

    return () => {
      isActive = false;
      removeReceivedListener?.();
      removeResponseListener?.();
    };
  }, [clearRealtimeFallback, handleResponse, rememberNotificationId, session]);

  useEffect(
    () => () => {
      realtimeFallbackTimers.current.forEach(timer => clearTimeout(timer));
      realtimeFallbackTimers.current.clear();
    },
    [],
  );

  useEffect(() => {
    if (isRestoringSession || !session || !pendingResponseRef.current) {
      return;
    }
    handleResponse(pendingResponseRef.current);
  }, [handleResponse, isRestoringSession, session]);

  return null;
}
