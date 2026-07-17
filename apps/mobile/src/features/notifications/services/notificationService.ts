import {isRunningInExpoGo} from 'expo';
import Constants from 'expo-constants';
import type * as ExpoNotifications from 'expo-notifications';
import {Platform} from 'react-native';

import * as SecureStore from '../../../shared/services/localSecureStore';
import {requestBackendJson} from '../../../shared/services/backendApi';
import {
  isAppNotificationType,
  normalizeAppNotificationData,
  type AppNotification,
} from '../types';


const PUSH_TOKEN_STORAGE_KEY = 'aura.notifications.expoPushToken.v1';
const BACKGROUND_NOTIFICATION_PREFERENCE_KEY =
  'aura.notifications.backgroundReportsEnabled.v1';
const notificationStateListeners = new Set<() => void>();
let notificationsModulePromise: Promise<typeof ExpoNotifications> | null = null;

type NotificationListResponse = {
  notifications: AppNotification[];
  unreadCount: number;
};

export type PushRegistrationResult =
  | {status: 'registered'; expoPushToken: string}
  | {status: 'permission-denied'}
  | {status: 'project-id-missing'}
  | {status: 'unsupported-in-expo-go'};

export type BackgroundNotificationUpdateResult =
  | PushRegistrationResult
  | {status: 'disabled'};

export function subscribeNotificationStateChange(listener: () => void): () => void {
  notificationStateListeners.add(listener);
  return () => notificationStateListeners.delete(listener);
}

export function notifyNotificationStateChanged(): void {
  notificationStateListeners.forEach(listener => listener());
}

export function getExpoNotificationsModule(): Promise<
  typeof ExpoNotifications | null
> {
  if (Platform.OS === 'android' && isRunningInExpoGo()) {
    return Promise.resolve(null);
  }

  notificationsModulePromise ??= import('expo-notifications');
  return notificationsModulePromise;
}

function getExpoProjectId(): string | null {
  const configuredProjectId = process.env.EXPO_PUBLIC_EAS_PROJECT_ID?.trim();
  const configProjectId = Constants.expoConfig?.extra?.eas?.projectId;
  const easProjectId = Constants.easConfig?.projectId;

  return configuredProjectId || configProjectId || easProjectId || null;
}

function isPermissionGranted(
  Notifications: typeof ExpoNotifications,
  permission: ExpoNotifications.NotificationPermissionsStatus,
): boolean {
  const iosStatus = permission.ios?.status;

  return (
    permission.granted ||
    iosStatus === Notifications.IosAuthorizationStatus.AUTHORIZED ||
    iosStatus === Notifications.IosAuthorizationStatus.PROVISIONAL ||
    iosStatus === Notifications.IosAuthorizationStatus.EPHEMERAL
  );
}

async function requestNotificationPermission(
  Notifications: typeof ExpoNotifications,
): Promise<boolean> {
  const currentPermission = await Notifications.getPermissionsAsync();
  if (isPermissionGranted(Notifications, currentPermission)) {
    return true;
  }

  const requestedPermission = await Notifications.requestPermissionsAsync({
    ios: {
      allowAlert: true,
      allowBadge: true,
      allowSound: true,
    },
  });
  return isPermissionGranted(Notifications, requestedPermission);
}

export async function registerForReportNotifications(): Promise<PushRegistrationResult> {
  const Notifications = await getExpoNotificationsModule();
  if (!Notifications) {
    return {status: 'unsupported-in-expo-go'};
  }

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('reports', {
      name: '보고서 완료',
      description: '얼굴 분석과 메이크업 보고서 생성 완료 알림',
      importance: Notifications.AndroidImportance.HIGH,
      sound: 'default',
      vibrationPattern: [0, 250, 250, 250],
    });
  }

  if (!(await requestNotificationPermission(Notifications))) {
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

export async function getBackgroundReportNotificationsEnabled(): Promise<boolean> {
  if (Platform.OS === 'android' && isRunningInExpoGo()) {
    return false;
  }

  const preference = await SecureStore.getItemAsync(
    BACKGROUND_NOTIFICATION_PREFERENCE_KEY,
  );
  return preference !== 'disabled';
}

export async function setBackgroundReportNotificationsEnabled(
  enabled: boolean,
): Promise<BackgroundNotificationUpdateResult> {
  if (!enabled) {
    await unregisterCurrentPushDevice();
    await SecureStore.setItemAsync(
      BACKGROUND_NOTIFICATION_PREFERENCE_KEY,
      'disabled',
    );
    return {status: 'disabled'};
  }

  const result = await registerForReportNotifications();
  if (result.status === 'registered') {
    await SecureStore.setItemAsync(
      BACKGROUND_NOTIFICATION_PREFERENCE_KEY,
      'enabled',
    );
  }
  return result;
}

export async function presentRealtimeAppNotification(
  notification: AppNotification,
): Promise<void> {
  const Notifications = await getExpoNotificationsModule();
  if (!Notifications || !(await requestNotificationPermission(Notifications))) {
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

export async function suppressReportCompletionNotification(
  notificationType: AppNotification['notificationType'],
  reportId: string,
): Promise<void> {
  await requestBackendJson('/notifications/report-suppressions', {
    method: 'POST',
    body: {notificationType, reportId},
  });
}

export async function releaseReportCompletionNotificationSuppression(
  notificationType: AppNotification['notificationType'],
  reportId: string,
): Promise<void> {
  await requestBackendJson('/notifications/report-suppressions', {
    method: 'DELETE',
    body: {notificationType, reportId},
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
    notifications: (response.notifications ?? [])
      .filter(notification =>
        isAppNotificationType(notification.notificationType),
      )
      .map(notification => ({
        ...notification,
        data: normalizeAppNotificationData(notification.data),
      })),
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
