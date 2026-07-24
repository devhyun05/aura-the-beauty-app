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
// 프리셋 폴백엔 세부 레인 없음 — 신규 축이 기존 경로에 새지 않는다(회귀 봉인).
expectEqual(
  routeParams.recommendedLook?.params.lipGlossIntensity,
  undefined,
  'preset fallback carries no lip gloss lane',
);
expectEqual(
  routeParams.recommendedLook?.params.aegyoIntensity,
  undefined,
  'preset fallback carries no aegyo lane',
);
expectEqual(
  routeParams.recommendedLook?.eyeshadowLayers?.length,
  0,
  'preset fallback keeps eyeshadow bands unchanged',
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
// eye 가이드 색은 eyeliner 키에 싣지 않는다 — 밝은 섀도 대표색이 분석색 폴백을
// 타고 라이너를 세탁하던 경로 차단(라이너는 분석 딥색 또는 딥 기본색 유지).
expectEqual(lookColors?.eyeliner, undefined, 'eye guide color never washes the liner');
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
// 글로시 립 → 전용 글로스 톱코트 동반(플랜 없음 → 클리어 '#FFFFFF', 존은
// 결정 플랜 표준인 중앙 도트) + 프리셋 표준 소프트 립 경계.
expectEqual(guidedLook?.params.lipGlossIntensity, 0.5, 'glossy lip -> gloss topcoat on');
expectEqual(guidedLook?.params.lipGlossColor, '#FFFFFF', 'no plan hex -> clear gloss color');
expectEqual(guidedLook?.params.lipGlossFinish, 2, 'gloss topcoat glossy finish');
expectEqual(guidedLook?.params.lipGlossShape, 1, 'no zone cue -> center-dot gloss zone');
expectEqual(guidedLook?.params.lipEdgeFeather, 0.35, 'lip guide -> preset soft edge');
expectEqual(
  guidedLook?.params.blushColor,
  undefined,
  'regions without a guide stay out of params',
);
// eye 가이드 → 위+아래 두 밴드(아래 밴드가 늘 동반돼 반쪽 눈매를 막는다).
expectEqual(
  guidedLook?.eyeshadowLayers?.length,
  2,
  'eye guide -> upper and lower eyeshadow bands',
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
expectEqual(guidedLook?.eyeshadowLayers?.[1]?.surface, 1, 'lower band surface');
expectEqual(guidedLook?.eyeshadowLayers?.[1]?.profile, 6, 'lower band smoky profile');
expectEqual(
  guidedLook?.eyeshadowLayers?.[1]?.color,
  '#8A5A40',
  'no plan depth hex -> lower band falls back to guide color',
);
expectEqual(
  Math.abs((guidedLook?.eyeshadowLayers?.[1]?.intensity ?? 0) - 0.275) < 1e-9,
  true,
  'lower band at 0.5x of the upper intensity (anchor 0.55)',
);
expectEqual(guidedLook?.eyeshadowLayers?.[1]?.finish, 1, 'lower band matte finish');
expectEqual(
  typeof guidedLook?.params.eyelinerColor,
  'string',
  'eye guide keeps liner for definition',
);
expectEqual(
  guidedLook?.params.eyelinerColor === '#8A5A40',
  false,
  'liner is never the light eye guide color',
);
// 애교살은 언급 없어도 항상 동반한다(눈 가이드 기준).
expectEqual(guidedLook?.params.aegyoIntensity, 0.45, 'aegyo always rides along');
expectEqual(guidedLook?.params.aegyoFinish, 0, 'aegyo satin finish');
expectEqual(guidedLook?.label, '로지 밸런스', 'guided look label from title');

// ── applicationPlan role 색 채택 + 애교살 텍스트 신호 ───────────────────────
const planParams = getMakeupRecommendationStencilRouteParams(
  {
    arFilterId: 'filter-clean-smoky-city',
    role: 'anchor',
    title: '플랜 딥 룩',
    areaGuides: [
      {
        area: 'lip',
        color: {name: '로즈', hex: '#B03A48'},
        texture: '촉촉한 글로시',
        applicationPlan: {
          steps: [
            {title: '립글로스', colors: [{role: '광택', name: '글로우', hex: '#FFD9E0'}]},
          ],
        },
      } as never,
      {
        area: 'eye',
        color: {name: '웜 브라운', hex: '#8A5A40'},
        texture: '고운 음영',
        steps: [{order: 1, instruction: '애교살 포인트를 밝게 살린다'}],
        applicationPlan: {
          steps: [
            {title: '음영', colors: [{role: '깊이', name: '딥 브라운', hex: '#5C4A46'}]},
            {title: '라인', colors: [{role: '라인', name: '딥 라이너', hex: '#3A241E'}]},
          ],
        },
      } as never,
    ],
  },
);
const planLook = planParams.recommendedLook;
expectEqual(planLook?.params.lipGlossColor, '#FFD9E0', 'plan gloss role hex adopted');
// 플랜 '깊이' 색은 위 딥 포인트 밴드(눈꼬리 V)와 아래 밴드가 공유한다 —
// 무'베이스' 플랜이라 [메인, 위 딥, 아래] 3밴드.
expectEqual(planLook?.eyeshadowLayers?.length, 3, 'plan depth -> main+deep+lower bands');
expectEqual(planLook?.eyeshadowLayers?.[1]?.surface, 0, 'deep point band on upper lid');
expectEqual(planLook?.eyeshadowLayers?.[1]?.profile, 9, 'deep point band outer profile');
expectEqual(
  planLook?.eyeshadowLayers?.[1]?.color,
  '#5C4A46',
  'plan depth role hex -> upper deep band color',
);
expectEqual(planLook?.eyeshadowLayers?.[2]?.surface, 1, 'lower band stays last');
expectEqual(
  planLook?.eyeshadowLayers?.[2]?.color,
  '#5C4A46',
  'plan depth role hex -> lower band color',
);
expectEqual(planLook?.params.eyelinerColor, '#3A241E', 'deep plan line hex -> liner color');
expectEqual(planLook?.params.aegyoIntensity, 0.45, 'aegyo visible intensity');
expectEqual(planLook?.params.aegyoColor, '#F7E7CE', 'aegyo ivory pearl highlight color');
expectEqual(planLook?.params.aegyoFinish, 0, 'aegyo satin finish (max pigment)');

// 밝은 플랜 '라인' 색은 기각 — 라이너는 딥 기본색 유지.
const brightLinerParams = getMakeupRecommendationStencilRouteParams(
  {
    arFilterId: 'filter-clean-smoky-city',
    role: 'anchor',
    title: '밝은 라인 룩',
    areaGuides: [
      {
        area: 'eye',
        color: {name: '코랄', hex: '#E08A6B'},
        texture: '시머 코랄',
        applicationPlan: {
          steps: [
            {title: '라인', colors: [{role: '라인', name: '코랄 라인', hex: '#E08A6B'}]},
          ],
        },
      } as never,
    ],
  },
);
expectEqual(
  brightLinerParams.recommendedLook?.params.eyelinerColor === '#E08A6B',
  false,
  'bright plan line hex rejected (liner keeps deep color)',
);
