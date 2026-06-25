import {
  getDefaultComparisonMode,
  getDefaultMakeupFilter,
  getFiltersByCategory,
  getARMakeupGuideData,
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

expectEqual(arGuideData.categories[0].id, 'recommended', 'first filter category');
expectEqual(arGuideData.comparisonModes.length, 2, 'comparison mode count');
expectEqual(arGuideData.comparisonModes[0].id, 'left', 'first comparison mode');
expectEqual(arGuideData.comparisonModes[0].label, '왼쪽', 'first comparison mode label');
expectEqual(arGuideData.comparisonModes[1].label, '오른쪽', 'second comparison mode label');
expectEqual(defaultFilter.id, 'neutral-rose-guide', 'default AR filter id');
expectEqual(defaultComparisonMode.label, '왼쪽', 'default comparison mode label');
expectEqual(defaultFilter.title.includes('가이드'), false, 'default AR filter title guide copy');
expectEqual(recommendationFilters.length, 2, 'recommended AR filter count');
