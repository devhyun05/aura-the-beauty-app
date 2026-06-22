import {
  getDefaultMakeupFilter,
  getFiltersByCategory,
  getMockRecommendationResult,
  getMockARMakeupGuideData,
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

const arGuideData = getMockARMakeupGuideData();
const defaultFilter = getDefaultMakeupFilter(arGuideData);
const recommendationFilters = getFiltersByCategory('recommended', arGuideData);

expectEqual(arGuideData.categories[0].id, 'recommended', 'first filter category');
expectEqual(defaultFilter.id, 'neutral-rose-guide', 'default AR filter id');
expectEqual(recommendationFilters.length, 2, 'recommended AR filter count');
