export type AppNotificationType =
  | 'analysis_report_completed'
  | 'makeup_recommendation_completed'
  | 'makeup_feedback_completed'
  | 'filter_extraction_completed';

export const APP_NOTIFICATION_TYPES = [
  'analysis_report_completed',
  'makeup_recommendation_completed',
  'makeup_feedback_completed',
  'filter_extraction_completed',
] as const satisfies readonly AppNotificationType[];

export function isAppNotificationType(
  value: string,
): value is AppNotificationType {
  return (APP_NOTIFICATION_TYPES as readonly string[]).includes(value);
}

export type AppNotificationData = {
  notificationId?: string;
  reportId?: string;
  route?: string;
  type?: AppNotificationType | string;
};

export type AppNotification = {
  id: string;
  notificationType: AppNotificationType | string;
  title: string;
  body: string;
  data: AppNotificationData;
  readAt?: string | null;
  createdAt: string;
};

export function normalizeAppNotificationData(
  value: unknown,
): AppNotificationData {
  let source = value;

  if (typeof source === 'string') {
    try {
      source = JSON.parse(source);
    } catch {
      return {};
    }
  }

  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    return {};
  }

  const record = source as Record<string, unknown>;
  const readString = (...keys: string[]) => {
    for (const key of keys) {
      const candidate = record[key];
      if (typeof candidate === 'string' && candidate.trim()) {
        return candidate;
      }
    }
    return undefined;
  };

  return {
    notificationId: readString('notificationId', 'notification_id'),
    reportId: readString('reportId', 'report_id'),
    route: readString('route'),
    type: readString('type', 'notificationType', 'notification_type'),
  };
}
