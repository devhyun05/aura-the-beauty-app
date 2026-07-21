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

// ── 추천 룩 areaGuides 색 → 필터 색 개인화 ──────────────────────────────────
import {getLookMakeupColors} from './makeupRecommendationRouteActions';

const lookColors = getLookMakeupColors({
  areaGuides: [
    {area: 'lip', color: {name: '로지 레드', hex: '#B03A48'}} as never,
    {area: 'cheek', color: {name: '피치', hex: '#E8A08F'}} as never,
    {area: 'eye', color: {name: '브라운', hex: '#5A4038'}} as never,
    {area: 'base', color: {name: '베이지', hex: '#F0D8C8'}} as never, // 스킨세이프 → 제외
    {area: 'brow', color: {name: '?', hex: 'oops'}} as never,          // 형식 이상 → 제외
  ],
});
expectEqual(lookColors?.lip, '#b03a48', 'look lip color extracted (lowercased)');
expectEqual(lookColors?.blush, '#e8a08f', 'look cheek color -> blush key');
expectEqual(lookColors?.eyeliner, '#5a4038', 'look eye color -> eyeliner key');
expectEqual(lookColors?.brow, undefined, 'invalid hex excluded');
expectEqual(
  getLookMakeupColors({areaGuides: []}),
  undefined,
  'no guides -> undefined (preset fallback)',
);

// 룩 색이 라우트 파라미터를 거쳐 필터 색으로 반영된다
const coloredParams = getMakeupRecommendationARFilterRouteParams(
  'filter-clean-smoky-city',
  {lip: '#b03a48'},
);
expectEqual(
  coloredParams.fullFaceEditState?.controls.lip.colorHex,
  '#b03a48',
  'route param colors reach the filter edit state',
);
