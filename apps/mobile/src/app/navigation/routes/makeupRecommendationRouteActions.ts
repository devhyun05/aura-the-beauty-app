import {createRecommendedMakeupEditState} from '../../../features/ar/services/recommendedMakeupEditService';
import {getRecommendedMakeupFilterById} from '../../../shared/services/makeupGuideService';
import type {FaceAnalysisMakeupColors} from '../../../shared/types/faceAnalysis';
import type {RootStackParamList} from '../routeTypes';

export type MakeupRecommendationARFilterRouteParams = NonNullable<
  RootStackParamList['ARFilter']
>;

export function getMakeupRecommendationARFilterRouteParams(
  arFilterId: string,
  // 분석이 낸 부위별 hex(퍼스널 컬러 근거). 있으면 데코 부위 색을 개인화하고, 없거나
  // 형식 이상이면 프리셋 색을 그대로 쓴다(모양·질감은 불변).
  makeupColors?: FaceAnalysisMakeupColors,
): MakeupRecommendationARFilterRouteParams {
  const recommendedFilter = getRecommendedMakeupFilterById(arFilterId);

  return {
    fullFaceEditState: createRecommendedMakeupEditState(recommendedFilter, makeupColors),
    initialGuideMode: 'half',
    initialMakeupFilterId: recommendedFilter.id,
    source: 'recommendedFilter',
  };
}
