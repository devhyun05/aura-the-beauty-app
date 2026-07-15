import {
  getARFilterDetailEditRouteParams,
  getSavedArLookProductRecommendationRouteParams,
} from './arRouteActions';

function expectEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

const detailEditRouteParams = getARFilterDetailEditRouteParams();
const recommendedDetailEditRouteParams = getARFilterDetailEditRouteParams({
  editSourceImageUri: 'file:///captured-filter-edit.jpg',
  initialGuideMode: 'half',
  initialMakeupFilterId: 'filter-clean-smoky-city',
  source: 'recommendedFilter',
});

expectEqual(
  detailEditRouteParams.backRoute,
  'ARFilter',
  'AR filter detail edit back route',
);
expectEqual(
  detailEditRouteParams.mode,
  'preset',
  'AR filter detail edit mode',
);
expectEqual(
  detailEditRouteParams.initialEditMode,
  'product',
  'AR filter detail edit default tab mode',
);
expectEqual(
  recommendedDetailEditRouteParams.editSourceImageUri,
  'file:///captured-filter-edit.jpg',
  'AR filter detail edit source image uri',
);
expectEqual(
  recommendedDetailEditRouteParams.initialGuideMode,
  'half',
  'AR filter detail edit initial guide mode',
);
expectEqual(
  recommendedDetailEditRouteParams.initialMakeupFilterId,
  'filter-clean-smoky-city',
  'AR filter detail edit initial makeup filter id',
);
expectEqual(
  recommendedDetailEditRouteParams.source,
  'recommendedFilter',
  'AR filter detail edit source',
);

expectEqual(
  getARFilterDetailEditRouteParams({initialEditMode: 'fit'}).initialEditMode,
  'fit',
  'AR filter detail edit fit tab mode',
);

const savedLookProductRouteParams =
  getSavedArLookProductRecommendationRouteParams('style-recommended-1');

expectEqual(
  savedLookProductRouteParams.arStyleId,
  'style-recommended-1',
  'saved AR look product recommendation style id',
);
expectEqual(
  savedLookProductRouteParams.initialSection,
  'ar',
  'saved AR look product recommendation initial section',
);
