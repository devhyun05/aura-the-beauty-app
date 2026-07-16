import type {NavigationProp} from '@react-navigation/native';

import type {RootStackParamList} from '../../../app/navigation/routeTypes';
import {
  isAppNotificationType,
  type AppNotification,
  type AppNotificationData,
  type AppNotificationType,
} from '../types';


export type AppNotificationNavigationTarget =
  | {name: 'FaceAnalysisReportDetail'; params: {reportId: string}}
  | {name: 'MakeupRecommendation'; params: {reportId: string}}
  | {name: 'MakeupFeedbackResult'; params: {reportId: string}}
  | {name: 'ReferenceMakeupExtractionResult'; params: {reportId: string}}
  | {name: 'ConsultingNotifications'};

type CurrentRouteSnapshot = {
  name: string;
  params?: object | undefined;
};

const NOTIFICATION_WAITING_ROUTES: Partial<Record<AppNotificationType, string>> = {
  analysis_report_completed: 'FaceAnalysisLoading',
  makeup_feedback_completed: 'MakeupFeedbackLoading',
  filter_extraction_completed: 'ReferenceMakeupExtractionLoading',
};

const NOTIFICATION_RESULT_ROUTES: Record<AppNotificationType, string> = {
  analysis_report_completed: 'FaceAnalysisReportDetail',
  makeup_recommendation_completed: 'MakeupRecommendation',
  makeup_feedback_completed: 'MakeupFeedbackResult',
  filter_extraction_completed: 'ReferenceMakeupExtractionResult',
};

const NOTIFICATION_TYPE_BY_ROUTE: Record<string, AppNotificationType> = {
  FaceAnalysisReportDetail: 'analysis_report_completed',
  MakeupRecommendation: 'makeup_recommendation_completed',
  MakeupFeedbackResult: 'makeup_feedback_completed',
  ReferenceMakeupExtractionResult: 'filter_extraction_completed',
};

function getNotificationType(
  data: AppNotificationData,
): AppNotificationType | undefined {
  if (data.type && isAppNotificationType(data.type)) {
    return data.type;
  }
  return data.route ? NOTIFICATION_TYPE_BY_ROUTE[data.route] : undefined;
}

function getRouteReportId(route: CurrentRouteSnapshot): string | undefined {
  if (!route.params || !('reportId' in route.params)) {
    return undefined;
  }

  const reportId = route.params.reportId;
  return typeof reportId === 'string' ? reportId : undefined;
}

export function shouldSuppressRealtimeAppNotification(
  route: CurrentRouteSnapshot | undefined,
  notification: AppNotification,
): boolean {
  if (!route) {
    return false;
  }

  const type = notification.notificationType;
  if (!(type in NOTIFICATION_RESULT_ROUTES)) {
    return false;
  }

  const notificationType = type as AppNotificationType;
  if (NOTIFICATION_WAITING_ROUTES[notificationType] === route.name) {
    return true;
  }
  if (NOTIFICATION_RESULT_ROUTES[notificationType] !== route.name) {
    return false;
  }

  const routeReportId = getRouteReportId(route);
  const notificationReportId = notification.data.reportId;
  return (
    !routeReportId ||
    !notificationReportId ||
    routeReportId === notificationReportId
  );
}

export function getAppNotificationNavigationTarget(
  data: AppNotificationData,
): AppNotificationNavigationTarget {
  const type = getNotificationType(data);

  if (type === 'analysis_report_completed' && data.reportId) {
    return {
      name: 'FaceAnalysisReportDetail',
      params: {reportId: data.reportId},
    };
  }

  if (type === 'makeup_recommendation_completed' && data.reportId) {
    return {
      name: 'MakeupRecommendation',
      params: {reportId: data.reportId},
    };
  }

  if (type === 'makeup_feedback_completed' && data.reportId) {
    return {
      name: 'MakeupFeedbackResult',
      params: {reportId: data.reportId},
    };
  }

  if (type === 'filter_extraction_completed' && data.reportId) {
    return {
      name: 'ReferenceMakeupExtractionResult',
      params: {reportId: data.reportId},
    };
  }

  return {name: 'ConsultingNotifications'};
}

export function navigateToAppNotification(
  navigation: Pick<NavigationProp<RootStackParamList>, 'reset'>,
  data: AppNotificationData,
): void {
  const target = getAppNotificationNavigationTarget(data);

  switch (target.name) {
    case 'FaceAnalysisReportDetail':
      navigation.reset({
        index: 1,
        routes: [
          {name: 'MainTabs', params: {screen: 'HomeTab'}},
          {name: target.name, params: target.params},
        ],
      });
      break;
    case 'MakeupRecommendation':
      navigation.reset({
        index: 1,
        routes: [
          {name: 'MainTabs', params: {screen: 'HomeTab'}},
          {name: target.name, params: target.params},
        ],
      });
      break;
    case 'MakeupFeedbackResult':
      navigation.reset({
        index: 1,
        routes: [
          {name: 'MainTabs', params: {screen: 'HomeTab'}},
          {name: target.name, params: target.params},
        ],
      });
      break;
    case 'ReferenceMakeupExtractionResult':
      navigation.reset({
        index: 1,
        routes: [
          {name: 'MainTabs', params: {screen: 'HomeTab'}},
          {name: target.name, params: target.params},
        ],
      });
      break;
    default:
      navigation.reset({
        index: 1,
        routes: [
          {name: 'MainTabs', params: {screen: 'HomeTab'}},
          {name: target.name},
        ],
      });
  }
}
