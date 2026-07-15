import {createRecommendedMakeupEditState} from '../../../features/ar/services/recommendedMakeupEditService';
import {getRecommendedMakeupFilterById} from '../../../shared/services/makeupGuideService';
import type {RootStackParamList} from '../routeTypes';

export type MakeupRecommendationARFilterRouteParams = NonNullable<
  RootStackParamList['ARFilter']
>;

export function getMakeupRecommendationARFilterRouteParams(
  arFilterId: string,
): MakeupRecommendationARFilterRouteParams {
  const recommendedFilter = getRecommendedMakeupFilterById(arFilterId);

  return {
    fullFaceEditState: createRecommendedMakeupEditState(recommendedFilter),
    initialGuideMode: 'half',
    initialMakeupFilterId: recommendedFilter.id,
    source: 'recommendedFilter',
  };
}
