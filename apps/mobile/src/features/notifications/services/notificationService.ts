import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import {Platform} from 'react-native';

import * as SecureStore from '../../../shared/services/localSecureStore';
import {requestBackendJson} from '../../../shared/services/backendApi';
import {isAppNotificationType, type AppNotification} from '../types';


const PUSH_TOKEN_STORAGE_KEY = 'aura.notifications.expoPushToken.v1';
const notificationStateListeners = new Set<() => void>();

type NotificationListResponse = {
  notifications: AppNotification[];
  unreadCount: number;
};

export type PushRegistrationResult =
  | {status: 'registered'; expoPushToken: string}
  | {status: 'permission-denied'}
  | {status: 'project-id-missing'};

export function subscribeNotificationStateChange(listener: () => void): () => void {
  notificationStateListeners.add(listener);
  return () => notificationStateListeners.delete(listener);
}

export function notifyNotificationStateChanged(): void {
  notificationStateListeners.forEach(listener => listener());
}

function getExpoProjectId(): string | null {
  const configuredProjectId = process.env.EXPO_PUBLIC_EAS_PROJECT_ID?.trim();
  const configProjectId = Constants.expoConfig?.extra?.eas?.projectId;
  const easProjectId = Constants.easConfig?.projectId;

  return configuredProjectId || configProjectId || easProjectId || null;
}

function isPermissionGranted(
  permission: Notifications.NotificationPermissionsStatus,
): boolean {
  const iosStatus = permission.ios?.status;

  return (
    permission.granted ||
    iosStatus === Notifications.IosAuthorizationStatus.AUTHORIZED ||
    iosStatus === Notifications.IosAuthorizationStatus.PROVISIONAL ||
    iosStatus === Notifications.IosAuthorizationStatus.EPHEMERAL
  );
}

async function requestNotificationPermission(): Promise<boolean> {
  const currentPermission = await Notifications.getPermissionsAsync();
  if (isPermissionGranted(currentPermission)) {
    return true;
  }

  const requestedPermission = await Notifications.requestPermissionsAsync({
    ios: {
      allowAlert: true,
      allowBadge: true,
      allowSound: true,
    },
  });
  return isPermissionGranted(requestedPermission);
}

export async function registerForReportNotifications(): Promise<PushRegistrationResult> {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('reports', {
      name: '보고서 완료',
      description: '얼굴 분석과 메이크업 보고서 생성 완료 알림',
      importance: Notifications.AndroidImportance.HIGH,
      sound: 'default',
      vibrationPattern: [0, 250, 250, 250],
    });
  }

  if (!(await requestNotificationPermission())) {
    return {status: 'permission-denied'};
  }

  const projectId = getExpoProjectId();
  if (!projectId) {
    return {status: 'project-id-missing'};
  }

  const expoPushToken = (
    await Notifications.getExpoPushTokenAsync({projectId})
  ).data;
  await requestBackendJson('/notifications/devices', {
    method: 'POST',
    body: {
      expoPushToken,
      platform: Platform.OS === 'android' ? 'android' : 'ios',
      appVersion: Constants.expoConfig?.version ?? null,
    },
  });
  await SecureStore.setItemAsync(PUSH_TOKEN_STORAGE_KEY, expoPushToken);

  return {status: 'registered', expoPushToken};
}

export async function presentRealtimeAppNotification(
  notification: AppNotification,
): Promise<void> {
  if (!(await requestNotificationPermission())) {
    return;
  }

  await Notifications.scheduleNotificationAsync({
    content: {
      title: notification.title,
      body: notification.body,
      sound: 'default',
      data: {
        ...notification.data,
        notificationId: notification.id,
        type: notification.notificationType,
      },
    },
    trigger: null,
  });
}

export async function unregisterCurrentPushDevice(): Promise<void> {
  const expoPushToken = await SecureStore.getItemAsync(PUSH_TOKEN_STORAGE_KEY);
  if (!expoPushToken) {
    return;
  }

  await requestBackendJson('/notifications/devices', {
    method: 'DELETE',
    body: {expoPushToken},
  });
  await SecureStore.deleteItemAsync(PUSH_TOKEN_STORAGE_KEY);
}

export async function getAppNotifications(
  limit = 50,
  offset = 0,
): Promise<NotificationListResponse> {
  const response = await requestBackendJson<NotificationListResponse>(
    `/notifications?limit=${limit}&offset=${offset}`,
  );
  return {
    ...response,
    notifications: (response.notifications ?? []).filter(notification =>
      isAppNotificationType(notification.notificationType),
    ),
  };
}

export async function getUnreadAppNotificationCount(): Promise<number> {
  const response = await requestBackendJson<{count: number}>(
    '/notifications/unread-count',
  );
  return Math.max(0, Number(response.count) || 0);
}

export async function markAppNotificationRead(
  notificationId: string,
): Promise<void> {
  await requestBackendJson(`/notifications/${encodeURIComponent(notificationId)}/read`, {
    method: 'POST',
  });
  notifyNotificationStateChanged();
}

export async function markAllAppNotificationsRead(): Promise<void> {
  await requestBackendJson('/notifications/read-all', {method: 'POST'});
  notifyNotificationStateChanged();
}

export async function deleteAppNotification(
  notificationId: string,
): Promise<void> {
  await requestBackendJson(
    `/notifications/${encodeURIComponent(notificationId)}`,
    {method: 'DELETE'},
  );
  notifyNotificationStateChanged();
}
