import React from 'react';

import {
  filterRecommendedMakeupFiltersByCategory,
  FilterStoreScreen,
  FILTER_STORE_CATEGORY_LIST_ALLOWS_WRAP,
  FILTER_STORE_CATEGORY_LIST_SCROLL_AXIS,
  FILTER_STORE_SHOW_SUMMARY_CARD,
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
expectEqual(FILTER_STORE_SHOW_SUMMARY_CARD, false, 'filter store summary card is hidden');
expectEqual(
  FILTER_STORE_CATEGORY_LIST_SCROLL_AXIS,
  'horizontal',
  'filter store category list scroll axis',
);
expectEqual(
  FILTER_STORE_CATEGORY_LIST_ALLOWS_WRAP,
  false,
  'filter store category chips do not wrap',
);
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
