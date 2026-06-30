import {
  getDefaultComparisonMode,
  getDefaultMakeupFilter,
  getFiltersByCategory,
  getARMakeupGuideData,
  getRecommendedMakeupFilterById,
  getRecommendedMakeupFilters,
  mapMakeupFilterToSavedLook,
  sortMakeupFiltersByRecommendationScore,
} from './makeupGuideService';

function expectEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

const arGuideData = getARMakeupGuideData();
const defaultFilter = getDefaultMakeupFilter(arGuideData);
const defaultComparisonMode = getDefaultComparisonMode(arGuideData);
const recommendationFilters = getFiltersByCategory('recommended', arGuideData);
const recommendedMakeupFilters = getRecommendedMakeupFilters();
const fallbackRecommendedFilter = getRecommendedMakeupFilterById('missing-filter-id');
const mappedSavedLook = mapMakeupFilterToSavedLook(defaultFilter, 123);
const stableSortedFilters = sortMakeupFiltersByRecommendationScore(
  [
    {
      ...defaultFilter,
      id: 'same-score-b',
      sourceImageId: 'same-score-b',
    },
    {
      ...defaultFilter,
      id: 'same-score-a',
      sourceImageId: 'same-score-a',
    },
  ],
  {
    embeddingVector: [0, 0, 0, 0, 0],
    keywords: [],
  },
);

expectEqual(arGuideData.categories[0].id, 'recommended', 'first filter category');
expectEqual(arGuideData.comparisonModes.length, 2, 'comparison mode count');
expectEqual(arGuideData.comparisonModes[0].id, 'left', 'first comparison mode');
expectEqual(arGuideData.comparisonModes[0].label, '왼쪽', 'first comparison mode label');
expectEqual(arGuideData.comparisonModes[1].label, '오른쪽', 'second comparison mode label');
expectEqual(defaultFilter.id, 'filter-clean-smoky-city', 'default AR filter id');
expectEqual(defaultComparisonMode.label, '왼쪽', 'default comparison mode label');
expectEqual(defaultFilter.title.includes('가이드'), false, 'default AR filter title guide copy');
expectEqual(recommendationFilters.length, 3, 'recommended AR filter count');
expectEqual(recommendedMakeupFilters.length, 20, 'recommended makeup filter count');
expectEqual(
  new Set(recommendedMakeupFilters.map(filter => filter.sourceImageId)).size,
  20,
  'recommended source image id uniqueness',
);
expectEqual(
  new Set(recommendedMakeupFilters.map(filter => filter.imageSource)).size,
  20,
  'recommended image source uniqueness',
);
expectEqual(
  fallbackRecommendedFilter.id,
  recommendedMakeupFilters[0].id,
  'recommended filter id fallback',
);
expectEqual(
  stableSortedFilters[0].id,
  'same-score-a',
  'recommended stable id sort',
);
expectEqual(
  mappedSavedLook.id,
  'saved-filter-clean-smoky-city-123',
  'recommended saved look id',
);
expectEqual(mappedSavedLook.title, '클린 스모키', 'recommended saved look title');
expectEqual(mappedSavedLook.makeupArea, 'all', 'recommended saved look area');
expectEqual(
  mappedSavedLook.makeupPresetValues.sourceFilterId,
  defaultFilter.id,
  'recommended saved look source filter id',
);
