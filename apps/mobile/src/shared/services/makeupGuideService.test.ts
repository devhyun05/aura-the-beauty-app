import {
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
const recommendationFilters = getFiltersByCategory('recommended', arGuideData);

expectEqual(arGuideData.categories[0].id, 'recommended', 'first filter category');
expectEqual(defaultFilter.id, 'neutral-rose-guide', 'default AR filter id');
expectEqual(recommendationFilters.length, 2, 'recommended AR filter count');
