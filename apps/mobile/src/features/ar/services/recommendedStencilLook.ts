import type {EyeshadowLayer, FilterParams} from '../stencil/src/bridge/types';
import type {StencilInitialLook} from '../stencil/stencilInitialLook';
import type {
  FullFaceMakeupEditState,
  RecommendedLookLanes,
} from './fullFaceMakeupEditService';
import {getHexRelativeLuminance} from './recommendedMakeupEditService';

// 근백색 파스텔 강도 감쇠 — 엔진 틴트는 루마 보존 알파 합성이라 밝은 hex가
// 강도만큼 그대로 덧칠돼 흰 떡짐이 된다. 휘도 0.7까지는 무변조(밝은 베이스
// 섀도는 정당한 룩 요소), 초과분에 비례해 최대 절반까지 감쇠.
// 추천(lookLanes) 경로 전용 — 프리셋 폴백은 기존 출력 바이트 동일 유지.
// #RRGGBB 형식 밖 hex는 무변조(parseInt NaN이 강도로 전파되는 사고 방지).
function dampPastelIntensity(colorHex: string, intensity: number): number {
  if (!/^#[0-9a-fA-F]{6}$/.test(colorHex)) {
    return intensity;
  }
  const luminance = getHexRelativeLuminance(colorHex);
  if (luminance <= 0.7) {
    return intensity;
  }
  return intensity * (1 - Math.min((luminance - 0.7) / 0.3, 1) * 0.5);
}

// FullFaceRegionControl.finish 문자열 → 스텐실 FilterParams 마감 enum
// (0=새틴 1=매트 2=글로시 3=시머). 부위별 finish 옵션 문자열은
// REGION_FINISH_OPTIONS(fullFaceMakeupRecipe.ts)가 정본.
const LIP_FINISH_ENUM: Record<string, number> = {
  'natural-makeup': 1, // 추천의 매트 립은 립 옵션 중 가장 매트한 natural로 옴
  cream: 0,
  gloss: 2,
};

// 카탈로그 마스크 URI — 'streaming:' 스킴은 Unity ImageFileLoader가 StreamingAssets
// 절대경로로 푼다(프리셋 eyeMask 헬퍼와 동일 규약).
const catalogMaskUri = (file: string) => `streaming:catalog/mask/${file}.png`;

// 추천 룩 블러셔는 광 없이 매트 고정 — 룩 질감이 글로시·크림이어도 볼의 광은
// 하이라이터가 담당한다(블러셔 광은 유분처럼 보인다는 판정). 0=새틴 1=매트 2=글로시.
const BLUSH_MATTE_FINISH = 1;

// 프리셋 폴백 경로용 마감 매핑(큐레이션 컨셉 보존) — 추천 룩은 위 매트 고정을 쓴다.
const BLUSH_FINISH_ENUM: Record<string, number> = {
  'soft-powder': 1,
  'cream-blush': 0,
  'sheer-glow': 2,
};

const EYESHADOW_FINISH_ENUM: Record<string, number> = {
  satin: 0,
  matte: 1,
  gloss: 2,
  shimmer: 3,
};

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.min(Math.max(value, min), max);
}

function buildEyeshadowLayer(
  control: FullFaceMakeupEditState['controls']['eyeshadow'],
  dampPastel: boolean,
): EyeshadowLayer {
  const baseIntensity = clamp(control.intensity, 0, 1);
  return {
    surface: 0,
    profile: 0,
    shape: 0,
    color: control.colorHex,
    color2: control.colorHex,
    intensity: dampPastel
      ? dampPastelIntensity(control.colorHex, baseIntensity)
      : baseIntensity,
    finish: EYESHADOW_FINISH_ENUM[control.finish] ?? 0,
    gradient: clamp(control.gradientAmount, 0, 1),
    height: clamp(control.params.coverage ?? 1, 0.6, 1.6),
    shimmer: clamp(control.shimmer, 0, 1),
    texture: -1,
    glossLo: 0,
    glossGain: 0,
    shimmerSize: 0,
    shimmerDensity: 0,
    matte: 0,
    sheen: 0,
    particleSize: 0,
    particleDensity: 0,
  };
}

// 위 섀도 다층(멀티밴드) — 눈 플랜의 층(베이스 넓게·높게 → 메인 → 깊이는
// 눈꼬리 바깥·속눈썹 근처)을 EyeshadowLayerV2 스택으로 번역한다.
// 합성 계약: index 0이 먼저 그려지고 뒤 밴드가 over로 덮으며, 모든 밴드는
// lash에 앵커되고 height는 위쪽 끝 cutoff다 — 키 큰 워시를 앞(index 0)에,
// 낮은 딥을 뒤에 두면 lash 근처는 딥이 이기고 그 위엔 워시만 남는 그라데가 된다.
// 위 전용 밴드는 surface 0 명시(생략+role 'base'면 컴포저가 2=양쪽으로 기본화).
// 높이 설계(0.9/1.0/1.3)는 최소 cutoff 0.69 > 페더 0.45 — 작은 밴드가 통째로
// 페더에 먹히는 함정 회피.

// 베이스 워시 — 플랜 '베이스'(매트 베이스 아이섀도, 눈두덩 전체) 대응.
function buildBaseWashLayer(
  control: FullFaceMakeupEditState['controls']['eyeshadow'],
  baseColorHex: string,
): EyeshadowLayer {
  return {
    surface: 0,
    profile: 0,
    shape: 0,
    color: baseColorHex,
    color2: baseColorHex,
    intensity: dampPastelIntensity(
      baseColorHex,
      clamp(control.intensity * 0.6, 0.25, 0.45),
    ),
    finish: 1, // 매트(플랜 '매트 베이스')
    gradient: 0,
    // 메인과 같은 높이 — 위 마스크 게이트가 봉투(전 밴드 최대 height) 기준으로
    // 샘플되므로, 여기만 높이면 마스크 실루엣이 그만큼 위로 늘어나 같은 마스크가
    // 검증 룩보다 크게 그려지고, 정작 늘어난 구간은 마스크가 0에 수렴해 안 보인다.
    height: 1,
    shimmer: 0,
    texture: -1,
    glossLo: 0,
    glossGain: 0,
    shimmerSize: 0,
    shimmerDensity: 0,
    matte: 0,
    sheen: 0,
    particleSize: 0,
    particleDensity: 0,
  };
}

// 위 딥 포인트 — 플랜 '깊이'(눈꼬리 바깥 V + 위 라인 바깥 1/3) 대응.
// profile 9(포인트) = 하부 절반 집중 + 바깥 u 창 — 플랜 서술과 정확히 일치.
function buildUpperDeepLayer(
  control: FullFaceMakeupEditState['controls']['eyeshadow'],
  deepColorHex: string,
): EyeshadowLayer {
  return {
    surface: 0,
    profile: 9,
    shape: 9,
    color: deepColorHex,
    color2: deepColorHex,
    // 결정 플랜의 '깊이'는 항상 딥 파생색이지만, LLM 보존 플랜은 밝은 hex도
    // 가능하므로 파스텔 감쇠를 일관 적용한다(딥 색은 무변조 통과).
    intensity: dampPastelIntensity(
      deepColorHex,
      clamp(control.intensity * 1.3, 0.55, 0.85),
    ),
    finish: 1, // 매트(플랜 '딥 매트')
    gradient: 0,
    height: 0.9,
    shimmer: 0,
    texture: -1,
    glossLo: 0,
    glossGain: 0,
    shimmerSize: 0,
    shimmerDensity: 0,
    matte: 0,
    sheen: 0,
    particleSize: 0,
    particleDensity: 0,
  };
}

// 아래(하안검) 밴드 — 위 밴드와 같은 눈 가이드에서 파생. surface 1 + profile 6
// (마스크 모드). 실루엣은 함께 싣는 카탈로그 under_* 마스크가 소유한다 — 마스크가
// 없으면 번들 lower_smoky_mask로 폴백되는데 눈머리쪽 30%가 비어 있어 언더가
// 거의 안 보인다(그래서 maskRefs와 마커를 항상 짝으로 싣는다).
// 강도는 위 밴드의 절반, 검증 범위(smoky 프리셋 0.18 ~ 마스크 룩 0.5)로 클램프.
// 주의: flat eyeshadowLower* 스칼라를 params에 싣는 패턴은 V2 배열이 있으면
// compileLayers에서 유실되므로(legacy 승격 조건 미충족) 반드시 밴드로 싣는다.
function buildLowerEyeshadowLayer(
  control: FullFaceMakeupEditState['controls']['eyeshadow'],
  lowerShadow: NonNullable<RecommendedLookLanes['lowerShadow']>,
): EyeshadowLayer {
  const colorHex = lowerShadow.colorHex ?? control.colorHex;
  return {
    surface: 1,
    profile: 6,
    shape: 6,
    color: colorHex,
    color2: colorHex,
    // 강도 근거: 언더 마스크(전 폭 초승달)의 최고 밀도 구간이 애교살 하이라이트
    // 능선과 같은 행에 얹히기 때문에, 여기서 더 올리면 밝은 피부에서 애교살이
    // 상쇄돼 오히려 어두워진다(합성 실측). 카탈로그 마스크로 커버 면적이 2~3배
    // 넓어진 만큼 강도는 위 밴드의 0.5배로 절제한다.
    intensity: dampPastelIntensity(colorHex, clamp(control.intensity * 0.5, 0.25, 0.5)),
    finish: 1,
    gradient: 0,
    height: 1.15,
    shimmer: 0,
    texture: -1,
    glossLo: 0,
    glossGain: 0,
    shimmerSize: 0,
    shimmerDensity: 0,
    matte: 0,
    sheen: 0,
    particleSize: 0,
    particleDensity: 0,
  };
}

/**
 * 추천 룩 편집 상태(부위별 색·마감·강도) → 스텐실(홈 "메이크업 필터") 시작 룩.
 * 스텐실 컴포저가 부위별 레이어로 분해해 편집·저장까지 일반 룩과 동일하게 다룬다.
 * 파운데이션은 스킨 세이프: 색은 넘기지 않고 스무딩/톤 정돈만 켠다.
 * lookLanes(추천 전용 세부 레인)가 있으면 립글로스·아래 섀도·애교살·라이너 딥
 * 색까지 함께 싣는다 — 프리셋 폴백 editState(lookLanes 없음)는 기존과 동일 출력.
 */
export function createRecommendedStencilLook(
  editState: FullFaceMakeupEditState,
  label = '추천 룩',
): StencilInitialLook {
  const {controls, lookLanes: lanes} = editState;
  const params: Partial<FilterParams> = {};

  if (controls.foundation.enabled) {
    params.skinSmoothing = 0.45;
    params.foundationIntensity = clamp(controls.foundation.intensity, 0, 0.6);
  }

  if (controls.lip.enabled) {
    const lipIntensity = clamp(controls.lip.intensity * 0.6, 0.2, 0.8);
    params.lipColor = controls.lip.colorHex;
    params.lipIntensity = lanes
      ? dampPastelIntensity(controls.lip.colorHex, lipIntensity)
      : lipIntensity;
    params.lipFinish = LIP_FINISH_ENUM[controls.lip.finish] ?? 0;
    if (lanes?.lipStyle) {
      // 프리셋 표준 소프트 경계(전 프리셋 0.35) — BARE 0(선명 경계)은 프리셋과
      // 확연히 달라 보이는 원인. 플랜 '안쪽 포인트' 딥 색이 있으면 그라데 립
      // (안쪽 진하게, 프리셋 표준 gradient 0.75)까지 복원.
      params.lipEdgeFeather = lanes.lipStyle.edgeFeather;
      if (lanes.lipStyle.innerColorHex) {
        params.lipColor2 = lanes.lipStyle.innerColorHex;
        params.lipGradient = 0.75;
      }
    }
    if (lanes?.lipGloss && controls.lip.finish === 'gloss') {
      // 글로시 립 = 전용 글로스 톱코트 동반(lipFinish=2 셰이더 분기만으론 하이라이트
      // 레이어가 안 뜬다). 0.5=편집 UI 켜기 기본. 색은 항상 명시 — 빈 값이면 Unity가
      // SetColor를 스킵해 직전 룩 틴트가 잔존한다. lipGlossLo/lipGlossGain은 립 메인
      // 제형 필드라 여기서 설정 금지.
      params.lipGlossIntensity = 0.5;
      params.lipGlossColor = lanes.lipGloss.colorHex;
      params.lipGlossFinish = 2;
      params.lipGlossShape = lanes.lipGloss.shape;
    }
  }

  if (controls.blush.enabled) {
    const blushIntensity = clamp(controls.blush.intensity * 0.9, 0.25, 1.2);
    params.blushColor = controls.blush.colorHex;
    params.blushIntensity = lanes
      ? dampPastelIntensity(controls.blush.colorHex, blushIntensity)
      : blushIntensity;
    // 추천 룩은 광 없는 매트 고정 + 시머 게인 명시 0(BARE 기본이 0.5라 생략하면
    // 남는다). 프리셋 폴백은 큐레이션 마감('쉬어 글로우' 등)을 그대로 존중한다.
    if (lanes) {
      params.blushFinish = BLUSH_MATTE_FINISH;
      params.blushShimmer = 0;
    } else {
      params.blushFinish = BLUSH_FINISH_ENUM[controls.blush.finish] ?? 0;
      if (controls.blush.finish === 'sheer-glow') {
        params.blushShimmer = clamp(controls.blush.shimmer, 0, 1);
      }
    }
    if (lanes?.blushShape) {
      // 위치·기법 텍스트에서 파생한 모양 — lift/spread는 카탈로그 시드값을 함께
      // 실어 이전 룩의 배치 오프셋이 새 마스크를 밀지 않게 한다(blushTree 패턴).
      params.blushShape = lanes.blushShape.value;
      params.blushLift = lanes.blushShape.lift;
      params.blushSpread = lanes.blushShape.spread;
    }
  }

  if (controls.brow.enabled) {
    if (lanes?.brow) {
      // 눈썹룩(sys:var:brow:*)과 1:1 — 레퍼런스 알파 browStyle 잎 한 겹. 절차
      // 축(browColor/browIntensity·파우더·펜슬·라이트너)은 싣지 않는다: 알파
      // 마스크 위에 기하 밴드를 덧그려 어긋나고, 잎이 2장이 되면 컴포저 눈썹 UI가
      // 모양을 되읽지 못한다. BARE가 그 축들을 명시 0으로 담고 있어 생략으로 충분.
      // browShape/browThicknessProfile/browArch는 BARE에 없어 반드시 명시(생략 시
      // Unity 기본 0 → 커버리지 모드 off로 프리셋과 다른 세로 크롭).
      params.browStyleColor = controls.brow.colorHex;
      params.browStyleIntensity = lanes.brow.styleIntensity;
      params.browStyleTemplate = lanes.brow.styleTemplate;
      params.browShape = lanes.brow.shape;
      params.browThicknessProfile = lanes.brow.thicknessProfile;
      params.browThickness = lanes.brow.thickness;
      params.browLength = 1;
      params.browArch = lanes.brow.arch;
    } else {
      // 프리셋 폴백 — 큐레이션 필터는 모양 신호가 없어 기존 절차 경로를 유지한다.
      params.browColor = controls.brow.colorHex;
      params.browIntensity = clamp(controls.brow.intensity + 0.1, 0.4, 1);
    }
  }

  if (controls.eyeliner.enabled) {
    // 플랜 '라인' 딥 색이 있으면 우선 — 눈매 정의는 저휘도 색이어야 보인다.
    const linerColorHex = lanes?.eyelinerColorHex ?? controls.eyeliner.colorHex;
    params.eyelinerColor = linerColorHex;
    params.eyelinerIntensity = clamp(controls.eyeliner.intensity + 0.1, 0.5, 1);
    // 라이너 실루엣·속눈썹은 추천 룩(lanes)에서만 — 프리셋 폴백 경로는 큐레이션된
    // 컨셉(예: '얇은 아이라인', '쉬어 글로우')을 갖고 있고 장식색이 라이너 색이라
    // 그 색이 마스카라로 승격되면 분홍 속눈썹 같은 사고가 난다.
    if (lanes) {
      // 기본은 퍼피 드룹(절차 지오메트리: 슬림 두께 + 다운턴 꼬리 -22°). 다만 룩이
      // 눈꼬리를 올리는 실루엣(캣·아웃터 마스크 페어)을 골랐으면 라이너도 올려
      // 맞춘다 — 같은 룩에서 섀도는 올라가고 라이너만 처지는 모순 방지.
      // 카탈로그 아트 도안(liner_puppy 등)은 setEyelinerStyle URI 사이드채널이라
      // 주입 경로(flat params)로 못 보낸다(강도만 올리면 built-in 윙업 도안이 뜬다).
      // 검증 조합: 시스템 룩 'art-puppy-droop' / 'art-cat-long'(lookVariants).
      const catEyeCue = lanes.shadowMask?.upper === 'eye_outer_wide';
      params.eyelinerHasGeometryProfiles = 1;
      params.eyelinerThicknessProfile = catEyeCue ? 4 : 2; // 바깥 볼드 / 슬림
      params.eyelinerTailProfile = catEyeCue ? 4 : 1; // 롱 업 / 다운턴
      params.eyelinerStyle = catEyeCue ? 0 : 1; // 지오메트리 미적용 시 legacy 폴백
      params.eyelinerTexture = 1; // 젤
      // 아트 도안 경로는 끈다 — 별 렌더러·별 큐라 절차 라이너와 이중으로 그려진다.
      params.eyelinerStyleIntensity = 0;

      // 캣아이 마스카라 — 절차 스타일 2(앞머리까지 눈꼬리로 눕히고 꼬리 길이 램프).
      // mascaraTexStyle>0이면 텍스처 리본 경로로 갈아타며 mascaraStyle이 통째로
      // 무시되므로 반드시 0. 강도는 부위 시드 게이트(onKeys=mascaraIntensity)라
      // >0으로 함께 싣되 룩 등급을 따른다(내추럴 프리셋 0.28~0.34, 스모키 0.5).
      params.mascaraColor = linerColorHex;
      params.mascaraIntensity = clamp(controls.eyeliner.intensity * 0.6, 0.28, 0.5);
      params.mascaraStyle = 2;
      params.mascaraLength = 1.1;
      params.mascaraTexStyle = 0;
    }
  }

  if (lanes?.aegyo) {
    // 새틴(0) 고정 — 매트(1)는 밝은 픽셀에서 색소를 깎아(계수 0.71까지) 밝은
    // 피부에서는 애교살 하이라이트가 피부보다 어두워진다(같은 조건 새틴 +9.9/255
    // vs 매트 −12.6/255). aegyoShimmer·aegyoHeight는 셰이더가 참조하지 않는 죽은 축.
    params.aegyoIntensity = lanes.aegyo.intensity;
    params.aegyoColor = lanes.aegyo.colorHex;
    params.aegyoFinish = lanes.aegyo.finish;
  }

  // 밴드 스택 조립 — 순서: [베이스 워시(높음)] → 메인 → [위 딥 포인트(낮음)] →
  // [아래 밴드](관례상 lower는 맨 뒤; Unity가 surface로 분리해 subset 내 순서만
  // 유의미). 베이스·딥은 플랜 role 색이 있을 때만 동반 — 무플랜 룩은 기존
  // 1~2밴드 그대로. 총 밴드 ≤4(계약 상한 8, 권장 2~4).
  const eyeshadowLayers: EyeshadowLayer[] = [];
  if (controls.eyeshadow.enabled) {
    if (lanes?.upperBaseColorHex) {
      eyeshadowLayers.push(
        buildBaseWashLayer(controls.eyeshadow, lanes.upperBaseColorHex),
      );
    }
    eyeshadowLayers.push(buildEyeshadowLayer(controls.eyeshadow, Boolean(lanes)));
    if (lanes?.lowerShadow?.colorHex) {
      eyeshadowLayers.push(
        buildUpperDeepLayer(controls.eyeshadow, lanes.lowerShadow.colorHex),
      );
    }
    if (lanes?.lowerShadow) {
      eyeshadowLayers.push(
        buildLowerEyeshadowLayer(controls.eyeshadow, lanes.lowerShadow),
      );
    }
  }

  // 섀도 실루엣 = 카탈로그 마스크(§16). URI는 사이드채널로, 임포트 마커는 params로
  // — 둘이 짝이어야 App reconcile이 setRegionMask를 보낸다. 마커만 있고 URI가 없으면
  // 아래 밴드가 번들 스모키 실루엣(눈머리 30% 비어 있음)으로 남는 고아 상태가 된다.
  const maskRefs: NonNullable<StencilInitialLook['maskRefs']> = [];
  if (controls.eyeshadow.enabled && lanes?.shadowMask) {
    maskRefs.push(
      {region: 'eyeshadow', uri: catalogMaskUri(lanes.shadowMask.upper)},
      {region: 'eyeshadowLower', uri: catalogMaskUri(lanes.shadowMask.lower)},
    );
    params.eyeshadowMaskImported = 1;
    params.eyeshadowLowerMaskImported = 1;
  }

  return {
    label,
    params,
    eyeshadowLayers,
    ...(maskRefs.length > 0 ? {maskRefs} : {}),
  };
}
