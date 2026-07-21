import type {EyeshadowLayer, FilterParams} from '../stencil/src/bridge/types';
import type {StencilInitialLook} from '../stencil/stencilInitialLook';
import type {FullFaceMakeupEditState} from './fullFaceMakeupEditService';

// FullFaceRegionControl.finish 문자열 → 스텐실 FilterParams 마감 enum
// (0=새틴 1=매트 2=글로시 3=시머). 부위별 finish 옵션 문자열은
// REGION_FINISH_OPTIONS(fullFaceMakeupRecipe.ts)가 정본.
const LIP_FINISH_ENUM: Record<string, number> = {
  'natural-makeup': 1, // 추천의 매트 립은 립 옵션 중 가장 매트한 natural로 옴
  cream: 0,
  gloss: 2,
};

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
): EyeshadowLayer {
  return {
    surface: 0,
    profile: 0,
    shape: 0,
    color: control.colorHex,
    color2: control.colorHex,
    intensity: clamp(control.intensity, 0, 1),
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

/**
 * 추천 룩 편집 상태(부위별 색·마감·강도) → 스텐실(홈 "메이크업 필터") 시작 룩.
 * 스텐실 컴포저가 부위별 레이어로 분해해 편집·저장까지 일반 룩과 동일하게 다룬다.
 * 파운데이션은 스킨 세이프: 색은 넘기지 않고 스무딩/톤 정돈만 켠다.
 */
export function createRecommendedStencilLook(
  editState: FullFaceMakeupEditState,
  label = '추천 룩',
): StencilInitialLook {
  const {controls} = editState;
  const params: Partial<FilterParams> = {};

  if (controls.foundation.enabled) {
    params.skinSmoothing = 0.45;
    params.foundationIntensity = clamp(controls.foundation.intensity, 0, 0.6);
  }

  if (controls.lip.enabled) {
    params.lipColor = controls.lip.colorHex;
    params.lipIntensity = clamp(controls.lip.intensity * 0.6, 0.2, 0.8);
    params.lipFinish = LIP_FINISH_ENUM[controls.lip.finish] ?? 0;
  }

  if (controls.blush.enabled) {
    params.blushColor = controls.blush.colorHex;
    params.blushIntensity = clamp(controls.blush.intensity * 0.9, 0.25, 1.2);
    params.blushFinish = BLUSH_FINISH_ENUM[controls.blush.finish] ?? 0;
    if (controls.blush.finish === 'sheer-glow') {
      params.blushShimmer = clamp(controls.blush.shimmer, 0, 1);
    }
  }

  if (controls.brow.enabled) {
    params.browColor = controls.brow.colorHex;
    params.browIntensity = clamp(controls.brow.intensity + 0.1, 0.4, 1);
  }

  if (controls.eyeliner.enabled) {
    params.eyelinerColor = controls.eyeliner.colorHex;
    params.eyelinerIntensity = clamp(controls.eyeliner.intensity + 0.1, 0.5, 1);
  }

  return {
    label,
    params,
    eyeshadowLayers: controls.eyeshadow.enabled
      ? [buildEyeshadowLayer(controls.eyeshadow)]
      : [],
  };
}
