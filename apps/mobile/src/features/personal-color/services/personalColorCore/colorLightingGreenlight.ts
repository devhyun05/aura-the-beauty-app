// 촬영 시점 조명 게이트 (순수). 실시간 스트림은 랜드마크 + cameraMetadata만 주고
// per-frame 픽셀이 없으므로 조명은 iso/노출/WB gain/adjusting 프록시로만 추론 → 반드시 soft.
//
// HARD-block(최소·자기해소): awb_ae_not_settled 하나뿐. AE/AWB가 수렴 안 한 상태에서
//   셔터 락을 걸면 전이 중 값이 얼려지므로 차단. ~1초 내 자기해소 → 데드엔드 불가.
// SOFT-warn(계측·비차단): too_dark / too_bright / strong_color_cast. 실내 웜광이 흔해
//   색조 캐스트로 차단하면 대부분 막히고, 상대 프레이밍이 이미 이를 흡수한다.
//
// NOTE: 계획서의 위치(face-capture/services)와 달리 여기(personalColorCore)에 둔다 —
// 순수 함수라 기존 tsc 러너로 검증 가능하게 하기 위함. 화면은 여기서 import.

// 필드는 RealtimeCameraStabilityPayload와 구조 호환(전부 optional). whiteBalanceGains는
// 평탄 r/g/b가 아닌 객체이며 각 채널도 optional, isStable은 boolean|number(숫자 플래그 가능).
export type ColorLightingMetadata = {
  iso?: number;
  exposureDurationMs?: number;
  whiteBalanceGains?: { red?: number; green?: number; blue?: number };
  adjustingWhiteBalance?: boolean;
  adjustingExposure?: boolean;
  adjustingFocus?: boolean;
  isStable?: boolean | number;
};

export type ColorLightingReport = {
  finalColorGreenlight: boolean;
  hardBlockClear: boolean;
  lightingWarnings: string[];
  metrics: {
    iso: number | null;
    exposureDurationMs: number | null;
    wbRatioRG: number | null;
    wbRatioBG: number | null;
    adjusting: boolean;
  };
  message: string | null;
};

// 임계값 — calibration target. Phase 7 전까지 어떤 soft도 hard로 승격 금지.
export const COLOR_LIGHTING_THRESHOLDS = {
  isoDark: 800, // 이보다 높으면 too_dark 경고
  isoBright: 40, // 이보다 낮고 노출 짧으면 too_bright
  exposureShortMs: 4,
  // AVCaptureDevice deviceWhiteBalanceGains는 green=1.0 기준 대략 1.0~4.0 범위.
  // 정상 실내/주광은 red≈1.6~2.2, blue≈1.5~2.3. 극단 캐스트에만 반응하도록 넓게.
  castRgLow: 0.6,
  castRgHigh: 2.4,
  castBgLow: 0.6,
  castBgHigh: 2.6,
} as const;

const HARD_BLOCK_MESSAGE = '카메라가 밝기·화이트밸런스를 맞추는 중이에요. 잠시 그대로 있어 주세요.';

export function evaluateColorLightingGreenlight(meta: ColorLightingMetadata): ColorLightingReport {
  // HARD-block은 AE/AWB 미수렴만(≈1초 자기해소). focus hunting은 저대비/역광에서
  // 장시간 지속될 수 있어 데드엔드 위험 → 제외한다. 카메라 흔들림(isStable)은 base
  // greenlight가 이미 담당하므로 색 게이트에서 중복으로 막지 않는다.
  const adjusting = !!meta.adjustingWhiteBalance || !!meta.adjustingExposure;
  const hardBlockClear = !adjusting;

  const warnings: string[] = [];
  const iso = typeof meta.iso === 'number' ? meta.iso : null;
  const exp = typeof meta.exposureDurationMs === 'number' ? meta.exposureDurationMs : null;

  if (iso != null && iso > COLOR_LIGHTING_THRESHOLDS.isoDark) {
    warnings.push('too_dark');
  }
  if (
    iso != null &&
    iso < COLOR_LIGHTING_THRESHOLDS.isoBright &&
    exp != null &&
    exp < COLOR_LIGHTING_THRESHOLDS.exposureShortMs
  ) {
    warnings.push('too_bright');
  }

  let wbRatioRG: number | null = null;
  let wbRatioBG: number | null = null;
  const gains = meta.whiteBalanceGains;
  if (
    gains &&
    typeof gains.green === 'number' &&
    gains.green > 0 &&
    typeof gains.red === 'number' &&
    typeof gains.blue === 'number'
  ) {
    wbRatioRG = gains.red / gains.green;
    wbRatioBG = gains.blue / gains.green;
    const rgOut =
      wbRatioRG < COLOR_LIGHTING_THRESHOLDS.castRgLow || wbRatioRG > COLOR_LIGHTING_THRESHOLDS.castRgHigh;
    const bgOut =
      wbRatioBG < COLOR_LIGHTING_THRESHOLDS.castBgLow || wbRatioBG > COLOR_LIGHTING_THRESHOLDS.castBgHigh;
    if (rgOut || bgOut) {
      warnings.push('strong_color_cast');
    }
  }

  return {
    finalColorGreenlight: hardBlockClear, // soft 경고는 차단하지 않음
    hardBlockClear,
    lightingWarnings: warnings,
    metrics: { iso, exposureDurationMs: exp, wbRatioRG, wbRatioBG, adjusting },
    message: hardBlockClear ? null : HARD_BLOCK_MESSAGE,
  };
}
