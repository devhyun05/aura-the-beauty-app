import {HOME_FEATURE_IDS} from '../types/homeModules';
import {getHomeFeatureNavigationTarget} from './homeFeatureRouteMap';

function expectEqual<T>(actual: T, expected: T, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

const featureNavigationCases = [
  ['faceAnalysis', undefined, 'FaceAnalysisIntro'],
  ['faceAnalysis', {source: 'reports'}, 'FaceAnalysisReportsList'],
  ['makeupRecommendation', undefined, 'MakeupRecommendation'],
  ['productRecommendation', undefined, 'ProductRecommendation'],
  ['productRecommendation', {itemId: 'product-1'}, 'ProductDetail'],
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

expectEqual(
  new Set(featureNavigationCases.map(([featureId]) => featureId)).size,
  HOME_FEATURE_IDS.length,
  'every Home feature id has a navigation contract',
);
