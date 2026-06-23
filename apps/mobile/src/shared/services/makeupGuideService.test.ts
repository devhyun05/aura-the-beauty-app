import {
  getDefaultComparisonMode,
  getDefaultMakeupFilter,
  getFiltersByCategory,
  getMockARMakeupGuideData,
} from './makeupGuideService';

function expectEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

const arGuideData = getMockARMakeupGuideData();
const defaultFilter = getDefaultMakeupFilter(arGuideData);
const defaultComparisonMode = getDefaultComparisonMode(arGuideData);
const recommendationFilters = getFiltersByCategory('recommended', arGuideData);

expectEqual(arGuideData.categories[0].id, 'recommended', 'first filter category');
expectEqual(arGuideData.comparisonModes[0].id, 'full', 'first comparison mode');
expectEqual(defaultFilter.id, 'neutral-rose-guide', 'default AR filter id');
expectEqual(defaultComparisonMode.label, '전체 비교', 'default comparison mode label');
expectEqual(recommendationFilters.length, 2, 'recommended AR filter count');
