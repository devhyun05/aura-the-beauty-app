import type {StencilParams} from '../bridge/types';

/** 현재 룩 구성과 무관하게 Unity가 지원하는 모든 가이드 부위를 켠다. */
export function enableAllStencilRegions(base: StencilParams): StencilParams {
  return {
    ...base,
    lips: true,
    brows: true,
    eyeshadow: true,
    eyeliner: true,
    aegyo: true,
    blush: true,
    highlighter: true,
    contour: true,
  };
}
