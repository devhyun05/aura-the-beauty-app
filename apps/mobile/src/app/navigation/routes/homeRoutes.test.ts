import {
  getHomeProductRecommendationRouteName,
  getHomeRecommendedFilterMoreRouteName,
} from './homeRoutes';
import {getHomeFeatureNavigationTarget} from '../../../features/home/config/homeFeatureRouteMap';

function expectEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

expectEqual(
  getHomeRecommendedFilterMoreRouteName(),
  'HomeFilterStore',
  'home recommended filter more route',
);

expectEqual(
  getHomeProductRecommendationRouteName(),
  'ProductRecommendation',
  'home product recommendation opens the hub instead of Auradin',
);

const featureNavigationCases = [
  ['faceAnalysis', undefined, 'FaceAnalysisIntro'],
  ['faceAnalysis', {source: 'reports'}, 'FaceAnalysisReportsList'],
  ['makeupRecommendation', undefined, 'MakeupRecommendation'],
  ['productRecommendation', undefined, 'ProductRecommendation'],
  ['productRecommendation', {itemId: 'product-1'}, 'ProductSellerOutbound'],
  ['auradin', {source: '데일리 립 추천'}, 'AuradinSearch'],
  ['makeupExtraction', undefined, 'makeupExtractionSheet'],
  ['makeupFeedback', undefined, 'makeupFeedbackSheet'],
  ['consulting', undefined, 'ConsultingTab'],
  ['savedMakeup', undefined, 'SavedMakeupList'],
  ['likedProducts', undefined, 'LikedProductList'],
  ['arFilter', undefined, 'ARFilter'],
  ['filterStore', undefined, 'HomeFilterStore'],
] as const;

featureNavigationCases.forEach(([featureId, payload, expectedTarget]) => {
  expectEqual(
    getHomeFeatureNavigationTarget(featureId, payload),
    expectedTarget,
    `${featureId} home feature navigation target`,
  );
});
