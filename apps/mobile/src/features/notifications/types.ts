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
