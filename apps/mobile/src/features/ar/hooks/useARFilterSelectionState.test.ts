import {
  getARMakeupGuideData,
  getRecommendedMakeupFilterById,
} from '../../../shared/services/makeupGuideService';
import {
  getAvailableARFilterMakeupFilters,
  getInitialARFilterSelectionStateForLaunch,
} from './useARFilterSelectionState';

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
const emptyInitialSelectionState = getInitialARFilterSelectionStateForLaunch();
const recommendedFilter = getRecommendedMakeupFilterById('filter-douyin-pink');
const recommendedInitialSelectionState = getInitialARFilterSelectionStateForLaunch(
  recommendedFilter,
  'recommendedFilter',
);

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
expectEqual(
  emptyInitialSelectionState.selectedTotalMakeupLookId,
  null,
  'AR filter default launch starts without a total look selection',
);
expectEqual(
  emptyInitialSelectionState.selectedPointMakeupLookId,
  '',
  'AR filter default launch starts without a point look selection',
);
expectEqual(
  emptyInitialSelectionState.selectedColorId,
  '',
  'AR filter default launch starts without a color selection',
);
expectEqual(
  emptyInitialSelectionState.selectedTypeId,
  '',
  'AR filter default launch starts without a type selection',
);
expectEqual(
  emptyInitialSelectionState.selectedTextureId,
  '',
  'AR filter default launch starts without a texture selection',
);
expectEqual(
  emptyInitialSelectionState.selectedShapeId,
  '',
  'AR filter default launch starts without a shape selection',
);
expectEqual(
  emptyInitialSelectionState.hasUnsavedMakeupChanges,
  false,
  'AR filter default launch has no saveable changes',
);
expectEqual(
  recommendedInitialSelectionState.selectedTotalMakeupLookId,
  recommendedFilter.id,
  'AR filter recommended launch keeps the recommended look selected',
);
expectEqual(
  recommendedInitialSelectionState.hasUnsavedMakeupChanges,
  true,
  'AR filter recommended launch remains saveable',
);
