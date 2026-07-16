import type {
  HomeFeatureId,
  HomeFeaturePressPayload,
} from '../types/homeModules';

export type HomeFeatureNavigationTarget =
  | 'ARFilter'
  | 'AuradinSearch'
  | 'ConsultingTab'
  | 'FaceAnalysisIntro'
  | 'FaceAnalysisReportsList'
  | 'HomeFilterStore'
  | 'LikedProductList'
  | 'MakeupRecommendation'
  | 'ProductDetail'
  | 'ProductRecommendation'
  | 'SavedMakeupList'
  | 'makeupExtractionSheet'
  | 'makeupFeedbackSheet';

/**
 * Central route intent map for every actionable Home feature.
 *
 * Presentation components only emit a feature id and optional item payload;
 * the navigation layer remains responsible for performing the target action.
 */
export function getHomeFeatureNavigationTarget(
  featureId: HomeFeatureId,
  payload?: HomeFeaturePressPayload,
): HomeFeatureNavigationTarget {
  if (featureId === 'faceAnalysis') {
    return payload?.source === 'reports'
      ? 'FaceAnalysisReportsList'
      : 'FaceAnalysisIntro';
  }
  if (featureId === 'makeupRecommendation') return 'MakeupRecommendation';
  if (featureId === 'productRecommendation') {
    return payload?.itemId ? 'ProductDetail' : 'ProductRecommendation';
  }
  if (featureId === 'auradin') return 'AuradinSearch';
  if (featureId === 'makeupExtraction') return 'makeupExtractionSheet';
  if (featureId === 'makeupFeedback') return 'makeupFeedbackSheet';
  if (featureId === 'consulting') return 'ConsultingTab';
  if (featureId === 'savedMakeup') return 'SavedMakeupList';
  if (featureId === 'likedProducts') return 'LikedProductList';
  if (featureId === 'arFilter') return 'ARFilter';
  return 'HomeFilterStore';
}
