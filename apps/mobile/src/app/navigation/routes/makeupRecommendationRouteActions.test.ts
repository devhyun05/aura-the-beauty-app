import {
  getLookMakeupColors,
  getMakeupRecommendationStencilRouteParams,
} from './makeupRecommendationRouteActions';

function expectEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(
      `${label}: expected ${String(expected)}, received ${String(actual)}`,
    );
  }
}

// areaGuides가 없는 룩 → 프리셋 폴백으로도 스텐실 룩이 만들어진다(회귀 없음).
const routeParams = getMakeupRecommendationStencilRouteParams(
  {
    arFilterId: 'filter-clean-smoky-city',
    role: 'bold',
    title: '클린 스모키',
    areaGuides: undefined,
  },
);

expectEqual(
  routeParams.source,
  'recommendedFilter',
  'makeup recommendation AR source',
);
expectEqual(
  routeParams.recommendedLook?.label,
  '클린 스모키',
  'stencil look label from look title',
);
expectEqual(
  typeof routeParams.recommendedLook?.params.lipColor,
  'string',
  'preset fallback still carries a lip color',
);
expectEqual(
  routeParams.recommendedLook?.params.skinSmoothing,
  undefined,
  'disabled foundation stays out of the stencil params',
);

// ── 추천 룩 areaGuides 색 → 필터 색 개인화 ──────────────────────────────────
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

// 룩 색이 라우트 파라미터를 거쳐 스텐실 파라미터로 반영된다 (프리셋 폴백 경로)
const coloredParams = getMakeupRecommendationStencilRouteParams(
  {
    arFilterId: 'filter-clean-smoky-city',
    role: 'bold',
    title: '클린 스모키',
    areaGuides: undefined,
  },
  {lip: '#b03a48'},
);
expectEqual(
  coloredParams.recommendedLook?.params.lipColor,
  '#b03a48',
  'route param colors reach the stencil look',
);

// ── areaGuides가 있는 룩 → 룩 자체가 스텐실 룩이 된다 ───────────────────────
const guidedParams = getMakeupRecommendationStencilRouteParams(
  {
    arFilterId: 'filter-clean-smoky-city',
    role: 'anchor',
    title: '로지 밸런스',
    areaGuides: [
      {area: 'lip', color: {name: '로지 레드', hex: '#B03A48'}, texture: '촉촉한 글로시'} as never,
      {area: 'eye', color: {name: '웜 브라운', hex: '#8A5A40'}, texture: '시머 펄'} as never,
    ],
  },
);
const guidedLook = guidedParams.recommendedLook;
expectEqual(guidedLook?.params.lipColor, '#B03A48', 'guided lip color from areaGuides');
expectEqual(guidedLook?.params.lipFinish, 2, 'glossy keyword -> glossy lip finish enum');
expectEqual(
  guidedLook?.params.blushColor,
  undefined,
  'regions without a guide stay out of params',
);
expectEqual(
  guidedLook?.eyeshadowLayers?.length,
  1,
  'eye guide -> single eyeshadow band',
);
expectEqual(
  guidedLook?.eyeshadowLayers?.[0]?.color,
  '#8A5A40',
  'eyeshadow band color from eye guide',
);
expectEqual(
  guidedLook?.eyeshadowLayers?.[0]?.finish,
  3,
  'shimmer texture keyword -> shimmer finish enum',
);
expectEqual(
  typeof guidedLook?.params.eyelinerColor,
  'string',
  'eye guide keeps liner for definition',
);
expectEqual(guidedLook?.label, '로지 밸런스', 'guided look label from title');
