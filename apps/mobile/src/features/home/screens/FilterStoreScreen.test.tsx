import React from 'react';

import {
  filterRecommendedMakeupFiltersByCategory,
  FilterStoreScreen,
  getFilterStoreCategoryForFilter,
  getFilterStoreCategoryLabels,
  pinFilterStoreFilterToFront,
} from './FilterStoreScreen';
import {getRecommendedMakeupFilters} from '../../../shared/services/makeupGuideService';

function expectEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

const filters = getRecommendedMakeupFilters();
const categoryLabels = getFilterStoreCategoryLabels();
const allFilters = filterRecommendedMakeupFiltersByCategory(filters, 'all');
const glowFilters = filterRecommendedMakeupFiltersByCategory(filters, 'glow');
const redFilters = filterRecommendedMakeupFiltersByCategory(filters, 'red');
const wanghongFilterId = 'filter-wanghong-glass-pink';
const wanghongFilterCategory = getFilterStoreCategoryForFilter(filters, wanghongFilterId);
const pinnedRedFilters = pinFilterStoreFilterToFront(redFilters, wanghongFilterId);

expectEqual(categoryLabels.join(','), '전체,글로우,스모키,레드,핑크,브라운,트렌드,유니크', 'filter store category labels');
expectEqual(allFilters.length, 20, 'filter store all category count');
expectEqual(wanghongFilterCategory, 'red', 'filter store category for Wanghong trend filter');
expectEqual(pinnedRedFilters[0]?.id, wanghongFilterId, 'filter store pins initial trend filter');

if (glowFilters.length === 0) {
  throw new Error('filter store glow category should include filters');
}

if (redFilters.length === 0) {
  throw new Error('filter store red category should include filters');
}

<FilterStoreScreen onApplyFilter={() => undefined} />;
