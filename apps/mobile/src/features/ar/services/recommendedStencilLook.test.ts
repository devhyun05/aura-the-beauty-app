import {createFullFaceMakeupRecipeFromEditState} from './fullFaceMakeupEditService';
import {createLookMakeupEditState} from './recommendedMakeupEditService';
import {createRecommendedStencilLook} from './recommendedStencilLook';

function expectEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(
      `${label}: expected ${String(expected)}, received ${String(actual)}`,
    );
  }
}

// 강도 산식(×0.6, ×1.3 등)의 부동소수 오차 허용 비교.
function expectClose(actual: number | undefined, expected: number, label: string) {
  if (actual === undefined || Math.abs(actual - expected) > 1e-9) {
    throw new Error(
      `${label}: expected ~${expected}, received ${String(actual)}`,
    );
  }
}

// 세부 레인이 전부 실리는 대표 룩: 글로시 립(플랜 '광택'·'안쪽 포인트') +
// 눈(플랜 '깊이'·'라인', 애교살 언급) + 치크(드레이핑 신호) + 눈썹(볼드 신호,
// 밝은 가이드 색). anchor role → 부위 강도 0.55.
const guidedState = createLookMakeupEditState({
  role: 'anchor',
  areaGuides: [
    {
      area: 'lip',
      color: {hex: '#B03A48'},
      texture: '촉촉한 글로시',
      applicationPlan: {
        steps: [
          {title: '그라데이션 깊이', colors: [{role: '안쪽 포인트', hex: '#8F2F3A'}]},
          {title: '립글로스', placement: '아랫입술 중앙 1/3과 윗입술 산 바로 아래만', colors: [{role: '광택', hex: '#FFD9E0'}]},
        ],
      },
    },
    {
      area: 'eye',
      color: {hex: '#8A5A40'},
      texture: '고운 음영',
      steps: [{instruction: '애교살 포인트를 밝게 살린다'}],
      applicationPlan: {
        steps: [
          {title: '베이스 정돈', colors: [{role: '베이스', hex: '#D5C5BC'}]},
          {title: '음영', colors: [{role: '깊이', hex: '#5C4A46'}]},
          {title: '라인', colors: [{role: '라인', hex: '#3A241E'}]},
        ],
      },
    },
    {
      area: 'cheek',
      color: {hex: '#E8A08F'},
      texture: '크림 블러셔',
      technique: '광대 위쪽에서 관자놀이 방향으로 쓸어 올려요',
    },
    {
      area: 'brow',
      color: {hex: '#F0E2D0'},
      texture: '두껍고 진한 볼드 눈썹',
    },
  ],
});

if (!guidedState) {
  throw new Error('guided edit state should build from areaGuides');
}

const lanedLook = createRecommendedStencilLook(guidedState, '레인 검증 룩');

// 립글로스 톱코트 — finish 'gloss' 게이트 + 플랜 색 + 존(중앙 도트: 결정 플랜
// '아랫입술 중앙 + 윗입술 산' 표준).
expectEqual(lanedLook.params.lipFinish, 2, 'glossy lip finish enum');
expectEqual(lanedLook.params.lipGlossIntensity, 0.5, 'gloss topcoat editor default');
expectEqual(lanedLook.params.lipGlossColor, '#FFD9E0', 'plan gloss hex on topcoat');
expectEqual(lanedLook.params.lipGlossFinish, 2, 'gloss topcoat glossy finish');
expectEqual(lanedLook.params.lipGlossShape, 1, 'plan center cue -> center-dot gloss zone');

// 립 본체 — 프리셋 표준 소프트 경계 + 플랜 '안쪽 포인트' 그라데.
expectEqual(lanedLook.params.lipEdgeFeather, 0.35, 'preset-standard soft lip edge');
expectEqual(lanedLook.params.lipColor2, '#8F2F3A', 'plan inner hex -> gradient core');
expectEqual(lanedLook.params.lipGradient, 0.75, 'preset-standard lip gradient');

// 블러셔 — 광 없이 매트 고정(질감이 크림이어도), 시머 게인 명시 0.
expectEqual(lanedLook.params.blushFinish, 1, 'blush always matte (no shine)');
expectEqual(lanedLook.params.blushShimmer, 0, 'blush shimmer gain explicitly cleared');

// 블러셔 모양 — 위로 쓸어 올리는 신호 → 드레이핑(2), lift/spread는 카탈로그 시드.
expectEqual(lanedLook.params.blushShape, 2, 'upward sweep cue -> draping blush shape');
expectEqual(lanedLook.params.blushLift, 0, 'blush lift from catalog seed');
expectEqual(lanedLook.params.blushSpread, 0, 'blush spread from catalog seed');

// 눈썹 — 눈썹룩 계약(레퍼런스 알파 browStyle 한 겹). 밝은 가이드 색(#F0E2D0,
// 휘도>0.65)은 라이트 브라운으로 스냅되고, '두껍/진한' 신호는 모양을 바꾸지 않고
// 두께 축(profile 3 · 1.15)과 강도(0.72)로 표현된다.
expectEqual(lanedLook.params.browStyleColor, '#8A6B52', 'light brow hex snapped to light brown');
expectEqual(lanedLook.params.browStyleTemplate, 8, 'soft-straight reference alpha template');
expectEqual(lanedLook.params.browShape, 1, 'brow shape state key for the composer UI');
expectEqual(lanedLook.params.browStyleIntensity, 0.72, 'defined cue -> stronger style intensity');
expectEqual(lanedLook.params.browThicknessProfile, 3, 'bold cue -> full coverage profile');
expectEqual(lanedLook.params.browThickness, 1.15, 'bold cue -> thicker band');
expectEqual(lanedLook.params.browLength, 1, 'brow length neutral');
expectEqual(lanedLook.params.browArch, 0.08, 'brow look baseline arch');
// 절차 축은 싣지 않는다 — 알파 마스크 위에 기하 밴드를 덧그리면 어긋나고, 잎이
// 2장이 되면 컴포저 눈썹 UI가 모양을 되읽지 못한다(BARE 명시 0으로 충분).
expectEqual(lanedLook.params.browColor, undefined, 'procedural brow tint not sent');
expectEqual(lanedLook.params.browIntensity, undefined, 'procedural brow intensity not sent');
expectEqual(lanedLook.params.browPowderIntensity, undefined, 'brow powder fill not sent');
expectEqual(lanedLook.params.browPencilIntensity, undefined, 'brow pencil not sent');
expectEqual(lanedLook.params.browLightenerIntensity, undefined, 'brow lightener not sent');

// 멀티밴드 스택 — [베이스 워시(높음)] → 메인 → [위 딥 포인트(낮음)] → [아래 밴드].
// index 0이 먼저 그려지고 뒤가 덮는 합성 계약이라 워시가 앞, 딥이 뒤.
expectEqual(lanedLook.eyeshadowLayers?.length, 4, 'full multiband stack');
const baseBand = lanedLook.eyeshadowLayers?.[0];
expectEqual(baseBand?.surface, 0, 'base wash surface explicit upper');
expectEqual(baseBand?.profile, 0, 'base wash full-lid profile');
expectEqual(baseBand?.color, '#D5C5BC', 'plan base hex on wash band');
expectEqual(baseBand?.height, 1, 'base wash matches main height (mask envelope scale)');
expectEqual(baseBand?.finish, 1, 'base wash matte finish');
expectClose(baseBand?.intensity, 0.33, 'base wash = main x0.6 (anchor 0.55)');
const mainBand = lanedLook.eyeshadowLayers?.[1];
expectEqual(mainBand?.surface, 0, 'main band surface');
expectEqual(mainBand?.color, '#8A5A40', 'main band keeps guide color');
expectClose(mainBand?.intensity, 0.55, 'main band role intensity unchanged');
const upperDeepBand = lanedLook.eyeshadowLayers?.[2];
expectEqual(upperDeepBand?.surface, 0, 'upper deep band stays on upper lid');
expectEqual(upperDeepBand?.profile, 9, 'upper deep band point profile (outer, lash-near)');
expectEqual(upperDeepBand?.color, '#5C4A46', 'plan depth hex on upper deep band');
expectEqual(upperDeepBand?.height, 0.9, 'upper deep band lower than main');
expectClose(upperDeepBand?.intensity, 0.715, 'upper deep = main x1.3 (anchor 0.55)');
const lowerBand = lanedLook.eyeshadowLayers?.[3];
expectEqual(lowerBand?.surface, 1, 'lower band surface');
expectEqual(lowerBand?.profile, 6, 'lower band smoky profile');
expectEqual(lowerBand?.shape, 6, 'lower band shape alias mirrors profile');
expectEqual(lowerBand?.color, '#5C4A46', 'plan depth hex on lower band');
expectEqual(lowerBand?.color2, '#5C4A46', 'lower band solid gradient stop');
expectClose(lowerBand?.intensity, 0.275, 'lower band = upper x0.5 (anchor 0.55)');
expectEqual(lowerBand?.finish, 1, 'lower band matte finish');
expectEqual(lowerBand?.height, 1.15, 'lower band height covers the applied depth');

// 섀도 실루엣 = 카탈로그 마스크 — URI 사이드채널 + params 임포트 마커가 짝이어야
// App reconcile이 setRegionMask를 보낸다(마커만 있으면 번들 스모키 고아 상태).
expectEqual(lanedLook.maskRefs?.length, 2, 'upper and lower catalog masks attached');
expectEqual(
  lanedLook.maskRefs?.[0]?.uri,
  'streaming:catalog/mask/eye_base.png',
  'upper mask uri (natural base pair)',
);
expectEqual(lanedLook.maskRefs?.[0]?.region, 'eyeshadow', 'upper mask slot');
expectEqual(
  lanedLook.maskRefs?.[1]?.uri,
  'streaming:catalog/mask/under_wash.png',
  'lower mask uri (full-length under wash)',
);
expectEqual(lanedLook.maskRefs?.[1]?.region, 'eyeshadowLower', 'lower mask slot');
expectEqual(lanedLook.params.eyeshadowMaskImported, 1, 'upper mask marker paired');
expectEqual(lanedLook.params.eyeshadowLowerMaskImported, 1, 'lower mask marker paired');

// 애교살 — 보이는 강도 + 새틴(매트는 밝은 피부에서 하이라이트를 어둡게 만든다).
expectEqual(lanedLook.params.aegyoIntensity, 0.45, 'aegyo visible intensity');
expectEqual(lanedLook.params.aegyoColor, '#F7E7CE', 'aegyo ivory pearl color');
expectEqual(lanedLook.params.aegyoFinish, 0, 'aegyo satin finish (max pigment)');
// 죽은 축은 싣지 않는다(셰이더 미참조).
expectEqual(lanedLook.params.aegyoHeight, undefined, 'dead height uniform not sent');
expectEqual(lanedLook.params.aegyoShimmer, undefined, 'dead shimmer uniform not sent');

// 아이라이너 — 플랜 '라인' 딥 색 채택, 강도식 불변(0.55+0.1).
expectEqual(lanedLook.params.eyelinerColor, '#3A241E', 'deep plan line hex on liner');
expectEqual(
  Math.abs((lanedLook.params.eyelinerIntensity ?? 0) - 0.65) < 1e-9,
  true,
  'liner intensity formula unchanged',
);
// 퍼피 드룹 — 절차 지오메트리(슬림+다운턴). 아트 도안 경로는 꺼져 있어야 한다
// (강도만 올리면 built-in 윙업 도안이 겹쳐 그려진다).
expectEqual(lanedLook.params.eyelinerHasGeometryProfiles, 1, 'geometry profiles enabled');
expectEqual(lanedLook.params.eyelinerTailProfile, 1, 'downturn tail profile (puppy droop)');
expectEqual(lanedLook.params.eyelinerThicknessProfile, 2, 'slim liner thickness profile');
expectEqual(lanedLook.params.eyelinerStyle, 1, 'legacy style fallback also puppy');
expectEqual(lanedLook.params.eyelinerStyleIntensity, 0, 'art decal path stays off');

// 캣아이 마스카라 — 절차 스타일 2. texStyle 0이어야 스타일이 무시되지 않는다.
expectEqual(lanedLook.params.mascaraStyle, 2, 'cat-eye mascara style');
expectEqual(lanedLook.params.mascaraTexStyle, 0, 'procedural path required for cat-eye');
expectClose(lanedLook.params.mascaraIntensity, 0.33, 'mascara intensity follows the look grade');
expectEqual(lanedLook.params.mascaraLength, 1.1, 'cat-eye length ramp');
expectEqual(lanedLook.params.mascaraColor, '#3A241E', 'mascara color matches liner');

// 금지 축 미설정 — aegyoStyle*(임포트 데칼 전용, 무텍스처 무렌더),
// lipGlossLo/Gain(립 메인 제형 필드), flat eyeshadowLower* 스칼라(V2 배열과
// 병존 시 compileLayers에서 유실되는 패턴).
const rawParams = lanedLook.params as Record<string, unknown>;
expectEqual(rawParams.aegyoStyleIntensity, undefined, 'aegyo style decal untouched');
expectEqual(rawParams.lipGlossLo, undefined, 'lip main finish detail untouched (lo)');
expectEqual(rawParams.lipGlossGain, undefined, 'lip main finish detail untouched (gain)');
expectEqual(rawParams.eyeshadowLowerIntensity, undefined, 'lower shadow rides the band, not flat scalar');
expectEqual(rawParams.eyeshadowLowerColor, undefined, 'no flat lower color scalar');

// 풍성 신호 → 모양(알파 에셋)은 그대로 두고 두께 축만 올라간다.
const fluffyState = createLookMakeupEditState({
  role: 'anchor',
  areaGuides: [{area: 'brow', color: {hex: '#4A3428'}, texture: '풍성한 일자 눈썹'}],
});
if (!fluffyState) throw new Error('fluffy brow state should build');
const fluffyLook = createRecommendedStencilLook(fluffyState, '풍성 눈썹');
expectEqual(fluffyLook.params.browStyleTemplate, 9, 'straight cue -> straight alpha template');
expectEqual(fluffyLook.params.browShape, 0, 'straight shape state key');
expectEqual(fluffyLook.params.browStyleIntensity, 0.62, 'baseline intensity without a defined cue');
expectEqual(fluffyLook.params.browStyleColor, '#4A3428', 'style texture carries the brow color');
expectEqual(fluffyLook.params.browThicknessProfile, 3, 'fluffy cue -> full coverage profile');
expectEqual(fluffyLook.params.browThickness, 1.1, 'fluffy cue -> slightly thicker band');

// 레인 없는 동일 상태(프리셋 폴백 형태) → 신규 축 전무·밴드 1장(기존 출력 보존).
const {lookLanes: _lanes, ...stateWithoutLanes} = guidedState;
const plainLook = createRecommendedStencilLook({...stateWithoutLanes}, '레인 없음');
expectEqual(plainLook.params.lipGlossIntensity, undefined, 'no lanes -> no gloss topcoat');
expectEqual(plainLook.params.aegyoIntensity, undefined, 'no lanes -> no aegyo');
expectEqual(plainLook.eyeshadowLayers?.length, 1, 'no lanes -> single upper band');
expectEqual(
  plainLook.params.eyelinerColor,
  guidedState.controls.eyeliner.colorHex,
  'no lanes -> liner color from controls',
);
expectEqual(plainLook.params.lipEdgeFeather, undefined, 'no lanes -> lip edge untouched');
expectEqual(plainLook.params.lipGradient, undefined, 'no lanes -> no lip gradient');
expectEqual(plainLook.params.blushShape, undefined, 'no lanes -> blush shape untouched');
expectEqual(plainLook.params.browStyleTemplate, undefined, 'no lanes -> brow style untouched');
expectEqual(plainLook.params.browThicknessProfile, undefined, 'no lanes -> brow profile untouched');
expectEqual(typeof plainLook.params.browIntensity, 'number', 'no lanes -> procedural brow path kept');

// 레시피 와이어 격리 — lookLanes는 ApplyRecipeJson 경로에 절대 실리지 않는다.
const recipeWithLanes = createFullFaceMakeupRecipeFromEditState(guidedState, 1000);
const recipeWithoutLanes = createFullFaceMakeupRecipeFromEditState(
  {...stateWithoutLanes},
  1000,
);
expectEqual(
  JSON.stringify(recipeWithLanes),
  JSON.stringify(recipeWithoutLanes),
  'lanes never reach the recipe wire',
);
