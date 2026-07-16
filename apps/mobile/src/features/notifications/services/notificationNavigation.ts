import type {NavigationProp} from '@react-navigation/native';

import type {RootStackParamList} from '../../../app/navigation/routeTypes';
import type {AppNotificationData} from '../types';


export type AppNotificationNavigationTarget =
  | {name: 'FaceAnalysisReportDetail'; params: {reportId: string}}
  | {name: 'MakeupRecommendation'; params: {reportId: string}}
  | {name: 'MakeupFeedbackResult'; params: {reportId: string}}
  | {name: 'ReferenceMakeupExtractionResult'; params: {reportId: string}}
  | {name: 'ConsultingNotifications'};

export function getAppNotificationNavigationTarget(
  data: AppNotificationData,
): AppNotificationNavigationTarget {
  if (data.type === 'analysis_report_completed' && data.reportId) {
    return {
      name: 'FaceAnalysisReportDetail',
      params: {reportId: data.reportId},
    };
  }

  if (data.type === 'makeup_recommendation_completed' && data.reportId) {
    return {
      name: 'MakeupRecommendation',
      params: {reportId: data.reportId},
    };
  }

  if (data.type === 'makeup_feedback_completed' && data.reportId) {
    return {
      name: 'MakeupFeedbackResult',
      params: {reportId: data.reportId},
    };
  }

  if (data.type === 'filter_extraction_completed' && data.reportId) {
    return {
      name: 'ReferenceMakeupExtractionResult',
      params: {reportId: data.reportId},
    };
  }

  return {name: 'ConsultingNotifications'};
}

export function navigateToAppNotification(
  navigation: Pick<NavigationProp<RootStackParamList>, 'navigate'>,
  data: AppNotificationData,
): void {
  const target = getAppNotificationNavigationTarget(data);

  switch (target.name) {
    case 'FaceAnalysisReportDetail':
      navigation.navigate(target.name, target.params);
      break;
    case 'MakeupRecommendation':
      navigation.navigate(target.name, target.params);
      break;
    case 'MakeupFeedbackResult':
      navigation.navigate(target.name, target.params);
      break;
    case 'ReferenceMakeupExtractionResult':
      navigation.navigate(target.name, target.params);
      break;
    default:
      navigation.navigate(target.name);
  }
}
