import {getRecommendedFilterStencilRouteParams} from './arRouteActions';
import {getRecommendedMakeupFilterById} from '../../../shared/services/makeupGuideService';

function expectEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

// ── 프리셋 추천 필터 → 스텐실 진입 파라미터 (홈 카드·프로필·제품추천·추출 공유) ──
const cleanSmokyFilter = getRecommendedMakeupFilterById('filter-clean-smoky-city');
const stencilRouteParams = getRecommendedFilterStencilRouteParams(cleanSmokyFilter.id);

expectEqual(
  stencilRouteParams.source,
  'recommendedFilter',
  'preset filter stencil route source',
);
expectEqual(
  stencilRouteParams.recommendedLook?.label,
  cleanSmokyFilter.title,
  'stencil look label from preset filter title',
);
expectEqual(
  typeof stencilRouteParams.recommendedLook?.params.lipColor,
  'string',
  'preset filter carries a lip color into the stencil look',
);
expectEqual(
  stencilRouteParams.recommendedLook?.params.skinSmoothing,
  undefined,
  'preset filter with disabled foundation stays skin-safe',
);
expectEqual(
  Object.keys(stencilRouteParams).sort().join(','),
  'recommendedLook,source',
  'stencil route carries only the stencil contract (no preset screen params)',
);
