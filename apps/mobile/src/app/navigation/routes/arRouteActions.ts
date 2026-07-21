import {createRecommendedMakeupEditState} from '../../../features/ar/services/recommendedMakeupEditService';
import {createRecommendedStencilLook} from '../../../features/ar/services/recommendedStencilLook';
import {getRecommendedMakeupFilterById} from '../../../shared/services/makeupGuideService';
import type {RootStackParamList} from '../routeTypes';

export type RecommendedFilterStencilRouteParams = NonNullable<
  RootStackParamList['ARFilter']
>;

// 프리셋 추천 필터(filterId) → 스텐실(홈 "메이크업 필터") 진입 파라미터.
// 홈 필터 카드·프로필·제품추천·레퍼런스 추출이 공유한다 — 프리셋의 부위·색·질감을
// 스텐실 시작 룩으로 변환해 하나의 필터 화면으로 통일한다.
export function getRecommendedFilterStencilRouteParams(
  filterId: string,
): RecommendedFilterStencilRouteParams {
  const recommendedFilter = getRecommendedMakeupFilterById(filterId);

  return {
    recommendedLook: createRecommendedStencilLook(
      createRecommendedMakeupEditState(recommendedFilter),
      recommendedFilter.title,
    ),
    source: 'recommendedFilter',
  };
}


