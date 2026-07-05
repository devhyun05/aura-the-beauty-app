import {getARMakeupGuideData} from '../../../shared/services/makeupGuideService';
import {getAvailableARFilterMakeupFilters} from './useARFilterSelectionState';

function expectEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

const arGuideData = getARMakeupGuideData();
const lipMakeupFilters = getAvailableARFilterMakeupFilters({
  makeupFilters: arGuideData.filters,
  selectedMakeupArea: 'lip',
});
const allMakeupFilters = getAvailableARFilterMakeupFilters({
  makeupFilters: arGuideData.filters,
  selectedMakeupArea: 'all',
});

expectEqual(
  lipMakeupFilters.every(filter => filter.makeupAreas.includes('lip')),
  true,
  'AR filter lip area shows only lip-compatible look cards',
);
expectEqual(
  lipMakeupFilters.some(filter => filter.id === 'filter-plum-syrup-gloss'),
  true,
  'AR filter lip area can show syrup lip look cards',
);
expectEqual(
  allMakeupFilters.length,
  arGuideData.filters.length,
  'AR filter all area keeps all look cards',
);
