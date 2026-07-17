import {useCallback, useEffect, useRef} from 'react';
import * as Notifications from 'expo-notifications';

import {useAuthSession} from '../../auth';
import {
  deleteAppNotification,
  getBackgroundReportNotificationsEnabled,
  markAppNotificationRead,
  notifyNotificationStateChanged,
  registerForReportNotifications,
} from '../services/notificationService';
import {connectNotificationRealtime} from '../services/notificationRealtimeService';
import {
  normalizeAppNotificationData,
  type AppNotification,
  type AppNotificationData,
} from '../types';


Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

type NotificationCoordinatorProps = {
  onOpenNotification: (data: AppNotificationData) => void;
  shouldSuppressRealtimeNotification?: (
    notification: AppNotification,
  ) => boolean;
};

function readNotificationData(
  response: Notifications.NotificationResponse,
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
  const pendingResponseRef = useRef<Notifications.NotificationResponse | null>(null);
  const handledResponseIds = useRef(new Set<string>());
  const realtimeNotificationIds = useRef(new Set<string>());

  const handleResponse = useCallback(
    (response: Notifications.NotificationResponse) => {
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

    void getBackgroundReportNotificationsEnabled()
      .then(enabled => enabled ? registerForReportNotifications() : null)
      .then(result => {
        if (result?.status === 'project-id-missing') {
          console.info(
            '[aura:notifications] EXPO_PUBLIC_EAS_PROJECT_ID is required for push registration.',
          );
        }
      })
      .catch(error => {
        console.info('[aura:notifications] registration skipped', {
          message: error instanceof Error ? error.message : String(error),
        });
      });
  }, [isRestoringSession, session?.user.id]);

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

        if (realtimeNotificationIds.current.has(notification.id)) {
          return;
        }
        realtimeNotificationIds.current.add(notification.id);
        if (realtimeNotificationIds.current.size > 100) {
          const oldestId = realtimeNotificationIds.current.values().next().value;
          if (oldestId) {
            realtimeNotificationIds.current.delete(oldestId);
          }
        }
        if (shouldSuppressRealtimeNotification?.(notification)) {
          void deleteAppNotification(notification.id).catch(() =>
            markAppNotificationRead(notification.id).catch(() => undefined),
          );
          return;
        }

        notifyNotificationStateChanged();
        // The backend publishes this same notification through realtime and
        // Expo/APNs. Realtime is only responsible for refreshing in-app state;
        // scheduling another local notification here displays two banners for
        // a single completed report.
      },
    });

    return () => client.close();
  }, [
    getAuthToken,
    isRestoringSession,
    session?.user.id,
    shouldSuppressRealtimeNotification,
  ]);

  useEffect(() => {
    const receivedSubscription = Notifications.addNotificationReceivedListener(() => {
      notifyNotificationStateChanged();
    });
    const responseSubscription =
      Notifications.addNotificationResponseReceivedListener(handleResponse);

    void Notifications.getLastNotificationResponseAsync().then(response => {
      if (response) {
        handleResponse(response);
      }
    });

    return () => {
      receivedSubscription.remove();
      responseSubscription.remove();
    };
  }, [handleResponse, session]);

  useEffect(() => {
    if (isRestoringSession || !session || !pendingResponseRef.current) {
      return;
    }
    handleResponse(pendingResponseRef.current);
  }, [handleResponse, isRestoringSession, session]);

  return null;
}
