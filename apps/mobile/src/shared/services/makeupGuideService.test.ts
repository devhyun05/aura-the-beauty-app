import {
  getMockRecommendationResult,
  getPrimaryRecommendedLook,
} from './makeupGuideService';

function expectEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

const recommendationResult = getMockRecommendationResult();
const primaryLook = getPrimaryRecommendedLook(recommendationResult);

expectEqual(recommendationResult.analysis.skinTone.label, '밝은 뉴트럴 톤', 'skin tone label');
expectEqual(recommendationResult.recommendedLooks.length, 3, 'recommended look count');
expectEqual(primaryLook.id, 'clean-glow-neutral', 'primary recommended look id');
