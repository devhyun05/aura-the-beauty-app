import {getMakeupRecommendationARFilterRouteParams} from './makeupRecommendationRouteActions';

function expectEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(
      `${label}: expected ${String(expected)}, received ${String(actual)}`,
    );
  }
}

const routeParams = getMakeupRecommendationARFilterRouteParams(
  'filter-clean-smoky-city',
);

expectEqual(
  routeParams.initialMakeupFilterId,
  'filter-clean-smoky-city',
  'makeup recommendation AR filter id',
);
expectEqual(
  routeParams.initialGuideMode,
  'half',
  'makeup recommendation AR guide mode',
);
expectEqual(
  routeParams.source,
  'recommendedFilter',
  'makeup recommendation AR source',
);
expectEqual(
  routeParams.fullFaceEditState?.controls.lip.enabled,
  true,
  'makeup recommendation includes editable full-face state',
);
expectEqual(
  routeParams.fullFaceEditState?.controls.foundation.enabled,
  false,
  'makeup recommendation preserves active regions',
);
